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
import {
  listRepoPrefixes,
  getIndex,
  updateIndex,
} from '@/lib/trails/s3-storage';
import { checkRepoAccess } from '@/lib/trails/github-access';
import type {
  ListPublicReposWithTrailsResponse,
  PublicRepoWithTrails,
  SharedTrailIndex,
} from '@/lib/trails/types';

// Cache the route's response for 60s — same staleness budget as the
// per-repo access check (REPO_ACCESS_CACHE_TTL). The lazy backfill is
// idempotent, so a stampeded cache miss is harmless.
export const revalidate = 60;

const INDEX_FETCH_CONCURRENCY = 20;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      const item = items[i];
      if (i >= items.length || item === undefined) return;
      results[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Resolve a repo's visibility, backfilling the stamp if missing.
 * Returns the (possibly updated) index along with the resolved
 * visibility, or `null` if visibility could not be determined.
 */
async function resolveVisibility(
  owner: string,
  repo: string,
  index: SharedTrailIndex
): Promise<{ visibility: 'public' | 'private'; index: SharedTrailIndex } | null> {
  if (index.repoVisibility) {
    return { visibility: index.repoVisibility, index };
  }

  // Anonymous probe: 200 → public, 404/403 → private or deleted. Either
  // way we have enough to stamp.
  let visibility: 'public' | 'private';
  try {
    const access = await checkRepoAccess(owner, repo, null);
    visibility = access ? 'public' : 'private';
  } catch (error) {
    // Transient GitHub failure (rate limit, 5xx). Skip stamping; the
    // next request will retry. Don't poison the explore listing with a
    // wrong guess.
    console.warn('[Trails] Visibility probe failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  try {
    const updated = await updateIndex(owner, repo, (data) => ({
      ...data,
      repoVisibility: visibility,
      repoVisibilityCheckedAt: new Date().toISOString(),
    }));
    return { visibility, index: updated };
  } catch (error) {
    // Stamp write lost a race or otherwise failed. We still know the
    // visibility for this response — just don't persist this time.
    console.warn('[Trails] Visibility stamp failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    return { visibility, index };
  }
}

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
