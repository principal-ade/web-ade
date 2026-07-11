/**
 * GET /api/repo-analysis/[owner]/[repo]/ownership?cursor=0&limit=50
 *
 * Serves paginated person-keyed file ownership data. The client pages
 * through all persons eagerly (not lazily on hover) to feed the 3D
 * highlight system.
 *
 * Reads from the same S3 blob as the main GET endpoint. The personOwnership
 * map is ordered to match the precomputedContributors array (lines-desc).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRepoAnalysisFromS3 } from '@/lib/repo-analysis/s3-cache';
import { needsTransform, transformAnalysis } from '@/lib/repo-analysis/transform';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_LIMIT = 50;
/** Cap well under Amplify's ~6 MB response ceiling. On torvalds/linux, limit=100
 *  is already ~5.4 MB for the densest head of the list; 200 413s. */
const MAX_LIMIT = 50;

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

  // Ensure the transform has been run (same lazy pattern as the main GET)
  if (needsTransform(cached.analysis)) {
    // The main GET handler should have already transformed and persisted,
    // but handle the edge case where this endpoint is hit first.
    try {
      const transformed = transformAnalysis(cached.analysis, {});
      cached.analysis.precomputedContributors = transformed.precomputedContributors;
      cached.analysis.personOwnership = transformed.personOwnership;
    } catch (err) {
      console.error('[Repo Analysis Ownership] transform failed:', err);
      return NextResponse.json(
        { error: 'Transform not yet available — try the main GET endpoint first' },
        { status: 503 },
      );
    }
  }

  const personOwnership = cached.analysis.personOwnership ?? {};
  const contributors = cached.analysis.precomputedContributors ?? [];

  // Build the ordered list of person keys matching the contributor list order
  const keys = contributors.map((c) => c.key);
  const total = keys.length;

  // Slice the page
  const pageKeys = keys.slice(cursor, cursor + limit);
  const page = pageKeys.map((key) => ({
    key,
    ownership: personOwnership[key] ?? {},
  }));

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
