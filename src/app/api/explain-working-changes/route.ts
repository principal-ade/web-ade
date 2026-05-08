/**
 * Explain Working Changes API Endpoint
 *
 * Generates AI-powered explanations of a repository's current working-tree
 * (uncommitted) changes for different audience levels. Sibling of
 * /api/explain-commits — same caching, model fallback, and SSE response
 * shape; the prompt describes a file-change list instead of a commit list.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getOpenRouterClient, MissingOpenRouterKeyError } from '@/lib/openrouter';

const explanationCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type WorkingChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

interface WorkingChangeData {
  path: string;
  status: WorkingChangeStatus;
  additions?: number;
  deletions?: number;
  staged: boolean;
}

interface ExplainRequest {
  changes: WorkingChangeData[];
  audienceLevel: 'maintainer' | 'non-technical';
  repoName: string;
  branch?: string;
}

function getCacheKey(
  changes: WorkingChangeData[],
  audienceLevel: string,
  repoName: string,
  branch: string | undefined,
): string {
  const data = JSON.stringify({ changes, audienceLevel, repoName, branch });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getFromCache(key: string): string | null {
  const entry = explanationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    explanationCache.delete(key);
    return null;
  }
  return entry.text;
}

function setCache(key: string, text: string): void {
  explanationCache.set(key, { text, timestamp: Date.now() });
}

function buildPrompt(
  changes: WorkingChangeData[],
  audienceLevel: string,
  repoName: string,
  branch: string | undefined,
): string {
  const changesSummary = changes
    .map((c, i) => {
      const tags: string[] = [c.status];
      if (c.staged) tags.push('staged');
      let line = `${i + 1}. ${c.path} [${tags.join(', ')}]`;
      const parts: string[] = [];
      if (c.additions) parts.push(`+${c.additions}`);
      if (c.deletions) parts.push(`-${c.deletions}`);
      if (parts.length > 0) line += ` (${parts.join(', ')})`;
      return line;
    })
    .join('\n');

  const branchContext = branch ? ` on branch \`${branch}\`` : '';

  if (audienceLevel === 'maintainer') {
    return `Summarize these uncommitted working-tree changes from ${repoName}${branchContext} for a technical maintainer.

CHANGES:
${changesSummary}

Write a brief technical summary (under 200 words) covering:
- What the developer appears to be working on right now (features, fixes, refactors)
- Which files are staged vs. still unstaged
- Anything noteworthy in the file paths (tests, migrations, config, secrets)

Start directly with the summary. No greetings.`;
  }

  return `Summarize these work-in-progress changes from ${repoName}${branchContext} for a non-technical person.

CHANGES:
${changesSummary}

Write a simple, friendly summary (under 150 words) explaining:
- What the developer is currently working on
- What might improve for users when this lands

Start directly with the summary. No greetings or preamble.`;
}

function streamResponse(text: string, cached: boolean): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`),
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'done', ...(cached ? { cached: true } : {}) })}\n\n`),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(req: NextRequest) {
  let openrouter;
  try {
    openrouter = getOpenRouterClient();
  } catch (e) {
    if (e instanceof MissingOpenRouterKeyError) {
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw e;
  }

  try {
    const { changes, audienceLevel, repoName, branch } =
      (await req.json()) as ExplainRequest;

    if (!changes || changes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No changes provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const cacheKey = getCacheKey(changes, audienceLevel, repoName, branch);
    const cachedText = getFromCache(cacheKey);

    if (cachedText) {
      console.log('[explain-working-changes] Cache hit');
      return streamResponse(cachedText, true);
    }

    console.log('[explain-working-changes] Cache miss, calling OpenRouter');
    const prompt = buildPrompt(changes, audienceLevel, repoName, branch);

    let text: string;
    try {
      const { content, model } = await openrouter.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        appTitle: 'Web ADE Working Changes Explainer',
        temperature: 0.7,
        maxTokens: 512,
      });
      text = content;
      console.log(`[explain-working-changes] Generated with ${model}`);
    } catch (e) {
      console.error('[explain-working-changes] OpenRouter call failed:', e);
      return new Response(
        JSON.stringify({
          error: 'Failed to generate explanation',
          details: e instanceof Error ? e.message : String(e),
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    setCache(cacheKey, text);
    console.log('[explain-working-changes] Cached response');

    return streamResponse(text, false);
  } catch (error) {
    console.error('Explain working changes error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
