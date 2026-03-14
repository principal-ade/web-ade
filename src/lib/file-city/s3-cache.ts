/**
 * S3 Cache for File City Images
 *
 * Reuses the TTS S3 bucket for caching generated File City PNG images.
 * Key pattern: file-city/{owner}/{repo}/{width}x{height}.png
 */

import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

// Reuse TTS S3 client configuration
const s3Client = new S3Client({
  region: process.env.TTS_AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.TTS_S3_BUCKET || 'repo-tour-audio';

/**
 * Generates S3 key for a File City image
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param width - Image width
 * @param height - Image height
 * @returns S3 object key
 */
export function generateFileCityS3Key(
  owner: string,
  repo: string,
  width: number,
  height: number
): string {
  return `file-city/${owner}/${repo}/${width}x${height}.png`;
}

/**
 * Checks if a File City image exists in S3 cache
 *
 * @param key - S3 object key
 * @returns true if image exists, false otherwise
 */
export async function checkFileCityCache(key: string): Promise<boolean> {
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
 * Uploads a File City PNG to S3
 *
 * @param key - S3 object key
 * @param imageBuffer - PNG image data
 * @param metadata - Optional metadata
 * @returns Public URL to the uploaded image
 */
export async function uploadFileCityImage(
  key: string,
  imageBuffer: Buffer,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000', // 1 year
        Metadata: {
          'generated-at': new Date().toISOString(),
          ...metadata,
        },
      })
    );

    return getFileCityUrl(key);
  } catch (error) {
    console.error('[File City S3] Upload failed:', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_UPLOAD_ERROR');
  }
}

/**
 * Generates public URL for a File City image
 *
 * @param key - S3 object key
 * @returns Public URL
 */
export function getFileCityUrl(key: string): string {
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${key}`;
  }
  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
}
