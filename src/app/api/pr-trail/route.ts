/**
 * Experimental: GitHub-PR-URL → File City review trail.
 *
 *   GET /api/pr-trail?owner=<o>&repo=<r>&num=<n>
 *
 * Reads the caller's GitHub token from cookies (falls back to public access),
 * fetches the PR head SHA, then either returns the in-memory cache for that
 * SHA or generates a fresh trail via OpenRouter and caches it.
 *
 * The cache lives for the process lifetime — restart the dev server to clear.
 * Generated payloads are never written to S3; this route is intentionally
 * separate from /api/trails (the production sharing surface).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/request';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { ShareErrorCodes } from '@/lib/trails/types';
import {
  generateTrailFromPr,
  getPrHeadSha,
  type GenerateTrailResult,
} from '@/lib/pr-trail/generate';
import { getCachedByPr, setCached } from '@/lib/pr-trail/cache';
import { getOpenRouterClient, MissingOpenRouterKeyError } from '@/lib/openrouter';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const numStr = url.searchParams.get('num');

  if (!owner || !repo || !numStr) {
    return NextResponse.json(
      { error: 'owner, repo, and num query params are required' },
      { status: 400 },
    );
  }
  const num = Number(numStr);
  if (!Number.isInteger(num) || num <= 0) {
    return NextResponse.json({ error: 'num must be a positive integer' }, { status: 400 });
  }

  let openrouterClient;
  try {
    openrouterClient = getOpenRouterClient();
  } catch (e) {
    if (e instanceof MissingOpenRouterKeyError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    throw e;
  }

  const githubToken = await getGitHubToken();

  // Explicit repo-access gate — matches /api/trails/by-id and the rest of
  // the trails routes. Public repos return access info even with a null
  // token; private repos require a token with read access.
  const access = await checkRepoAccess(owner, repo, githubToken);
  if (!access) {
    return NextResponse.json(
      {
        error: 'No read access to this repository',
        code: ShareErrorCodes.NO_REPO_ACCESS,
      },
      { status: 403 },
    );
  }

  let headSha: string;
  try {
    headSha = await getPrHeadSha(owner, repo, num, githubToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes('GitHub 404') ? 404 : 502;
    return NextResponse.json({ error: `Failed to resolve PR: ${msg}` }, { status });
  }

  const hit = getCachedByPr(owner, repo, num, headSha);
  if (hit) {
    return NextResponse.json({
      owner,
      repo,
      num,
      cached: true,
      model: hit.model,
      headSha: hit.headSha,
      generatedAt: hit.generatedAt,
      payload: hit.payload,
    });
  }

  let result: GenerateTrailResult;
  try {
    result = await generateTrailFromPr({
      owner,
      repo,
      prNumber: num,
      openrouterClient,
      githubToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Trail generation failed: ${msg}` },
      { status: 502 },
    );
  }

  const entry = {
    owner,
    repo,
    prNumber: num,
    payload: result.payload,
    model: result.model,
    headSha: result.headSha,
    generatedAt: Date.now(),
  };
  setCached(entry);

  return NextResponse.json({
    owner,
    repo,
    num,
    cached: false,
    model: entry.model,
    headSha: entry.headSha,
    generatedAt: entry.generatedAt,
    payload: entry.payload,
  });
}
