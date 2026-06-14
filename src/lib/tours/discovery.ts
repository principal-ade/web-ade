/**
 * Tour discovery for the repo explorer.
 *
 * Unlike the legacy single-tour path (one fixed `docs/tours/introduction.tour.json`
 * resolved through `checkTourAvailability`), the explorer supports *multiple*
 * tours authored anywhere in the repo: it walks the full git tree and returns
 * every valid `*.tour.json` it finds, regardless of directory.
 *
 * Tours may live in the repo itself or in a known fork (the legacy model
 * stashes them under a `TOUR_ORGS` fork and caches the fork location under
 * the parent repo). We try the repo first, then fall back to the cached
 * fork, returning the first source that yields at least one valid tour.
 */
import { parseTour } from '@principal-ai/file-city-builder';
import {
  cachedGitHubFetch,
  cachedUserGitHubFetch,
  GitHubApiError,
} from '../github-cache';
import { getCached, getTourAvailabilityCacheKey } from '../redis-cache';
import type { TourListItem } from './types';

const TOUR_FILE_SUFFIX = '.tour.json';
// Revalidation window for the cached GitHub reads. Matches the legacy
// tour-availability TTL (24h) — tours are git-authored and change rarely.
const TOURS_CACHE_TTL = 86400;

interface GhRepoInfo {
  default_branch: string;
}

interface GhRefInfo {
  object: { sha: string };
}

interface GhTreeEntry {
  path: string;
  type: string;
  sha: string;
}

interface GhTreeResponse {
  sha: string;
  tree: GhTreeEntry[];
  truncated: boolean;
}

interface GhFileContent {
  content: string;
  encoding: string;
}

/** A repo to probe for tour files. */
interface TourSource {
  owner: string;
  repo: string;
}

/** GitHub 404/403 (missing repo / no access) → treat as "no tours here". */
function isMissing(error: unknown): boolean {
  return (
    error instanceof GitHubApiError &&
    (error.status === 404 || error.status === 403)
  );
}

async function fetchGh<T>(
  endpoint: string,
  cacheKey: string,
  token: string | null,
): Promise<T> {
  return token
    ? cachedUserGitHubFetch<T>(endpoint, cacheKey, TOURS_CACHE_TTL, token)
    : cachedGitHubFetch<T>(endpoint, cacheKey, TOURS_CACHE_TTL);
}

async function getDefaultBranch(
  src: TourSource,
  token: string | null,
): Promise<string> {
  const data = await fetchGh<GhRepoInfo>(
    `/repos/${src.owner}/${src.repo}`,
    `tours-repo:${src.owner}/${src.repo}`,
    token,
  );
  return data.default_branch || 'main';
}

/**
 * Resolve a branch to its head commit SHA — the TTS backend needs a real SHA.
 * Uses the lightweight git-refs endpoint (a few hundred bytes) rather than
 * `/commits/{branch}`, which returns the entire commit diff (~MBs).
 *
 * Best-effort: returns null on any failure (rate limit, missing ref). Audio is
 * an enhancement, so a missing SHA must never break tour listing — callers
 * fall back to cache-only audio.
 */
