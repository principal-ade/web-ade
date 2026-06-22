/**
 * GET /api/trails/repos
 *
 * Lists every public repo that has at least one trail. Backs the
 * `/explore` page. Reads each per-repo `index.json`, filters on the
 * stamped `repoVisibility === 'public'` field, and returns a flat list.
 *
 * Lazy backfill: any index missing `repoVisibility` triggers an
 * anonymous `GET /repos/{owner}/{repo}` against GitHub. The result is
 * written back into the index via the existing ETag-locked write path,
 * so subsequent requests skip the GitHub round-trip. See
 * `docs/trails-explore-public-repos.md`.
 */

import { NextResponse } from 'next/server';
import { listPublicReposWithTrails } from '@/lib/trails/public-listing';
import type { ListPublicReposWithTrailsResponse } from '@/lib/trails/types';

// Cache the route's response for 60s — same staleness budget as the
// per-repo access check (REPO_ACCESS_CACHE_TTL). The lazy backfill is
// idempotent, so a stampeded cache miss is harmless.
export const revalidate = 60;

export async function GET() {
  try {
    const repos = await listPublicReposWithTrails();
    const response: ListPublicReposWithTrailsResponse = { repos };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Trails] List public repos error:', error);
    return NextResponse.json(
      { error: 'Failed to list public repos with trails' },
      { status: 500 }
    );
  }
}
