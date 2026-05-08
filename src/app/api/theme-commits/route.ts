/**
 * Theme Commits API Endpoint
 *
 * Clusters recent commits into 2-4 emergent themes using an LLM.
 * Prototype: model returns themes referencing commit indices; we map
 * indices back to SHAs server-side to avoid hallucinated identifiers.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getOpenRouterClient, MissingOpenRouterKeyError } from '@/lib/openrouter';

interface CommitInput {
  sha: string;
  message: string;
  author?: string;
}

interface Theme {
  title: string;
  summary: string;
  shas: string[];
}

interface ThemeResponse {
  themes: Theme[];
  model?: string;
  cached?: boolean;
}

const themeCache = new Map<string, { themes: Theme[]; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — themes evolve faster than per-commit explanations

// Same-model parse-retry budget. The meta-router may pick a JSON-shy free
// model on a given call; rerolling sometimes lands on a stricter one.
const PARSE_RETRY_LIMIT = 2;

function getCacheKey(commits: CommitInput[], repoName: string): string {
  const shas = commits.map((c) => c.sha).sort().join(',');
  return crypto.createHash('sha256').update(`${repoName}::${shas}`).digest('hex');
}

function buildPrompt(commits: CommitInput[], repoName: string): string {
  const numbered = commits
    .map((c, i) => `${i + 1}. ${c.message.split('\n')[0]}${c.author ? ` — ${c.author}` : ''}`)
    .join('\n');

  return `You are analyzing recent commits in the repository "${repoName}" to identify 2-4 high-level themes of work currently in progress.

COMMITS:
${numbered}

Group these commits into 2-4 emergent themes. Each theme should represent a coherent body of work (e.g. "Auth middleware rewrite", "File City performance", "New onboarding flow"). Prefer specific, descriptive titles over generic categories like "Bug fixes" or "Refactoring".

Output ONLY valid JSON in this exact shape, no prose, no markdown fences:
{
  "themes": [
    {
      "title": "short descriptive title (max 6 words)",
      "summary": "one sentence on what this work is about",
      "commits": [1, 3, 7]
    }
  ]
}

Rules:
- Reference commits by their number from the list above.
- Every commit should appear in at most one theme.
- Skip commits that don't fit any coherent theme — don't force them in.
- Return between 2 and 4 themes.`;
}

interface ParsedLLMTheme {
  title?: string;
  summary?: string;
  commits?: unknown;
}

function extractJson(text: string): string | null {
  // Strip code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1]! : text;
  // Find first { and last }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function parseThemes(raw: string, commits: CommitInput[]): Theme[] | null {
  const json = extractJson(raw);
  if (!json) return null;

  let parsed: { themes?: ParsedLLMTheme[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!parsed.themes || !Array.isArray(parsed.themes)) return null;

  const themes: Theme[] = [];
  for (const t of parsed.themes) {
    if (!t || typeof t.title !== 'string') continue;
    const indices = Array.isArray(t.commits) ? t.commits : [];
    const shas: string[] = [];
    for (const idx of indices) {
      const n = typeof idx === 'number' ? idx : parseInt(String(idx), 10);
      if (!Number.isFinite(n)) continue;
      const commit = commits[n - 1];
      if (commit) shas.push(commit.sha);
    }
    if (shas.length === 0) continue;
    themes.push({
      title: t.title.slice(0, 80),
      summary: typeof t.summary === 'string' ? t.summary.slice(0, 200) : '',
      shas,
    });
  }

  return themes.length > 0 ? themes : null;
}

export async function POST(req: NextRequest) {
  let openrouter;
  try {
    openrouter = getOpenRouterClient();
  } catch (e) {
    if (e instanceof MissingOpenRouterKeyError) {
      return Response.json({ error: e.message }, { status: 500 });
    }
    throw e;
  }

  const body = (await req.json()) as { commits?: CommitInput[]; repoName?: string };
  const commits = body.commits ?? [];
  const repoName = body.repoName ?? 'repository';

  if (commits.length < 3) {
    return Response.json({ themes: [] } satisfies ThemeResponse);
  }

  const cacheKey = getCacheKey(commits, repoName);
  const cached = themeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log('[theme-commits] Cache hit');
    return Response.json({ themes: cached.themes, cached: true } satisfies ThemeResponse);
  }

  const prompt = buildPrompt(commits, repoName);
  let themes: Theme[] | null = null;
  let usedModel: string | undefined;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < PARSE_RETRY_LIMIT; attempt++) {
    let content: string;
    let model: string;
    try {
      const result = await openrouter.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        appTitle: 'Web ADE Commit Themes',
        temperature: 0.4,
        maxTokens: 800,
      });
      content = result.content;
      model = result.model;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error('[theme-commits] OpenRouter call failed:', lastError);
      break;
    }

    const parsed = parseThemes(content, commits);
    if (parsed) {
      themes = parsed;
      usedModel = model;
      break;
    }
    lastError = 'Failed to parse themes from model output';
    console.warn(`[theme-commits] Parse failed (attempt ${attempt + 1}, model ${model}); raw: ${content.slice(0, 200)}`);
  }

  if (!themes) {
    return Response.json(
      { error: 'Failed to generate themes', details: lastError },
      { status: 500 }
    );
  }

  themeCache.set(cacheKey, { themes, timestamp: Date.now() });
  console.log(`[theme-commits] Generated ${themes.length} themes with ${usedModel}`);

  return Response.json({ themes, model: usedModel } satisfies ThemeResponse);
}
