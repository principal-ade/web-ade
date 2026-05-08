/**
 * Server-side PR-to-trail generation.
 *
 * Mirrors scripts/test-pr-to-trail.ts but uses the GitHub REST API directly
 * (no `gh` shell-out) so it runs inside Next.js routes.
 *
 * Flow:
 *   1. Fetch PR meta + changed files via GitHub.
 *   2. Send the unified diffs to OpenRouter; ask it to return ONLY marker
 *      and view *judgment* fields (id, label, sourcePath, description, line
 *      windows, lane name, edges) — no file contents.
 *   3. Cycle through free models on rate-limit / parse failure.
 *   4. Fetch each picked sourcePath at base + head SHA, splice the contents
 *      into snippet.oldContents / snippet.newContents.
 *   5. Validate marker-id references in the view block, return TrailPayload.
 *
 * Splitting judgment from content keeps the model from hallucinating file
 * bodies and saves a lot of tokens on big PRs.
 */

import crypto from 'crypto';
import type { TrailPayload } from '@industry-theme/file-city-panel';

// ---------- OpenRouter ----------

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Free-tier OpenRouter models, ordered by judgment-quality / JSON-stability
// observed in scripts/test-pr-to-trail.ts. The cycle continues on HTTP error,
// rate-limit, empty response, or unparseable JSON output.
const OPENROUTER_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'z-ai/glm-4.5-air:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
] as const;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callOpenRouter(
  model: string,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://web-ade.dev',
      'X-Title': 'web-ade PR Trail',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as OpenRouterResponse;
  if (data.error) throw new Error(data.error.message ?? 'unknown error');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');
  return content;
}

