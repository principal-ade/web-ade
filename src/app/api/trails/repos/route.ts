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
import { listRepoPrefixes, getIndex } from '@/lib/trails/s3-storage';
import {
  INDEX_FETCH_CONCURRENCY,
  mapWithConcurrency,
  resolveVisibility,
} from '@/lib/trails/public-listing';
import type {
  ListPublicReposWithTrailsResponse,
  PublicRepoWithTrails,
} from '@/lib/trails/types';

// Cache the route's response for 60s — same staleness budget as the
// per-repo access check (REPO_ACCESS_CACHE_TTL). The lazy backfill is
// idempotent, so a stampeded cache miss is harmless.
export const revalidate = 60;

export async function GET() {
  try {
    const pairs = await listRepoPrefixes();

    const rows = await mapWithConcurrency(
      pairs,
      INDEX_FETCH_CONCURRENCY,
      async ({ owner, repo }): Promise<PublicRepoWithTrails | null> => {
        const index = await getIndex(owner, repo);
        // Skip repos whose index exists but is empty (every trail was
        // deleted). They shouldn't show up on /explore.
        if (index.entries.length === 0) return null;

        const resolved = await resolveVisibility(owner, repo, index);
        if (!resolved || resolved.visibility !== 'public') return null;

        return {
          owner,
          repo,
          trailCount: resolved.index.entries.length,
          lastUpdated: resolved.index.updatedAt,
        };
      }
    );

    const repos = rows
      .filter((r): r is PublicRepoWithTrails => r !== null)
      .sort((a, b) => {
        const byOwner = a.owner.localeCompare(b.owner, undefined, {
          sensitivity: 'base',
        });
        if (byOwner !== 0) return byOwner;
        return a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' });
      });

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
