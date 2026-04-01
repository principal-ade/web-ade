/**
 * S3 Cache for Line Counts
 *
 * Stores line count data per repository in S3.
 * Key pattern: line-counts/{owner}/{repo}.json
 *
 * This cache is populated by:
 * 1. Electron desktop app (for any repo size)
 * 2. Web-ADE (for repos under 2000 files, when user is logged in)
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.TTS_AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.TTS_S3_BUCKET || 'repo-tour-audio';
const CACHE_PREFIX = 'line-counts';

/**
 * Line counts cache data structure
 */
export interface LineCountsCache {
  owner: string;
  repo: string;
  generatedAt: string;
  generatedBy: 'electron-app' | 'web-ade';
  fileCount: number;
  lineCounts: Record<string, number>; // path → line count
}

/**
 * Response when line counts are not available
 */
export interface LineCountsUnavailable {
  available: false;
  reason: 'not-cached' | 'too-large' | 'auth-required';
  fileCount?: number;
  message: string;
}

/**
 * Response when line counts are available
 */
export interface LineCountsAvailable {
  available: true;
  data: LineCountsCache;
}

export type LineCountsResponse = LineCountsAvailable | LineCountsUnavailable;

/**
 * Generate S3 key for line counts cache
 */
export function generateLineCountsS3Key(owner: string, repo: string): string {
  return `${CACHE_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/**
 * Check if line counts exist in S3 cache
 */
export async function checkLineCountsCache(
  owner: string,
  repo: string
): Promise<boolean> {
  const key = generateLineCountsS3Key(owner, repo);

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get line counts from S3 cache
 *
 * @returns Line counts data if cached, null if not found
 */
export async function getLineCountsFromS3(
  owner: string,
  repo: string
): Promise<LineCountsCache | null> {
  const key = generateLineCountsS3Key(owner, repo);

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
    const data = JSON.parse(bodyString) as LineCountsCache;

    return data;
  } catch (error) {
    const errorCode = (error as { name?: string }).name;
    if (errorCode !== 'NoSuchKey') {
      console.warn('[Line Counts S3] Get error:', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

/**
 * Store line counts in S3 cache
 */
export async function storeLineCountsInS3(
  data: LineCountsCache
): Promise<void> {
  const key = generateLineCountsS3Key(data.owner, data.repo);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
        CacheControl: 'public, max-age=86400', // 24 hours
        Metadata: {
          'generated-at': data.generatedAt,
          'generated-by': data.generatedBy,
          'file-count': String(data.fileCount),
        },
      })
    );

    console.log('[Line Counts S3] Stored:', {
      owner: data.owner,
      repo: data.repo,
      fileCount: data.fileCount,
      generatedBy: data.generatedBy,
    });
  } catch (error) {
    console.error('[Line Counts S3] Store error:', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_STORE_ERROR');
  }
}

/**
 * Store line counts asynchronously (fire and forget)
 */
export function storeLineCountsInS3Async(data: LineCountsCache): void {
  storeLineCountsInS3(data).catch((err) => {
    console.error('[Line Counts S3] Async store failed:', err);
  });
}
