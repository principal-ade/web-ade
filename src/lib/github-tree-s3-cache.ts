/**
 * S3 Cache for GitHub Tree Data
 *
 * Caches GitHub tree API responses in S3 for persistence across Lambda invocations.
 * Key pattern: github-trees/{owner}/{repo}/{sha}.json
 *
 * Since SHA-based lookups are immutable (a tree at a given SHA never changes),
 * we can cache these indefinitely.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.TTS_AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.TTS_S3_BUCKET || 'repo-tour-audio';
const CACHE_PREFIX = 'github-trees';

// Cache TTL in seconds (7 days - SHA-based so effectively immutable)
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
    url?: string;
  }>;
  truncated: boolean;
  // Set by github.getTree (not persisted to S3/Redis) when the requested ref
  // was missing on GitHub and the default branch was served instead. See the
  // fallback in src/server/routers/github.ts.
  fellBackToDefaultBranch?: boolean;
}

/**
 * Generate S3 key for a tree cache entry
 */
export function generateTreeCacheKey(owner: string, repo: string, sha: string): string {
  return `${CACHE_PREFIX}/${owner}/${repo}/${sha}.json`;
}

/**
 * Get cached tree data from S3
 *
 * @returns Tree data if cached, null if not found or expired
 */
export async function getTreeFromS3Cache(
  owner: string,
  repo: string,
  sha: string
): Promise<GitHubTreeResponse | null> {
  const key = generateTreeCacheKey(owner, repo, sha);

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) {
      return null;
    }

    const bodyString = await response.Body.transformToString();
    const data = JSON.parse(bodyString) as GitHubTreeResponse;

    return data;
  } catch (error) {
    // NoSuchKey or other errors - treat as cache miss
    const errorCode = (error as { name?: string }).name;
    if (errorCode !== 'NoSuchKey') {
      console.warn('[S3 Tree Cache] Get error:', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

/**
 * Store tree data in S3 cache
 *
 * Stores asynchronously - doesn't block the response
 */
export async function storeTreeInS3Cache(
  owner: string,
  repo: string,
  sha: string,
  treeData: GitHubTreeResponse
): Promise<void> {
  const key = generateTreeCacheKey(owner, repo, sha);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(treeData),
        ContentType: 'application/json',
        CacheControl: `public, max-age=${CACHE_TTL_SECONDS}`,
        Metadata: {
          'cached-at': new Date().toISOString(),
          'tree-sha': treeData.sha,
          'file-count': String(treeData.tree.length),
        },
      })
    );
  } catch (error) {
    // Log but don't throw - caching failures shouldn't break the request
    console.error('[S3 Tree Cache] Store error:', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Store tree in S3 without blocking (fire and forget)
 */
export function storeTreeInS3CacheAsync(
  owner: string,
  repo: string,
  sha: string,
  treeData: GitHubTreeResponse
): void {
  // Fire and forget - don't await
  storeTreeInS3Cache(owner, repo, sha, treeData).catch((err) => {
    console.error('[S3 Tree Cache] Async store failed:', err);
  });
}
