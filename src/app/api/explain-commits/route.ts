/**
 * Explain Commits API Endpoint
 *
 * Generates AI-powered explanations of commits for different audience levels.
 * Caches responses to avoid redundant API calls.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getOpenRouterClient, MissingOpenRouterKeyError } from '@/lib/openrouter';

// Simple in-memory cache (persists across requests in the same server instance)
const explanationCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(commits: CommitData[], audienceLevel: string, repoName: string): string {
  const data = JSON.stringify({ commits, audienceLevel, repoName });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getFromCache(key: string): string | null {
  const entry = explanationCache.get(key);
  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    explanationCache.delete(key);
    return null;
  }

  return entry.text;
}

function setCache(key: string, text: string): void {
  explanationCache.set(key, { text, timestamp: Date.now() });
}

interface CommitData {
  sha: string;
  message: string;
  author: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

interface ExplainRequest {
  commits: CommitData[];
  audienceLevel: 'maintainer' | 'non-technical';
  repoName: string;
}

function buildPrompt(commits: CommitData[], audienceLevel: string, repoName: string): string {
  const commitsSummary = commits.map((c, i) => {
    let summary = `${i + 1}. "${c.message}" by ${c.author}`;
    if (c.additions !== undefined || c.deletions !== undefined) {
      const parts = [];
      if (c.additions) parts.push(`+${c.additions}`);
      if (c.deletions) parts.push(`-${c.deletions}`);
      if (c.filesChanged) parts.push(`${c.filesChanged} files`);
      if (parts.length > 0) summary += ` (${parts.join(', ')})`;
    }
    return summary;
  }).join('\n');

  if (audienceLevel === 'maintainer') {
    return `Summarize these commits from ${repoName} for a technical maintainer.

COMMITS:
${commitsSummary}

Write a brief technical summary (under 200 words) covering:
- What changed (features, fixes, refactors)
- Architectural implications
- Things to watch out for

Start directly with the summary. No greetings.`;
  } else {
    return `Summarize these commits from ${repoName} for a non-technical person.

COMMITS:
${commitsSummary}

Write a simple, friendly summary (under 150 words) explaining:
- What improved or changed for users
- Any new features or bug fixes in plain language

Start directly with the summary. No greetings or preamble.`;
  }
}

export async function POST(req: NextRequest) {
  let openrouter;
  try {
    openrouter = getOpenRouterClient();
  } catch (e) {
    if (e instanceof MissingOpenRouterKeyError) {
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw e;
  }

  try {
    const { commits, audienceLevel, repoName } = await req.json() as ExplainRequest;

    if (!commits || commits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No commits provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(commits, audienceLevel, repoName);
    const cachedText = getFromCache(cacheKey);

    if (cachedText) {
      console.log('[explain-commits] Cache hit');
      return streamSse(cachedText, true);
    }

    console.log('[explain-commits] Cache miss, calling OpenRouter');
    const prompt = buildPrompt(commits, audienceLevel, repoName);

    let text: string;
    try {
      const { content, model } = await openrouter.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        appTitle: 'Web ADE Commit Explainer',
        temperature: 0.7,
        maxTokens: 512,
      });
      text = content;
      console.log(`[explain-commits] Generated with ${model}`);
    } catch (e) {
      console.error('[explain-commits] OpenRouter call failed:', e);
      return new Response(
        JSON.stringify({
          error: 'Failed to generate explanation',
          details: e instanceof Error ? e.message : String(e),
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    setCache(cacheKey, text);
    console.log('[explain-commits] Cached response');

    return streamSse(text, false);
  } catch (error) {
    console.error('Explain commits error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function streamSse(text: string, cached: boolean): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'done', ...(cached ? { cached: true } : {}) })}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
