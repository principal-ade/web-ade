/**
 * GitHub Metadata Fetching for Starred Collections
 *
 * Handles fetching repository and user metadata from GitHub API with caching.
 * Cache has 1-hour TTL to reduce API load and avoid rate limiting.
 */

import { Octokit } from '@octokit/rest';
import type {
  CachedRepoMetadata,
  CachedUserMetadata,
  MetadataCache,
} from './types';
import { CollectionError, ErrorCodes } from './types';
import { getMetadataCache, updateMetadataCache } from './s3-storage';
import { METADATA_CACHE_TTL_MS } from './constants';

// ============================================================================
// Cache Helpers
// ============================================================================

/**
 * Checks if cached metadata is stale (older than 1 hour)
 */
function isCacheStale(cachedAt: string): boolean {
  const cacheAge = Date.now() - new Date(cachedAt).getTime();
  return cacheAge > METADATA_CACHE_TTL_MS;
}

/**
 * Gets cached repo metadata if fresh
 * @returns Cached metadata or null if not found or stale
 */
async function getCachedRepoMetadata(
  ownerType: 'user' | 'org',
  ownerId: string,
  owner: string,
  repo: string
): Promise<Omit<CachedRepoMetadata, 'cachedAt'> | null> {
  try {
    const cache = await getMetadataCache(ownerType, ownerId);
    if (!cache) {
      return null;
    }

    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const cached = cache.repos[key];

    if (!cached) {
      return null;
    }

    // Check if cache is fresh
    if (isCacheStale(cached.cachedAt)) {
      console.log('[GitHub Metadata] Repo cache stale:', {
        owner,
        repo,
        cachedAt: cached.cachedAt,
      });
      return null;
    }

    console.log('[GitHub Metadata] Repo cache hit:', {
      owner,
      repo,
      age: `${Math.floor((Date.now() - new Date(cached.cachedAt).getTime()) / 1000)}s`,
    });

    return {
      description: cached.description,
      stargazersCount: cached.stargazersCount,
      avatarUrl: cached.avatarUrl,
    };
  } catch (error) {
    console.error('[GitHub Metadata] Get cached repo metadata failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Gets cached user metadata if fresh
 * @returns Cached metadata or null if not found or stale
 */
async function getCachedUserMetadata(
  ownerType: 'user' | 'org',
  ownerId: string,
  login: string
): Promise<Omit<CachedUserMetadata, 'cachedAt'> | null> {
  try {
    const cache = await getMetadataCache(ownerType, ownerId);
    if (!cache) {
      return null;
    }

    const key = login.toLowerCase();
    const cached = cache.users[key];

    if (!cached) {
      return null;
    }

    // Check if cache is fresh
    if (isCacheStale(cached.cachedAt)) {
      console.log('[GitHub Metadata] User cache stale:', {
        login,
        cachedAt: cached.cachedAt,
      });
      return null;
    }

    console.log('[GitHub Metadata] User cache hit:', {
      login,
      age: `${Math.floor((Date.now() - new Date(cached.cachedAt).getTime()) / 1000)}s`,
    });

    return {
      avatarUrl: cached.avatarUrl,
      name: cached.name,
    };
  } catch (error) {
    console.error('[GitHub Metadata] Get cached user metadata failed:', {
      login,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Updates repo metadata in cache (async, non-blocking)
 */
function cacheRepoMetadata(
  ownerType: 'user' | 'org',
  ownerId: string,
  owner: string,
  repo: string,
  metadata: Omit<CachedRepoMetadata, 'cachedAt'>
): void {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;

  updateMetadataCache(ownerType, ownerId, (cache: MetadataCache) => {
    return {
      ...cache,
      repos: {
        ...cache.repos,
        [key]: {
          ...metadata,
          cachedAt: new Date().toISOString(),
        },
      },
    };
  }).catch((error) => {
    console.error('[GitHub Metadata] Cache repo metadata failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Updates user metadata in cache (async, non-blocking)
 */
function cacheUserMetadata(
  ownerType: 'user' | 'org',
  ownerId: string,
  login: string,
  metadata: Omit<CachedUserMetadata, 'cachedAt'>
): void {
  const key = login.toLowerCase();

  updateMetadataCache(ownerType, ownerId, (cache: MetadataCache) => {
    return {
      ...cache,
      users: {
        ...cache.users,
        [key]: {
          ...metadata,
          cachedAt: new Date().toISOString(),
        },
      },
    };
  }).catch((error) => {
    console.error('[GitHub Metadata] Cache user metadata failed:', {
      login,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

// ============================================================================
// GitHub API Fetchers
// ============================================================================

/**
 * Fetches repository metadata from GitHub API with caching
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param ownerType - Owner type for cache storage ('user' or 'org')
 * @param ownerId - Owner ID for cache storage (user ID or org login)
 * @param token - GitHub access token
 * @returns Repository metadata
 * @throws {CollectionError} if repo not found or GitHub API error
 */
export async function fetchRepoMetadata(
  owner: string,
  repo: string,
  ownerType: 'user' | 'org',
  ownerId: string,
  token: string
): Promise<{
  description: string | null;
  stargazersCount: number;
  avatarUrl: string;
}> {
  // Check cache first
  const cached = await getCachedRepoMetadata(ownerType, ownerId, owner, repo);
  if (cached) {
    return cached;
  }

  console.log('[GitHub Metadata] Fetching repo from GitHub:', { owner, repo });

  try {
    const octokit = new Octokit({ auth: token });

    const { data } = await octokit.repos.get({
      owner,
      repo,
    });

    const metadata = {
      description: data.description,
      stargazersCount: data.stargazers_count,
      avatarUrl: data.owner.avatar_url,
    };

    // Update cache async (don't block response)
    cacheRepoMetadata(ownerType, ownerId, owner, repo, metadata);

    console.log('[GitHub Metadata] Fetched repo metadata:', {
      owner,
      repo,
      stars: metadata.stargazersCount,
    });

    return metadata;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = error.status;

      if (status === 404) {
        throw new CollectionError(
          `Repository not found: ${owner}/${repo}`,
          502,
          ErrorCodes.REPO_NOT_FOUND
        );
      }

      if (status === 403) {
        throw new CollectionError(
          'GitHub API rate limit exceeded',
          502,
          ErrorCodes.GITHUB_API_ERROR
        );
      }
    }

    console.error('[GitHub Metadata] Fetch repo metadata failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new CollectionError(
      'Failed to fetch repository information from GitHub',
      502,
      ErrorCodes.GITHUB_API_ERROR
    );
  }
}

/**
 * Fetches user metadata from GitHub API with caching
 *
 * @param login - GitHub username
 * @param ownerType - Owner type for cache storage ('user' or 'org')
 * @param ownerId - Owner ID for cache storage (user ID or org login)
 * @param token - GitHub access token
 * @returns User metadata
 * @throws {CollectionError} if user not found or GitHub API error
 */
export async function fetchUserMetadata(
  login: string,
  ownerType: 'user' | 'org',
  ownerId: string,
  token: string
): Promise<{
  avatarUrl: string;
  name: string | null;
}> {
  // Check cache first
  const cached = await getCachedUserMetadata(ownerType, ownerId, login);
  if (cached) {
    return cached;
  }

  console.log('[GitHub Metadata] Fetching user from GitHub:', { login });

  try {
    const octokit = new Octokit({ auth: token });

    const { data } = await octokit.users.getByUsername({
      username: login,
    });

    const metadata = {
      avatarUrl: data.avatar_url,
      name: data.name,
    };

    // Update cache async (don't block response)
    cacheUserMetadata(ownerType, ownerId, login, metadata);

    console.log('[GitHub Metadata] Fetched user metadata:', {
      login,
      name: metadata.name,
    });

    return metadata;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = error.status;

      if (status === 404) {
        throw new CollectionError(
          `GitHub user not found: ${login}`,
          502,
          ErrorCodes.USER_NOT_FOUND
        );
      }

      if (status === 403) {
        throw new CollectionError(
          'GitHub API rate limit exceeded',
          502,
          ErrorCodes.GITHUB_API_ERROR
        );
      }
    }

    console.error('[GitHub Metadata] Fetch user metadata failed:', {
      login,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new CollectionError(
      'Failed to fetch user information from GitHub',
      502,
      ErrorCodes.GITHUB_API_ERROR
    );
  }
}
