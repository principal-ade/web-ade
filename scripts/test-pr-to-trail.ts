/**
 * Test: GitHub PR URL → File City review trail via OpenRouter.
 *
 * Usage:
 *   npx tsx scripts/test-pr-to-trail.ts <pr-url> [--repo-path /abs/path]
 *
 * Examples:
 *   npx tsx scripts/test-pr-to-trail.ts https://github.com/anomalyco/opencode/pull/26268
 *
 * What it does:
 *   1. Fetches the PR's metadata + files via `gh api`.
 *   2. Fetches each changed file's old (base SHA) and new (head SHA) contents.
 *   3. Asks OpenRouter (free-model cycle) to author marker/view *judgment* fields
 *      only — id, label, sourcePath, description, line windows, lane name, edges.
 *   4. Splices in oldContents/newContents deterministically, validates the schema,
 *      and POSTs to the local Principal MCP Bridge at http://localhost:3044.
 *
 * Why split judgment from content: the model decides ordering, lane names,
 * descriptions, and which lines matter; the script handles file content so the
 * model can't hallucinate it.
 */

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import crypto from 'crypto';

// ---------- env loading ----------
function loadEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([^=]+)=(.*)$/);
      if (m?.[1] && m[2] !== undefined) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[m[1].trim()] = v;
      }
    }
  } catch {
    // file missing is fine
  }
  return env;
}

const envLocal = loadEnvFile(resolve(process.cwd(), '.env.local'));
const OPENROUTER_API_KEY = envLocal.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY not found in .env.local or environment.');
  process.exit(1);
}

// ---------- args ----------
const args = process.argv.slice(2);
const prUrl = args.find((a) => !a.startsWith('--'));
const repoPathArg = (() => {
  const i = args.indexOf('--repo-path');
  return i >= 0 ? args[i + 1] : undefined;
})();

if (!prUrl) {
  console.error('Usage: npx tsx scripts/test-pr-to-trail.ts <pr-url> [--repo-path /abs/path]');
  process.exit(1);
}

const prMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
if (!prMatch) {
  console.error('Could not parse owner/repo/number from PR URL:', prUrl);
  process.exit(1);
}
const [, owner, repo, prNumber] = prMatch as [string, string, string, string];

// ---------- gh helpers ----------
function gh(path: string): string {
  return execFileSync('gh', ['api', path], { maxBuffer: 50 * 1024 * 1024 }).toString();
}

function ghJson<T>(path: string): T {
  return JSON.parse(gh(path)) as T;
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

function fetchFileAtRef(path: string, ref: string): string {
  // /repos/{o}/{r}/contents/{path}?ref={sha} returns base64-encoded content
  try {
    const encoded = encodeURIComponent(path);
    const data = ghJson<{ content?: string; encoding?: string }>(
      `/repos/${owner}/${repo}/contents/${encoded}?ref=${ref}`
    );
    if (!data.content) return '';
    return Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64').toString('utf-8');
  } catch {
    // file may not exist at that ref (added/removed); return empty
    return '';
  }
}

// ---------- OpenRouter ----------
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'z-ai/glm-4.5-air:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
] as const;

interface ORResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callOpenRouter(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://web-ade.dev',
      'X-Title': 'PR-to-Trail Test',
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
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as ORResponse;
  if (data.error) throw new Error(data.error.message ?? 'unknown error');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');
  return content;
}

