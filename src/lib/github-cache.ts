/**
 * GitHub API Cache Layer
 *
 * Provides server-side caching for GitHub API requests using Next.js Data Cache.
 * Reduces API calls by sharing cached responses across all clients.
 *
 * Two cache modes:
 * - SHARED: For public data (featured repos, public commits, etc.) - all clients share cache
 * - USER: For user-specific data (private repos, starred repos) - keyed by user token
 */

import { unstable_cache } from 'next/cache';

const GITHUB_API_BASE = 'https://api.github.com';

// Cache durations in seconds
export const CACHE_TTL = {
  // High-frequency data that changes often
  COMMITS: 60,           // 1 minute - commits change frequently
  ACTIVITY: 60,          // 1 minute - activity feed
  COUNTS: 120,           // 2 minutes - PR/issue counts

  // Medium-frequency data
  REPO_INFO: 300,        // 5 minutes - repo metadata
  TREE: 180,             // 3 minutes - file tree changes with commits
  USER_REPOS: 300,       // 5 minutes - user's repo list

  // Low-frequency data
  README: 600,           // 10 minutes - README changes rarely
  CONTRIBUTORS: 1800,    // 30 minutes - very stable
  ORG_REPOS: 600,        // 10 minutes - org repos change infrequently
  FOLLOWING: 600,        // 10 minutes - following list
} as const;

// Cache tags for invalidation
export const CACHE_TAGS = {
  GITHUB_API: 'github-api',
  COMMITS: 'github-commits',
  REPOS: 'github-repos',
  USER_DATA: 'github-user',
  FEATURED: 'github-featured',
} as const;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

interface GitHubFetchOptions {
  token?: string | null;
  etag?: string | null;
}

/**
 * Raw GitHub API fetch without caching
 */
async function fetchGitHub<T>(
  endpoint: string,
  options: GitHubFetchOptions = {}
): Promise<{ data: T; etag?: string; notModified?: boolean }> {
  const { token, etag } = options;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WebADE/1.0',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });

  if (response.status === 304) {
    return { data: null as T, notModified: true };
  }

  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const data = await response.json();
  const responseEtag = response.headers.get('ETag') || undefined;

  return { data, etag: responseEtag };
}

/**
 * Uncached GitHub API fetch.
 *
 * Use when the response can exceed `unstable_cache`'s 2MB ceiling — e.g. a
 * monorepo's recursive git tree (elastic/kibana is ~16MB). Caching such a
 * response throws "items over 2MB can not be cached" and 500s the route.
 * Callers should fetch raw with this and cache a small *derived* value instead.
 */
export async function uncachedGitHubFetch<T>(
  endpoint: string,
  token?: string | null
): Promise<T> {
  const { data } = await fetchGitHub<T>(endpoint, token ? { token } : {});
  return data;
}

/**
 * Cached GitHub API fetch - SHARED mode
 * Use for public data that all users can share (featured repos, public repo info)
 */
export function cachedGitHubFetch<T>(
  endpoint: string,
  cacheKey: string,
  ttl: number,
  tags: string[] = [CACHE_TAGS.GITHUB_API]
): Promise<T> {
  return unstable_cache(
    async () => {
      const { data } = await fetchGitHub<T>(endpoint);
      return data;
    },
    [cacheKey],
    {
      revalidate: ttl,
      tags: [CACHE_TAGS.GITHUB_API, ...tags],
    }
  )();
}

/**
 * Cached GitHub API fetch - USER mode
 * Use for user-specific data (private repos, starred repos)
 * Cache is keyed by user token prefix for isolation
 */
export function cachedUserGitHubFetch<T>(
  endpoint: string,
  cacheKey: string,
  ttl: number,
  token: string,
  tags: string[] = [CACHE_TAGS.USER_DATA]
): Promise<T> {
  // Use first 8 chars of token as user identifier for cache key
  const userPrefix = token.substring(0, 8);
  const fullCacheKey = `user:${userPrefix}:${cacheKey}`;

  return unstable_cache(
    async () => {
      const { data } = await fetchGitHub<T>(endpoint, { token });
      return data;
    },
    [fullCacheKey],
    {
      revalidate: ttl,
      tags: [CACHE_TAGS.GITHUB_API, CACHE_TAGS.USER_DATA, ...tags],
    }
  )();
}

