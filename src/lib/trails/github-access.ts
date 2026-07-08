/**
 * Repo access gating for shared trails.
 *
 * Authorization is delegated entirely to GitHub: if the requester's token
 * can read the repo, they can read its shared trails; if it can't, they
 * can't. We piggyback on the existing GitHub data cache so rapid view
 * traffic doesn't burn the user's API budget.
 */

import {
  cachedGitHubFetch,
  cachedUserGitHubFetch,
  CACHE_TAGS,
  GitHubApiError,
} from '../github-cache';
import { REPO_ACCESS_CACHE_TTL } from './constants';
import { TrailShareError, ShareErrorCodes } from './types';
import { recordRateLimitHit } from '../repo-analysis/s3-cache';

export interface RepoAccessInfo {
  /** GitHub numeric repo id, used as a rename-stable backstop on index entries. */
  githubRepoId: number;
  fullName: string;
  /** GitHub `private` flag at access-check time. Stamped onto the per-repo
   *  index so `/explore` can filter without re-asking GitHub. */
  private: boolean;
  /**
   * Repo metadata that rides along on the very same `/repos/{owner}/{repo}`
   * response we already fetch for the access check — surfaced (for free, no
   * extra call) so the agent repo-catalog can describe what the repo *is*,
   * not just what trails it has. All best-effort: GitHub omits some fields.
   */
  description: string | null;
  /** GitHub's detected primary language (the `language` field), or null. */
  primaryLanguage: string | null;
  defaultBranch: string;
  /** Repo topics/tags; `[]` when none are set. */
  topics: string[];
  stars: number;
  /** Author-set homepage URL, or null when unset/empty. */
  homepage: string | null;
  htmlUrl: string;
  /** ISO 8601 of the last push, or null. */
  pushedAt: string | null;
  /**
   * Whether the *calling* user has admin rights on the repo. Derived from the
   * `permissions` object GitHub adds to `/repos/{owner}/{repo}` for
   * authenticated requests — so it reflects the token holder, which is safe
   * because the access fetch is cached per-user (`cachedUserGitHubFetch`).
   * `false` for anonymous reads (GitHub omits `permissions`). Used to let repo
   * admins delete trails they didn't author.
   */
  canAdmin: boolean;
}