async function callWithCycle<T>(
  messages: Array<{ role: string; content: string }>,
  parse: (text: string) => T,
): Promise<{ value: T; model: string; raw: string }> {
  let lastErr: unknown;
  for (const model of OPENROUTER_MODELS) {
    try {
      console.log(`[trail] trying model: ${model}`);
      const text = await callOpenRouter(model, messages);
      try {
        const value = parse(text);
        console.log(`[trail] success with ${model}`);
        return { value, model, raw: text };
      } catch (parseErr) {
        console.warn(`[trail] ${model} returned unparseable JSON (${(parseErr as Error).message.slice(0, 120)}); first 200 chars: ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
        lastErr = parseErr;
        continue;
      }
    } catch (e) {
      console.warn(`[trail] ${model} failed: ${(e as Error).message.slice(0, 200)}`);
      lastErr = e;
    }
  }
  throw new Error(`all models failed; last: ${String(lastErr)}`);
}

// ---------- prompt ----------
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
  const fileSummaries = files.map((f) => {
    const patch = f.patch ?? '(no patch — likely binary or too large)';
    return `### ${f.filename}\nstatus: ${f.status} (+${f.additions} -${f.deletions})\n\n\`\`\`diff\n${patch}\n\`\`\``;
  }).join('\n\n');

  return `PR: ${meta.title}
Base: ${meta.base.ref}@${meta.base.sha.slice(0, 7)}  →  Head: ${meta.head.ref}@${meta.head.sha.slice(0, 7)}
Total: +${meta.additions} -${meta.deletions} across ${meta.changed_files} file(s)

PR description:
${meta.body ?? '(none)'}

Changed files (unified diff):

${fileSummaries}`;
}

// ---------- main ----------
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
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned) as ModelOutput;
}

async function main() {
  console.log(`[trail] PR ${owner}/${repo}#${prNumber}`);
  const meta = ghJson<PrMeta>(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const files = ghJson<PrFile[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`);
  console.log(`[trail] ${files.length} changed file(s); base=${meta.base.sha.slice(0, 7)} head=${meta.head.sha.slice(0, 7)}`);

  const userPrompt = buildUserPrompt(meta, files);
  console.log(`[trail] prompt length: ${userPrompt.length} chars`);

  const { value: parsed, model } = await callWithCycle(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    parseModelJson,
  );

  console.log(`[trail] model produced ${parsed.markers.length} markers`);

  // Fetch old/new contents for every sourcePath the model picked.
  const contentCache = new Map<string, { old: string; new: string }>();
  for (const marker of parsed.markers) {
    if (contentCache.has(marker.sourcePath)) continue;
    console.log(`[trail] fetching contents for ${marker.sourcePath}`);
    const oldC = fetchFileAtRef(marker.sourcePath, meta.base.sha);
    const newC = fetchFileAtRef(marker.sourcePath, meta.head.sha);
    contentCache.set(marker.sourcePath, { old: oldC, new: newC });
  }

  // Build trail payload.
  const trailMarkers = parsed.markers.map((m) => {
    const contents = contentCache.get(m.sourcePath) ?? { old: '', new: '' };
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

  // Validate marker id references in view.
  const markerIds = new Set(trailMarkers.map((m) => m.id));
  for (const v of parsed.view.markers) {
    if (!markerIds.has(v.markerId)) {
      throw new Error(`view references unknown markerId: ${v.markerId}`);
    }
  }
  for (const e of parsed.view.edges) {
    if (!markerIds.has(e.fromEvent) || !markerIds.has(e.toEvent)) {
      throw new Error(`edge references unknown marker: ${e.fromEvent} -> ${e.toEvent}`);
    }
  }

  const trailId = `pr-${owner}-${repo}-${prNumber}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const payload = {
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
        ...(parsed.view.laneOrder ? { layout: { laneOrder: parsed.view.laneOrder } } : {}),
      },
    ],
    createdAt: now,
    updatedAt: now,
    repositoryPath: repoPathArg,
  };

  console.log(`[trail] POST → http://localhost:3044/api/file-city/trail (id=${trailId})`);
  const resp = await fetch('http://localhost:3044/api/file-city/trail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const respText = await resp.text();
  if (!resp.ok) {
    console.error('[trail] bridge rejected payload:', resp.status, respText);
    process.exit(1);
  }
  console.log('[trail] bridge response:', respText);
  console.log(`[trail] done. model=${model}  markers=${trailMarkers.length}  trailId=${trailId}`);
}

main().catch((err) => {
  console.error('[trail] FAILED:', err);
  process.exit(1);
});