/**
 * Batch fetch multiple endpoints with shared caching
 * Useful for fetching data from multiple repos in parallel
 */
export async function batchCachedFetch<T>(
  requests: Array<{
    endpoint: string;
    cacheKey: string;
    ttl: number;
    tags?: string[];
  }>
): Promise<T[]> {
  return Promise.all(
    requests.map(({ endpoint, cacheKey, ttl, tags }) =>
      cachedGitHubFetch<T>(endpoint, cacheKey, ttl, tags)
    )
  );
}

/**
 * Fetch commits for multiple repos with shared caching
 * Optimized for activity feed - uses shared cache so all clients benefit
 */
export async function fetchFeaturedRepoCommits(
  repos: Array<{ owner: string; repo: string }>,
  perPage: number = 10
): Promise<Array<{ owner: string; repo: string; commits: unknown[]; error?: string }>> {
  const results = await Promise.allSettled(
    repos.map(async ({ owner, repo }) => {
      const cacheKey = `commits:${owner}/${repo}:${perPage}`;
      const commits = await cachedGitHubFetch<unknown[]>(
        `/repos/${owner}/${repo}/commits?per_page=${perPage}`,
        cacheKey,
        CACHE_TTL.COMMITS,
        [CACHE_TAGS.COMMITS, CACHE_TAGS.FEATURED]
      );
      return { owner, repo, commits };
    })
  );

  return results.map((result, index) => {
    const repoInfo = repos[index]!;
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      commits: [],
      error: result.reason?.message || 'Failed to fetch',
    };
  });
}

/**
 * Fetch user's repositories with caching
 * Returns owned repos, starred repos, organizations, and following
 */
export async function fetchUserReposWithCache(token: string): Promise<{
  owned: unknown[];
  starred: unknown[];
  orgs: unknown[];
  following: unknown[];
}> {
  const [owned, starred, orgs, following] = await Promise.all([
    cachedUserGitHubFetch<unknown[]>(
      '/user/repos?sort=updated&per_page=100',
      'user-repos-owned',
      CACHE_TTL.USER_REPOS,
      token
    ),
    cachedUserGitHubFetch<unknown[]>(
      '/user/starred?sort=updated&per_page=50',
      'user-repos-starred',
      CACHE_TTL.USER_REPOS,
      token
    ),
    cachedUserGitHubFetch<unknown[]>(
      '/user/orgs',
      'user-orgs',
      CACHE_TTL.USER_REPOS,
      token
    ),
    cachedUserGitHubFetch<unknown[]>(
      '/user/following?per_page=50',
      'user-following',
      CACHE_TTL.FOLLOWING,
      token
    ),
  ]);

  return { owned, starred, orgs, following };
}

/**
 * Fetch organization repos with caching
 * Shared cache - org repos are visible to all authenticated users
 */
export function fetchOrgReposWithCache(
  orgLogin: string,
  token: string
): Promise<unknown[]> {
  return cachedUserGitHubFetch<unknown[]>(
    `/orgs/${orgLogin}/repos?sort=updated&per_page=50`,
    `org-repos:${orgLogin}`,
    CACHE_TTL.ORG_REPOS,
    token
  );
}

/**
 * Fetch repo info with shared caching
 * Public repos use shared cache, private repos use user cache
 */
export function fetchRepoInfo<T>(
  owner: string,
  repo: string,
  token?: string | null
): Promise<T> {
  const cacheKey = `repo-info:${owner}/${repo}`;

  if (token) {
    // User might access private repos, use user-scoped cache
    return cachedUserGitHubFetch<T>(
      `/repos/${owner}/${repo}`,
      cacheKey,
      CACHE_TTL.REPO_INFO,
      token
    );
  }

  // Public access - shared cache
  return cachedGitHubFetch<T>(
    `/repos/${owner}/${repo}`,
    cacheKey,
    CACHE_TTL.REPO_INFO,
    [CACHE_TAGS.REPOS]
  );
}