async function resolveCommitSha(
  src: TourSource,
  branch: string,
  token: string | null,
): Promise<string | null> {
  try {
    const data = await fetchGh<GhRefInfo>(
      `/repos/${src.owner}/${src.repo}/git/ref/heads/${branch}`,
      `tours-ref:${src.owner}/${src.repo}/${branch}`,
      token,
    );
    return data.object?.sha ?? null;
  } catch (error) {
    console.warn(
      `[tours] Could not resolve commit SHA for ${src.owner}/${src.repo}@${branch}; audio falls back to cache-only.`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Walk the full repo tree and return the paths of every `*.tour.json` file,
 * wherever it lives. `[]` when the repo is missing/inaccessible.
 */
async function listRepoTourFiles(
  src: TourSource,
  branch: string,
  token: string | null,
): Promise<string[]> {
  // The git-trees API accepts a branch name as the tree-ish; `recursive=1`
  // returns the entire flattened tree in one call.
  const endpoint = `/repos/${src.owner}/${src.repo}/git/trees/${branch}?recursive=1`;
  const cacheKey = `tours-tree:${src.owner}/${src.repo}/${branch}`;
  try {
    const data = await fetchGh<GhTreeResponse>(endpoint, cacheKey, token);
    if (data.truncated) {
      // GitHub caps the recursive tree response; very large repos may hide
      // tours past the limit. Rare, but worth a breadcrumb when it happens.
      console.warn(
        `[tours] Git tree truncated for ${src.owner}/${src.repo}; some tours may be missed.`,
      );
    }
    return data.tree
      .filter((e) => e.type === 'blob' && e.path.endsWith(TOUR_FILE_SUFFIX))
      .map((e) => e.path);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** Fetch and decode a single tour file; `null` when missing/undecodable. */
async function fetchTourFile(
  src: TourSource,
  path: string,
  token: string | null,
): Promise<string | null> {
  const endpoint = `/repos/${src.owner}/${src.repo}/contents/${path}`;
  const cacheKey = `tours-file:${src.owner}/${src.repo}/${path}`;
  try {
    const data = await fetchGh<GhFileContent>(endpoint, cacheKey, token);
    if (data.encoding === 'base64' && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return typeof data.content === 'string' ? data.content : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * Candidate repos that might hold tours for `owner/repo`, in priority order:
 * the repo itself, then any fork recorded in the tour-availability cache.
 */
async function resolveTourSources(
  owner: string,
  repo: string,
): Promise<TourSource[]> {
  const sources: TourSource[] = [{ owner, repo }];
  const cached = await getCached<{
    forkOwner: string | null;
    forkRepo: string | null;
  }>(getTourAvailabilityCacheKey(owner, repo));
  if (cached?.forkOwner && cached?.forkRepo) {
    sources.push({ owner: cached.forkOwner, repo: cached.forkRepo });
  }
  return sources;
}

/**
 * Resolve and return every valid tour for a repo, each paired with the
 * `{ owner, repo, path, commitSha }` needed to fetch its narration audio.
 * Returns the tours from the first source (repo, then cached fork) that yields
 * at least one; `[]` when none are found. Invalid `*.tour.json` files are
 * skipped (logged), not fatal.
 */
export async function listToursForRepo(
  owner: string,
  repo: string,
  token: string | null,
): Promise<TourListItem[]> {
  const sources = await resolveTourSources(owner, repo);

  for (const src of sources) {
    let branch: string;
    try {
      branch = await getDefaultBranch(src, token);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }

    const tourPaths = await listRepoTourFiles(src, branch, token);
    if (tourPaths.length === 0) continue;

    // Resolve the head SHA once for the source — every tour from it shares
    // the same commit. Best-effort: null when GitHub is unavailable/rate-
    // limited, in which case audio degrades to cache-only (tours still list).
    const commitSha = await resolveCommitSha(src, branch, token);

    const items: TourListItem[] = [];
    for (const path of tourPaths) {
      const raw = await fetchTourFile(src, path, token);
      if (!raw) continue;
      const result = parseTour(raw);
      if (result.success && result.tour) {
        items.push({
          tour: result.tour,
          audio: { owner: src.owner, repo: src.repo, path, commitSha },
        });
      } else {
        const detail =
          result.errors?.map((e) => e.message).join(', ') || 'unknown error';
        console.warn(
          `[tours] Skipping invalid tour ${src.owner}/${src.repo}/${path}: ${detail}`,
        );
      }
    }

    if (items.length > 0) {
      // Stable order so the sidebar list doesn't reshuffle between loads.
      items.sort((a, b) => a.tour.title.localeCompare(b.tour.title));
      return items;
    }
  }

  return [];
}
