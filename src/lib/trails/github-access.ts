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

export interface RepoAccessInfo {
  /** GitHub numeric repo id, used as a rename-stable backstop on index entries. */
  githubRepoId: number;
  fullName: string;
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

export async function checkRepoAccess(
  owner: string,
  repo: string,
  token: string | null
): Promise<RepoAccessInfo | null> {
  const baseKey = `repo-access:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  try {
    const data = token
      ? await cachedUserGitHubFetch<{ id: number; full_name: string }>(
          `/repos/${owner}/${repo}`,
          baseKey,
          REPO_ACCESS_CACHE_TTL,
          token,
          [CACHE_TAGS.REPOS]
        )
      : await cachedGitHubFetch<{ id: number; full_name: string }>(
          `/repos/${owner}/${repo}`,
          `anon:${baseKey}`,
          REPO_ACCESS_CACHE_TTL,
          [CACHE_TAGS.REPOS]
        );

    return { githubRepoId: data.id, fullName: data.full_name };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      if (error.status === 404 || error.status === 403) {
        return null;
      }
    }
    throw error;
  }
}