async function callWithCycle<T>(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  parse: (text: string) => T,
): Promise<{ value: T; model: string }> {
  let lastErr: unknown;
  for (const model of OPENROUTER_MODELS) {
    try {
      const text = await callOpenRouter(model, apiKey, messages);
      try {
        const value = parse(text);
        return { value, model };
      } catch (parseErr) {
        lastErr = new Error(
          `${model} unparseable JSON: ${(parseErr as Error).message.slice(0, 120)}`,
        );
        continue;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`all models failed; last: ${String(lastErr)}`);
}

// ---------- GitHub REST ----------

const GITHUB_API_BASE = 'https://api.github.com';

function ghHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'web-ade-pr-trail/1.0',
  };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

interface PrMeta {
  base: { sha: string; ref: string };
  head: { sha: string; ref: string };
  title: string;
  body: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

interface PrFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

async function ghJson<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, { headers: ghHeaders(token) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub ${res.status} on ${path}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function fetchFileAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string | null,
): Promise<string> {
  const encoded = encodeURIComponent(path);
  try {
    const data = await ghJson<{ content?: string; encoding?: string }>(
      `/repos/${owner}/${repo}/contents/${encoded}?ref=${ref}`,
      token,
    );
    if (!data.content) return '';
    return Buffer.from(
      data.content,
      (data.encoding as BufferEncoding) ?? 'base64',
    ).toString('utf-8');
  } catch {
    // file may not exist at that ref (added or removed); return empty
    return '';
  }
}

// ---------- Prompt ----------

const SYSTEM_PROMPT = `You are authoring a "review trail" for the File City visualizer — a sequence of clickable markers, one per meaningful change region in a pull request, that walk a reviewer through the diff in story order.

Your job: read the PR diff and return ONLY a JSON object describing markers and the sequence view. Do NOT include file contents — those will be spliced in deterministically.

Output schema (return EXACTLY this JSON, no markdown fences):
{
  "title": "short PR title",
  "summary": "4-10 line markdown overview: what the PR does, headline risks, suggested reading order",
  "markers": [
    {
      "id": "kebab-or-dotted-stable-id",
      "label": "short human title (file or function: what changed)",
      "sourcePath": "exact repo-relative path from the diff",
      "description": "2-6 markdown sentences answering WHY (the bug, constraint, or rationale). Don't restate WHAT — the diff shows that.",
      "startLine": 1,
      "endLine": 30,
      "focusLine": 12,
      "language": "typescript"
    }
  ],
  "view": {
    "markers": [
      { "markerId": "<id>", "name": "review.<segment>.<segment>", "participant": "optional explicit lane override" }
    ],
    "edges": [
      { "id": "e1", "fromEvent": "<markerId-a>", "toEvent": "<markerId-b>", "label": "then" }
    ],
    "laneOrder": ["optional", "left-to-right", "lane", "names"]
  }
}

Rules:
- Group hunks that belong to the same logical change in a file into ONE marker. A 200-line PR yields 5–15 markers, not one per hunk.
- Order markers so the reviewer builds intuition — entry point or highest-risk change first, cleanup last.
- Use stable dotted "name" namespacing (e.g. "review.provider.gpt5.effort", "review.test.gpt5-variants") so related changes stack into the same lane. The first dotted segment is the lane.
- Line numbers are 1-based against the NEW (post-change) file. startLine ≤ focusLine ≤ endLine. Keep windows tight — 10–30 lines per marker; split bigger regions.
- Skip pure formatting, lockfile churn, or generated files unless load-bearing.
- Edges form a single linear chain unless the review legitimately branches.
- All marker ids referenced from view.markers and view.edges MUST exist in markers[].
- sourcePath must be exactly what the diff shows (repo-relative, no leading slash).

Return ONLY the JSON object.`;

function buildUserPrompt(meta: PrMeta, files: PrFile[]): string {
  const fileSummaries = files
    .map((f) => {
      const patch = f.patch ?? '(no patch — likely binary or too large)';
      return `### ${f.filename}\nstatus: ${f.status} (+${f.additions} -${f.deletions})\n\n\`\`\`diff\n${patch}\n\`\`\``;
    })
    .join('\n\n');

  return `PR: ${meta.title}
Base: ${meta.base.ref}@${meta.base.sha.slice(0, 7)}  →  Head: ${meta.head.ref}@${meta.head.sha.slice(0, 7)}
Total: +${meta.additions} -${meta.deletions} across ${meta.changed_files} file(s)

PR description:
${meta.body ?? '(none)'}

Changed files (unified diff):

${fileSummaries}`;
}

// ---------- Model output (judgment-only) ----------

interface ModelOutput {
  title: string;
  summary: string;
  markers: Array<{
    id: string;
    label: string;
    sourcePath: string;
    description: string;
    startLine: number;
    endLine: number;
    focusLine?: number;
    language?: string;
  }>;
  view: {
    markers: Array<{ markerId: string; name: string; participant?: string }>;
    edges: Array<{ id: string; fromEvent: string; toEvent: string; label?: string }>;
    laneOrder?: string[];
  };
}

function parseModelJson(text: string): ModelOutput {
  // Tolerate accidental ```json fences if a model ignores response_format.
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  return JSON.parse(cleaned) as ModelOutput;
}

// ---------- Public API ----------

export interface GenerateTrailInput {
  owner: string;
  repo: string;
  prNumber: number;
  openrouterApiKey: string;
  /** GitHub token. May be null for public-repo unauthenticated access (low rate). */
  githubToken: string | null;
}

export interface GenerateTrailResult {
  payload: TrailPayload;
  model: string;
  headSha: string;
}

export async function generateTrailFromPr(
  input: GenerateTrailInput,
): Promise<GenerateTrailResult> {
  const { owner, repo, prNumber, openrouterApiKey, githubToken } = input;

  const meta = await ghJson<PrMeta>(
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    githubToken,
  );
  const files = await ghJson<PrFile[]>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    githubToken,
  );

  const userPrompt = buildUserPrompt(meta, files);

  const { value: parsed, model } = await callWithCycle(
    openrouterApiKey,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    parseModelJson,
  );

  // Fetch old/new contents in parallel for every unique sourcePath the model picked.
  const uniquePaths = Array.from(new Set(parsed.markers.map((m) => m.sourcePath)));
  const contentEntries = await Promise.all(
    uniquePaths.map(async (path) => {
      const [oldC, newC] = await Promise.all([
        fetchFileAtRef(owner, repo, path, meta.base.sha, githubToken),
        fetchFileAtRef(owner, repo, path, meta.head.sha, githubToken),
      ]);
      return [path, { old: oldC, new: newC }] as const;
    }),
  );
  const contentByPath = new Map(contentEntries);

  const trailMarkers = parsed.markers.map((m) => {
    const contents = contentByPath.get(m.sourcePath) ?? { old: '', new: '' };
    return {
      id: m.id,
      label: m.label,
      sourcePath: m.sourcePath,
      description: m.description,
      snippet: {
        kind: 'diff' as const,
        oldContents: contents.old,
        newContents: contents.new,
        startLine: m.startLine,
        endLine: m.endLine,
        focusLine: m.focusLine ?? m.startLine,
        diffStyle: 'unified' as const,
        language: m.language,
      },
    };
  });

  // Validate cross-references — a model that invents marker ids in the view
  // block produces a payload that won't render anything.
  const markerIds = new Set(trailMarkers.map((m) => m.id));
  for (const v of parsed.view.markers) {
    if (!markerIds.has(v.markerId)) {
      throw new Error(`view references unknown markerId: ${v.markerId}`);
    }
  }
  for (const e of parsed.view.edges) {
    if (!markerIds.has(e.fromEvent) || !markerIds.has(e.toEvent)) {
      throw new Error(
        `edge references unknown marker: ${e.fromEvent} -> ${e.toEvent}`,
      );
    }
  }

  const trailId = `pr-${owner}-${repo}-${prNumber}-${meta.head.sha.slice(0, 7)}-${crypto
    .randomBytes(2)
    .toString('hex')}`;
  const now = new Date().toISOString();

  const payload: TrailPayload = {
    id: trailId,
    title: parsed.title || meta.title,
    kind: 'pr-walkthrough',
    summary: parsed.summary,
    authoredAt: { sha: meta.head.sha, ref: meta.head.ref },
    markers: trailMarkers,
    views: [
      {
        kind: 'sequence',
        markers: parsed.view.markers,
        edges: parsed.view.edges,
        ...(parsed.view.laneOrder
          ? { layout: { laneOrder: parsed.view.laneOrder } }
          : {}),
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  return { payload, model, headSha: meta.head.sha };
}

/** Fetch only the head SHA — used to compute a cache key without paying for generation. */
export async function getPrHeadSha(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken: string | null,
): Promise<string> {
  const meta = await ghJson<{ head: { sha: string } }>(
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    githubToken,
  );
  return meta.head.sha;
}
