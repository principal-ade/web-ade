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
