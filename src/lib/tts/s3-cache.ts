/**
 * S3 Cache Manager
 *
 * Handles caching of TTS audio files in S3 for cost optimization.
 */

import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';

// Initialize S3 client with IAM role credentials from Amplify
const s3Client = new S3Client({
  region: process.env.TTS_AWS_REGION || 'us-east-1',
  // Credentials auto-detected from Amplify IAM role - no keys needed
});

const BUCKET_NAME = process.env.TTS_S3_BUCKET || 'repo-tour-audio';

/**
 * Checks if audio file exists in S3 cache
 *
 * Uses HEAD request to check existence without downloading the file.
 *
 * @param key - S3 object key
 * @returns true if object exists, false otherwise
 */
export async function checkS3Cache(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    return true;
  } catch {
    // Object doesn't exist (NoSuchKey error)
    return false;
  }
}

/**
 * Uploads audio buffer to S3 with appropriate cache headers
 *
 * @param key - S3 object key
 * @param audioBuffer - MP3 audio data
 * @param metadata - Optional metadata to attach to object
 * @returns Public URL to the uploaded audio
 * @throws Error if upload fails
 */
export async function uploadToS3(
  key: string,
  audioBuffer: Buffer,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: audioBuffer,
        ContentType: 'audio/mpeg',
        CacheControl: 'public, max-age=31536000', // 1 year
        Metadata: {
          'generated-at': new Date().toISOString(),
          ...metadata,
        },
      })
    );

    // Return public URL
    return getS3Url(key);
  } catch (error) {
    console.error('[S3 Cache] Upload failed:', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Gets metadata from S3 object without downloading it
 *
 * @param key - S3 object key
 * @returns Metadata object or null if object doesn't exist
 */
export async function getS3Metadata(
  key: string
): Promise<Record<string, string> | null> {
  try {
    const response: HeadObjectCommandOutput = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    return response.Metadata || null;
  } catch {
    return null;
  }
}

/**
 * Reads and parses a JSON object from S3.
 *
 * Used for small sidecar metadata (e.g. the per-tour audio manifest), not audio
 * blobs. Returns `null` when the key is absent or the body can't be parsed, so
 * callers can treat "no manifest yet" and "unreadable manifest" the same way.
 *
 * @param key - S3 object key
 * @returns Parsed object, or null if missing/unreadable
 */
export async function getS3Json<T>(key: string): Promise<T | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch {
    // Missing key, access error, or invalid JSON — caller falls back to default.
    return null;
  }
}

/**
 * Writes a value as a JSON object to S3.
 *
 * No long-lived cache headers (unlike audio): manifests change as tours are
 * generated/edited, so they must always reflect the latest write.
 *
 * @param key - S3 object key
 * @param value - JSON-serializable value
 * @throws Error if upload fails
 */
export async function putS3Json(key: string, value: unknown): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: 'application/json',
        CacheControl: 'no-cache',
      })
    );
  } catch (error) {
    console.error('[S3 Cache] JSON upload failed:', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Generates public URL for S3 object
 *
 * If CDN_DOMAIN is configured, uses CDN URL. Otherwise uses direct S3 URL.
 *
 * @param key - S3 object key
 * @returns Public URL to access the object
 */
export function getS3Url(key: string): string {
  // If CDN is configured (e.g., CloudFront), use it
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${key}`;
  }

  // Otherwise use direct S3 URL
  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

/**
 * Result of checking cache with fallback
 */
export interface CacheCheckResult {
  /** Whether audio was found in cache */
  cached: boolean;
  /** The S3 key to use (legacy if found, otherwise content-based) */
  key: string;
  /** Whether the cached version was from legacy key */
  isLegacy: boolean;
}

/**
 * Checks S3 cache with fallback to legacy key format
 *
 * For backward compatibility, checks the legacy key first (commit-based).
 * If not found, returns the new content-based key for generation.
 *
 * @param contentKey - New content-based S3 key
 * @param legacyKey - Old commit-based S3 key
 * @returns Cache check result with key to use
 */
export async function checkS3CacheWithFallback(
  contentKey: string,
  legacyKey: string
): Promise<CacheCheckResult> {
  // Check legacy key first for backward compatibility
  const legacyCached = await checkS3Cache(legacyKey);
  if (legacyCached) {
    return {
      cached: true,
      key: legacyKey,
      isLegacy: true,
    };
  }

  // Check content-based key
  const contentCached = await checkS3Cache(contentKey);
  if (contentCached) {
    return {
      cached: true,
      key: contentKey,
      isLegacy: false,
    };
  }

  // Not cached - use content-based key for new uploads
  return {
    cached: false,
    key: contentKey,
    isLegacy: false,
  };
}
