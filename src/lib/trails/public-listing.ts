/**
 * Shared helpers for enumerating PUBLIC trails/repos across the whole store.
 *
 * Extracted from `/api/trails/repos` so both that route (repo-level counts)
 * and `/api/trails/feed` (a flat, newest-first list of individual trails) share
 * the same repo-enumeration + public-visibility filter — including the lazy
 * `repoVisibility` backfill via an anonymous GitHub probe. See
 * `docs/trails-explore-public-repos.md`.
 */

import { listRepoPrefixes, getIndex, updateIndex } from '@/lib/trails/s3-storage';
import { checkRepoAccess } from '@/lib/trails/github-access';
import type {
  PublicRepoWithTrails,
  PublicTrailEntry,
  SharedTrailIndex,
} from '@/lib/trails/types';

// Cap concurrent per-repo index reads. Matches the staleness budget of the
// per-repo access check (REPO_ACCESS_CACHE_TTL).
export const INDEX_FETCH_CONCURRENCY = 20;

export async function mapWithConcurrency<T, R>(
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
 * Returns the (possibly updated) index along with the resolved visibility, or
 * `null` if visibility could not be determined (transient GitHub failure).
 */
export async function resolveVisibility(
  owner: string,
  repo: string,
  index: SharedTrailIndex
): Promise<{ visibility: 'public' | 'private'; index: SharedTrailIndex } | null> {
  if (index.repoVisibility) {
    return { visibility: index.repoVisibility, index };
  }

  // Anonymous probe: 200 → public, 404/403 → private or deleted.
  let visibility: 'public' | 'private';
  try {
    const access = await checkRepoAccess(owner, repo, null);
    visibility = access ? 'public' : 'private';
  } catch (error) {
    // Transient GitHub failure (rate limit, 5xx). Skip stamping; the next
    // request retries. Don't poison the listing with a wrong guess.
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

/**
 * Repo-level list of every publicly-readable repo that has at least one trail,
 * sorted owner-then-repo. Backs `/api/trails/repos` (the `/explore` page) and
 * the site index (`/api/home`). Same enumeration + lazy visibility backfill as
 * {@link listPublicTrails}, but collapsed to one row per repo with a count.
 */
export async function listPublicReposWithTrails(): Promise<
  PublicRepoWithTrails[]
> {
  const pairs = await listRepoPrefixes();

  const rows = await mapWithConcurrency(
    pairs,
    INDEX_FETCH_CONCURRENCY,
    async ({ owner, repo }): Promise<PublicRepoWithTrails | null> => {
      const index = await getIndex(owner, repo);
      // Skip repos whose index exists but is empty (every trail was deleted).
      if (index.entries.length === 0) return null;

      const resolved = await resolveVisibility(owner, repo, index);
      if (!resolved || resolved.visibility !== 'public') return null;

      return {
        owner,
        repo,
        trailCount: resolved.index.entries.length,
        lastUpdated: resolved.index.updatedAt,
      };
    },
  );

  return rows
    .filter((r): r is PublicRepoWithTrails => r !== null)
    .sort((a, b) => {
      const byOwner = a.owner.localeCompare(b.owner, undefined, {
        sensitivity: 'base',
      });
      if (byOwner !== 0) return byOwner;
      return a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' });
    });
}

/**
 * Flat, newest-first list of EVERY individual trail in a publicly-readable
 * repo. Enumerates all repo prefixes, keeps only `repoVisibility === 'public'`
 * (lazy-backfilling the stamp), flattens each repo's index entries with their
 * resolved `{ owner, repo }`, and sorts by `updatedAt` descending.
 */
export async function listPublicTrails(): Promise<PublicTrailEntry[]> {
  const pairs = await listRepoPrefixes();

  const perRepo = await mapWithConcurrency(
    pairs,
    INDEX_FETCH_CONCURRENCY,
    async ({ owner, repo }): Promise<PublicTrailEntry[]> => {
      const index = await getIndex(owner, repo);
      if (index.entries.length === 0) return [];

      const resolved = await resolveVisibility(owner, repo, index);
      if (!resolved || resolved.visibility !== 'public') return [];

      return resolved.index.entries.map((entry) => ({ ...entry, owner, repo }));
    }
  );

  return perRepo
    .flat()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