/** The subset of `GET /repos/{owner}/{repo}` we read. */
interface GhRepoResponse {
  id: number;
  full_name: string;
  private: boolean;
  description: string | null;
  language: string | null;
  default_branch: string;
  topics?: string[];
  stargazers_count: number;
  homepage: string | null;
  html_url: string;
  pushed_at: string | null;
  /** Present only on authenticated requests; reflects the token holder. */
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

/**
 * Returns repo metadata if the caller can read the repo, or `null` if they
 * can't. Throws on non-access errors (rate limit, transient 5xx).
 *
 * Pass `null` for `token` to allow public-repo reads from logged-out
 * callers — GitHub returns 200 on `/repos/{owner}/{repo}` for any public
 * repo regardless of authentication. Private repos still 404 anonymously,
 * which we map to "no access".
 */
/**
 * GitHub login pattern: 1-39 chars, alphanumeric or hyphen, can't start
 * with a hyphen. Used to short-circuit obviously-malformed recipient
 * logins on `POST .../send` before paying for the GitHub round-trip.
 */
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export function isValidGitHubLogin(login: unknown): login is string {
  return typeof login === 'string' && GITHUB_LOGIN_PATTERN.test(login);
}

/** 24h — login→id mappings are extremely stable (GitHub keeps numeric ids forever). */
const USER_LOOKUP_CACHE_TTL = 24 * 60 * 60;

/**
 * Resolve a GitHub login to `{ githubId, githubLogin }` via `GET /users/{login}`.
 * Returns `null` if the login doesn't exist. Throws on transient errors
 * (rate limit, 5xx) so the caller can surface them as the request-level
 * failure they are rather than as per-recipient "unknown_user" noise.
 */
export async function resolveGitHubLogin(
  login: string
): Promise<{ githubId: number; githubLogin: string } | null> {
  const cacheKey = `user-lookup:${login.toLowerCase()}`;
  try {
    const data = await cachedGitHubFetch<{ id: number; login: string }>(
      `/users/${login}`,
      cacheKey,
      USER_LOOKUP_CACHE_TTL,
      [CACHE_TAGS.USER_DATA]
    );
    return { githubId: data.id, githubLogin: data.login };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Return a GitHub user's display name (the `name` field they set in their
 * profile), or `null` if the user has no name set or the lookup fails.
 *
 * Callers should fall back to the login when this returns null — GitHub
 * lets users leave `name` empty, in which case the login *is* their
 * public identity.
 *
 * Uses the same 24h cache as `resolveGitHubLogin` since the underlying
 * endpoint (`GET /users/{login}`) returns both — kept separate so each
 * caller can opt into one piece of the response without paying for the
 * other's typing.
 */
export async function getGitHubDisplayName(
  login: string
): Promise<string | null> {
  const cacheKey = `user-lookup:${login.toLowerCase()}`;
  try {
    const data = await cachedGitHubFetch<{
      id: number;
      login: string;
      name: string | null;
    }>(`/users/${login}`, cacheKey, USER_LOOKUP_CACHE_TTL, [
      CACHE_TAGS.USER_DATA,
    ]);
    return data.name && data.name.trim().length > 0 ? data.name : null;
  } catch {
    // Never block a trail read because we couldn't resolve a name —
    // the caller falls back to the login.
    return null;
  }
}

/** Short TTL — at publish time we want the repo's current tip, not a
 *  minutes-old cached sha. Still cached briefly so a burst of publishes
 *  to the same repo doesn't re-hit GitHub for each one. */
const HEAD_SHA_CACHE_TTL = 30;

/**
 * Resolve a repo's current default-branch HEAD to a concrete commit sha.
 *
 * Used to stamp trail provenance at publish time: a trail that arrives
 * without its own authored sha would otherwise drift onto whatever HEAD
 * is when it's later read. Baking the sha in at creation pins it to a
 * fixed commit forever. Returns `null` on any failure — provenance
 * stamping is best-effort and must never block publishing.
 */
export async function resolveHeadSha(
  owner: string,
  repo: string,
  token: string
): Promise<string | null> {
  try {
    const data = await cachedUserGitHubFetch<{ sha: string }>(
      `/repos/${owner}/${repo}/commits/HEAD`,
      `head-sha:${owner.toLowerCase()}/${repo.toLowerCase()}`,
      HEAD_SHA_CACHE_TTL,
      token,
      [CACHE_TAGS.REPOS]
    );
    return data.sha ?? null;
  } catch {
    return null;
  }
}

export async function checkRepoAccess(
  owner: string,
  repo: string,
  token: string | null,
  source?: string
): Promise<RepoAccessInfo | null> {
  const baseKey = `repo-access:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  try {
    const data = token
      ? await cachedUserGitHubFetch<GhRepoResponse>(
          `/repos/${owner}/${repo}`,
          baseKey,
          REPO_ACCESS_CACHE_TTL,
          token,
          [CACHE_TAGS.REPOS]
        )
      : await cachedGitHubFetch<GhRepoResponse>(
          `/repos/${owner}/${repo}`,
          `anon:${baseKey}`,
          REPO_ACCESS_CACHE_TTL,
          [CACHE_TAGS.REPOS]
        );

    return {
      githubRepoId: data.id,
      fullName: data.full_name,
      private: Boolean(data.private),
      description: data.description ?? null,
      primaryLanguage: data.language ?? null,
      defaultBranch: data.default_branch,
      topics: data.topics ?? [],
      stars: data.stargazers_count ?? 0,
      homepage: data.homepage ? data.homepage : null,
      htmlUrl: data.html_url,
      pushedAt: data.pushed_at ?? null,
      canAdmin: Boolean(data.permissions?.admin),
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      // A rate limit is transient, not a permission failure — surface it as a
      // distinct retryable error so callers show a "try again shortly" state
      // instead of a hard "this repository is private". Conflating the two is
      // what made public repos flash the private page on a cold cache.
      if (error.rateLimited) {
        // Record the hit for the ops /status page before surfacing. Awaited (not
        // fire-and-forget) so the write survives the serverless response, but it
        // never throws — telemetry can't turn a rate limit into a 500.
        await recordRateLimitHit(owner, repo, token ? 'user' : 'anon', source);
        throw new TrailShareError(
          'GitHub is rate limiting requests right now. Try again in a moment.',
          429,
          ShareErrorCodes.RATE_LIMITED
        );
      }
      if (error.status === 404 || error.status === 403) {
        return null;
      }
    }
    throw error;
  }
}
