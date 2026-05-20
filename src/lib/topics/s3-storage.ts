/**
 * S3 storage for topics.
 *
 * Layout:
 *   topics/_by-id/{id}.json   - the topic record (single object per topic)
 *
 * Topics aren't repo-scoped, so there's no per-repo manifest — every read
 * hits the by-id key directly. Mutations use ETag-locked read-modify-write
 * to keep concurrent edits (rare; only the owner mutates) coherent.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  MAX_ETAG_RETRIES,
  PAYLOAD_CACHE_CONTROL,
  S3_PREFIX,
} from './constants';
import { TopicErrorCodes, TopicShareError, type TopicPayload } from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

export function buildTopicKey(id: string): string {
  return `${S3_PREFIX}/_by-id/${id}.json`;
}

function isNoSuchKey(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'NoSuchKey'
  );
}

function isEtagConflict(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    ((error as { name: string }).name === 'PreconditionFailed' ||
      (error as { name: string }).name === '412')
  );
}

async function getTopicWithETag(
  id: string,
): Promise<{ data: TopicPayload; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: buildTopicKey(id) }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TopicPayload,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Topics] Get topic failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve topic',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

export async function getTopic(id: string): Promise<TopicPayload | null> {
  const result = await getTopicWithETag(id);
  return result ? result.data : null;
}

async function putTopicWithETag(
  topic: TopicPayload,
  etag: string | null,
): Promise<void> {
  try {
    const params: {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
      CacheControl: string;
      IfMatch?: string;
      IfNoneMatch?: string;
    } = {
      Bucket: BUCKET_NAME,
      Key: buildTopicKey(topic.id),
      Body: JSON.stringify(topic, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TopicShareError(
        'Concurrent modification detected',
        409,
        TopicErrorCodes.ETAG_CONFLICT,
      );
    }
    console.error('[Topics] Put topic failed:', {
      id: topic.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save topic',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

export async function putTopic(topic: TopicPayload): Promise<void> {
  // First write — no IfMatch. Mints the object; subsequent edits use
  // updateTopic for optimistic concurrency.
  await putTopicWithETag(topic, null);
}

export async function updateTopic(
  id: string,
  modifier: (current: TopicPayload) => TopicPayload,
): Promise<TopicPayload> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    const current = await getTopicWithETag(id);
    if (!current) {
      throw new TopicShareError('Topic not found', 404, TopicErrorCodes.NOT_FOUND);
    }
    const updated = modifier(current.data);
    updated.updatedAt = new Date().toISOString();
    try {
      await putTopicWithETag(updated, current.etag);
      return updated;
    } catch (error) {
      if (
        error instanceof TopicShareError &&
        error.code === TopicErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TopicShareError(
            'Concurrent modification conflict — please retry',
            409,
            TopicErrorCodes.MAX_RETRIES,
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new TopicShareError(
    'Update failed after retries',
    500,
    TopicErrorCodes.S3_ERROR,
  );
}

export async function deleteTopic(id: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: buildTopicKey(id) }),
    );
  } catch (error) {
    console.error('[Topics] Delete topic failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to delete topic',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}
