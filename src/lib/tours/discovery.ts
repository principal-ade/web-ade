/**
 * Tour discovery for the repo explorer.
 *
 * Tours are authoritative in the S3 store (`./s3-storage.ts`): for a repo we
 * read its tour index and return the stored payloads. The full git-tree walk
 * for `*.tour.json` remains as a *temporary* fallback for repos not yet
 * migrated into the store — it's removed once backfill lands (plan phase A4).
 *
 * The legacy `TOUR_ORGS` fork fallback (stash tours under a known fork, cache
 * the fork location under the parent repo) has been retired: discovery no
 * longer reads the tour-availability cache, and the git fallback probes only
 * the upstream repo.
 */
import { parseTour } from '@principal-ai/file-city-builder';
import {
  cachedGitHubFetch,
  cachedUserGitHubFetch,
  GitHubApiError,
} from '../github-cache';
import { mergeTTSOptions } from '../tts/elevenlabs-client';
import { readManifest, computeTourAudioStatus } from '../tts/manifest';
import {
  getIndex as getTourIndex,
  getPayload as getTourPayload,
} from './s3-storage';
import type { IntroductionTour } from '@principal-ai/file-city-builder';
import type { TourAudioStatus, TourListItem } from './types';

/** Status used when audio state can't be read (S3 down, etc.). */
const UNKNOWN_AUDIO_STATUS: TourAudioStatus = {
  state: 'none',
  totalSteps: 0,
  readySteps: 0,
  lastGeneratedAt: null,
  canGenerateAt: null,
};

/**
 * Best-effort audio status for a tour. Reads the per-tour manifest and compares
 * recorded keys to current step keys. Never throws — a failure (missing creds,
 * S3 error) falls back to "no audio" so the tours list still renders.
 */
async function resolveAudioStatus(
  owner: string,
  repo: string,
  path: string,
  tour: IntroductionTour
): Promise<TourAudioStatus> {
  try {
    const options = mergeTTSOptions();
    const manifest = await readManifest(owner, repo, path);
    // `parseTour` yields the file-city-builder tour type; the TTS helpers use
    // the structurally-equivalent local tour type. The shapes match at runtime
    // (id + narration/description/content per step) — cast across the boundary.
    const ttsTour = tour as unknown as Parameters<
      typeof computeTourAudioStatus
    >[2];
    return await computeTourAudioStatus(owner, repo, ttsTour, options, manifest);
  } catch (error) {
    console.warn(
      `[tours] Audio status unavailable for ${owner}/${repo}/${path}:`,
      error instanceof Error ? error.message : error
    );
    return UNKNOWN_AUDIO_STATUS;
  }
}

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
 * Read every tour for a repo from the S3 store. `[]` when the repo has no
 * stored tours (so the caller can fall back to git) or when the store is
 * unavailable — a store outage must never break tour listing.
 */
async function listStoredToursForRepo(
  owner: string,
  repo: string,
): Promise<TourListItem[]> {
  let index;
  try {
    index = await getTourIndex(owner, repo);
  } catch (error) {
    console.warn(
      `[tours] Store index unavailable for ${owner}/${repo}; falling back to git.`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
  if (index.entries.length === 0) return [];

  const items: TourListItem[] = [];
  for (const entry of index.entries) {
    const payload = await getTourPayload(owner, repo, entry.id);
    if (!payload) continue;
    const audioStatus = await resolveAudioStatus(
      payload.audio.owner,
      payload.audio.repo,
      payload.audio.path,
      payload.tour,
    );
    items.push({
      tour: payload.tour,
      audio: payload.audio,
      audioStatus,
    });
  }

  // Stable order so the sidebar list doesn't reshuffle between loads.
  items.sort((a, b) => a.tour.title.localeCompare(b.tour.title));
  return items;
}

/**
 * Walk the upstream repo's git tree and return every valid `*.tour.json`, each
 * paired with the `{ owner, repo, path, commitSha }` needed to fetch its
 * narration audio. The temporary fallback for repos not yet in the store;
 * removed at plan phase A4. Invalid tour files are skipped (logged), not fatal.
 */
async function listGitToursForRepo(
  owner: string,
  repo: string,
  token: string | null,
): Promise<TourListItem[]> {
  const src: TourSource = { owner, repo };

  let branch: string;
  try {
    branch = await getDefaultBranch(src, token);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const tourPaths = await listRepoTourFiles(src, branch, token);
  if (tourPaths.length === 0) return [];

  // Resolve the head SHA once — every tour from this source shares the same
  // commit. Best-effort: null when GitHub is unavailable/rate-limited, in
  // which case audio degrades to cache-only (tours still list).
  const commitSha = await resolveCommitSha(src, branch, token);

  const items: TourListItem[] = [];
  for (const path of tourPaths) {
    const raw = await fetchTourFile(src, path, token);
    if (!raw) continue;
    const result = parseTour(raw);
    if (result.success && result.tour) {
      const audioStatus = await resolveAudioStatus(
        src.owner,
        src.repo,
        path,
        result.tour,
      );
      items.push({
        tour: result.tour,
        audio: { owner: src.owner, repo: src.repo, path, commitSha },
        audioStatus,
      });
    } else {
      const detail =
        result.errors?.map((e) => e.message).join(', ') || 'unknown error';
      console.warn(
        `[tours] Skipping invalid tour ${src.owner}/${src.repo}/${path}: ${detail}`,
      );
    }
  }

  // Stable order so the sidebar list doesn't reshuffle between loads.
  items.sort((a, b) => a.tour.title.localeCompare(b.tour.title));
  return items;
}

/**
 * Resolve every tour for a repo. The S3 store is authoritative; the git-tree
 * walk is a temporary fallback for repos not yet migrated (plan phase A4
 * removes it). `[]` when neither source yields a tour.
 */
export async function listToursForRepo(
  owner: string,
  repo: string,
  token: string | null,
): Promise<TourListItem[]> {
  const stored = await listStoredToursForRepo(owner, repo);
  if (stored.length > 0) return stored;

  return listGitToursForRepo(owner, repo, token);
}
