/**
 * GET /api/repo-analysis/[owner]/[repo]/contributors?cursor=0&limit=200
 *
 * Paginated person-keyed contributor list (precomputedContributors). The main
 * analysis GET only ships a head of this list so mega-repos stay under the
 * Amplify response ceiling; the client pages the rest here.
 *
 * Order matches the full precomputed list (lines owned desc) and the
 * /ownership endpoint's person key order.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRepoAnalysisFromS3 } from '@/lib/repo-analysis/s3-cache';
import { needsTransform, transformAnalysis } from '@/lib/repo-analysis/transform';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const cursor = Math.max(0, parseInt(req.nextUrl.searchParams.get('cursor') ?? '0', 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  const cached = await getRepoAnalysisFromS3(owner, repo);
  if (!cached) {
    return NextResponse.json({ error: `No cached analysis for ${owner}/${repo}` }, { status: 404 });
  }

  if (needsTransform(cached.analysis)) {
    try {
      const transformed = transformAnalysis(cached.analysis, {});
      cached.analysis.precomputedContributors = transformed.precomputedContributors;
      cached.analysis.personOwnership = transformed.personOwnership;
    } catch (err) {
      console.error('[Repo Analysis Contributors] transform failed:', err);
      return NextResponse.json(
        { error: 'Transform not yet available — try the main GET endpoint first' },
        { status: 503 },
      );
    }
  }

  const contributors = cached.analysis.precomputedContributors ?? [];
  const total = contributors.length;
  const page = contributors.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < total ? cursor + limit : null;

  return NextResponse.json({
    owner,
    repo,
    sha: cached.sha,
    cursor,
    limit,
    total,
    nextCursor,
    page,
  });
}
