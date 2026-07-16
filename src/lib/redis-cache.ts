/**
 * Redis Cache Layer using Upstash
 *
 * Provides persistent caching across AWS Amplify deployments.
 * All operations are graceful - Redis failures never break requests.
 */

import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;
let redisInitialized = false;

/**
 * Get Redis client instance (lazy initialization)
 * Returns null if Redis is not configured
 */
function getRedisClient(): Redis | null {
  if (redisInitialized) return redisClient;

  redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[Redis] Not configured - UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing');
    return null;
  }

  try {
    console.log('[Redis] Initializing client with URL:', url.substring(0, 30) + '...');
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch (error) {
    console.error('[Redis] Failed to initialize:', error);
    return null;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisConfigured(): boolean {
  return getRedisClient() !== null;
}

/**
 * Get cached data from Redis
 * Returns null on any failure (treated as cache miss)
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get<T>(key);
    return data;
  } catch (error) {
    console.warn('[Redis] Get failed:', { key, error });
    return null;
  }
}

/**
 * Store data in Redis with TTL
 * Non-blocking - errors are logged but don't propagate
 */
/**
 * Skip caching values larger than this (bytes). Upstash rejects oversized
 * requests, so shipping a multi-MB blob (e.g. a monorepo's file tree) just
 * burns a round-trip and logs an error before failing. Callers that hit this
 * (the github tree cache) already fall back to S3 / in-memory, so skipping
 * Redis is harmless. ~900KB stays under Upstash's 1MB request limit.
 */
const MAX_CACHE_VALUE_BYTES = 900_000;

export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  // Bail before the network call on values Upstash can't accept.
  const size =
    typeof data === 'string'
      ? data.length
      : Buffer.byteLength(JSON.stringify(data));
  if (size > MAX_CACHE_VALUE_BYTES) {
    console.warn(
      `[Redis] Skipping oversized value (${size} bytes) for key: ${key}`
    );
    return;
  }

  try {
    await client.set(key, data, { ex: ttlSeconds });
  } catch (error) {
    console.warn('[Redis] Set failed:', { key, error });
  }
}

/**
 * Store data in Redis asynchronously (fire-and-forget)
 * Use this when you don't want to wait for the cache write
 */
export function setCachedAsync<T>(
  key: string,
  data: T,
  ttlSeconds: number
): void {
  setCached(key, data, ttlSeconds).catch((error) => {
    console.error('[Redis] Async set failed:', { key, error });
  });
}

/**
 * Delete a cached key
 */
export async function deleteCached(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.warn('[Redis] Delete failed:', { key, error });
  }
}

/**
 * Generate cache key for GitHub commits
 */
export function getCommitsCacheKey(
  owner: string,
  repo: string,
  perPage: number,
  page: number,
  sha?: string,
  since?: string,
  until?: string,
): string {
  const range =
    since || until ? `:since=${since || ''}:until=${until || ''}` : '';
  return `github:v1:commits:${owner}/${repo}:${perPage}:${page}:${sha || 'HEAD'}${range}`;
}

/**
 * Generate cache key for ref→SHA mapping
 * Used to avoid GitHub API calls for resolving refs like "main" to commit SHAs
 */
export function getRefShaCacheKey(
  owner: string,
  repo: string,
  ref: string
): string {
  return `github:v1:ref:${owner}/${repo}:${ref}`;
}

/**
 * Generate cache key for GitHub tree data
 */
export function getTreeCacheKey(
  owner: string,
  repo: string,
  sha: string
): string {
  return `github:v1:tree:${owner}/${repo}:${sha}`;
}

/**
 * Generate cache key for individual commit details (by SHA)
 * SHA-based keys are immutable, so can be cached long-term
 */
export function getCommitDetailCacheKey(
  owner: string,
  repo: string,
  sha: string
): string {
  return `github:v1:commit:${owner}/${repo}:${sha}`;
}

/**
 * Generate cache key for tour availability
 * Keyed by PARENT repo - stores info about which fork has the tour
 */
export function getTourAvailabilityCacheKey(
  parentOwner: string,
  parentRepo: string
): string {
  return `tour-available:${parentOwner}/${parentRepo}`;
}
