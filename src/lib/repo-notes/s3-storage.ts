/**
 * S3 Storage for Repo Notes
 *
 * S3 Structure:
 *   repo-notes/{user-id}/notes.json
 *
 * Uses the same bucket as starred-collections with ETag-based optimistic locking.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { RepoNotesData } from './types';

const BUCKET_NAME = process.env.FEED_COLLECTIONS_S3_BUCKET || 'feed-collections';
const BUCKET_REGION = process.env.FEED_COLLECTIONS_AWS_REGION || 'us-east-1';
const MAX_ETAG_RETRIES = 3;

const s3Client = new S3Client({ region: BUCKET_REGION });

function buildS3Key(userId: string): string {
  return `repo-notes/${userId}/notes.json`;
}

function initializeNotesData(): RepoNotesData {
  return { notes: {}, updatedAt: new Date().toISOString() };
}

async function getWithETag(
  userId: string
): Promise<{ data: RepoNotesData; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: buildS3Key(userId) })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return { data: JSON.parse(body) as RepoNotesData, etag: response.ETag || '' };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      return null;
    }
    console.error('[Repo Notes] Get failed:', error);
    throw new Error('Failed to retrieve repo notes from storage');
  }
}

async function putWithETag(
  userId: string,
  data: RepoNotesData,
  etag: string | null
): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildS3Key(userId),
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=60',
        ...(etag ? { IfMatch: etag } : {}),
      })
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error.name === 'PreconditionFailed' || error.name === '412')
    ) {
      throw Object.assign(new Error('ETag conflict'), { code: 'ETAG_CONFLICT' });
    }
    console.error('[Repo Notes] Put failed:', error);
    throw new Error('Failed to save repo notes to storage');
  }
}

export async function getRepoNotes(userId: string): Promise<RepoNotesData | null> {
  const result = await getWithETag(userId);
  return result ? result.data : null;
}

export async function updateRepoNotes(
  userId: string,
  modifier: (data: RepoNotesData) => RepoNotesData
): Promise<RepoNotesData> {
  let attempts = 0;

  while (attempts < MAX_ETAG_RETRIES) {
    const result = await getWithETag(userId);
    const data = result ? result.data : initializeNotesData();
    const etag = result ? result.etag : null;

    const updated = modifier(data);
    updated.updatedAt = new Date().toISOString();

    try {
      await putWithETag(userId, updated, etag);
      return updated;
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ETAG_CONFLICT') {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new Error('Concurrent modification conflict - please retry');
        }
        await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Update failed after retries');
}
