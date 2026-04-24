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

const explanationCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const OPENROUTER_MODELS = [
  'google/gemini-3.1-flash-lite-preview',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-3.1-flash-image-preview',
] as const;

const rateLimitedModels = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

function getAvailableModels(): string[] {
  const now = Date.now();
  return OPENROUTER_MODELS.filter((model) => {
    const rateLimitedUntil = rateLimitedModels.get(model);
    if (!rateLimitedUntil) return true;
    if (now > rateLimitedUntil) {
      rateLimitedModels.delete(model);
      return true;
    }
    return false;
  });
}

function markModelRateLimited(model: string, retryAfterSeconds?: number): void {
  const cooldown = retryAfterSeconds ? retryAfterSeconds * 1000 : RATE_LIMIT_COOLDOWN_MS;
  rateLimitedModels.set(model, Date.now() + cooldown);
  console.log(`[explain-working-changes] Model ${model} rate limited, cooldown: ${cooldown}ms`);
}

function parseRetryAfter(errorText: string): number | undefined {
  const match = errorText.match(/retry in ([\d.]+)s/i);
  if (match && match[1]) {
    return Math.ceil(parseFloat(match[1]));
  }
  return undefined;
}

interface OpenRouterApiResult {
  success: boolean;
  text?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  error?: string;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: number };
}

async function callOpenRouterApi(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<OpenRouterApiResult> {
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://web-ade.dev',
        'X-Title': 'Web ADE Working Changes Explainer',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(errorText);
        return {
          success: false,
          rateLimited: true,
          retryAfterSeconds: retryAfter,
          error: errorText,
        };
      }
      return { success: false, error: errorText };
    }

    const data = (await response.json()) as OpenRouterResponse;
    if (data.error) {
      return { success: false, error: data.error.message || 'Unknown error' };
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      return { success: false, error: 'No content in response' };
    }
    return { success: true, text };
  } catch (error) {
    return { success: false, error: String(error) };
  }
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
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
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

    console.log('[explain-working-changes] Cache miss, calling OpenRouter API');
    const prompt = buildPrompt(changes, audienceLevel, repoName, branch);

    const availableModels = getAvailableModels();
    if (availableModels.length === 0) {
      console.error('[explain-working-changes] All models are rate limited');
      return new Response(
        JSON.stringify({
          error: 'All AI models are currently rate limited. Please try again in a minute.',
          retryAfter: 60,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let lastError: string | undefined;
    let text: string | undefined;
    let usedModel: string | undefined;

    for (const model of availableModels) {
      console.log(`[explain-working-changes] Trying model: ${model}`);
      const result = await callOpenRouterApi(model, prompt, apiKey);

      if (result.success && result.text) {
        text = result.text;
        usedModel = model;
        console.log(`[explain-working-changes] Success with model: ${model}`);
        break;
      }

      if (result.rateLimited) {
        markModelRateLimited(model, result.retryAfterSeconds);
        lastError = result.error;
        continue;
      }

      console.error(`[explain-working-changes] Model ${model} error:`, result.error);
      lastError = result.error;
    }

    if (!text) {
      console.error('[explain-working-changes] All models failed, last error:', lastError);
      return new Response(
        JSON.stringify({
          error: 'Failed to generate explanation',
          details: lastError,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[explain-working-changes] Generated with ${usedModel}`);
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
