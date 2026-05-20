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
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicByUserEntry,
  type TopicByUserIndex,
  type TopicPayload,
} from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

export function buildTopicKey(id: string): string {
  return `${S3_PREFIX}/_by-id/${id}.json`;
}

export function buildByUserKey(githubId: number): string {
  return `${S3_PREFIX}/_by-user/${githubId}.json`;
}

/** First ~140 chars of a topic description, single-lined for card previews. */
export function descriptionPreview(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 137).trimEnd()}…` : flat;
}

export function topicToByUserEntry(topic: TopicPayload): TopicByUserEntry {
  return {
    id: topic.id,
    title: topic.title,
    descriptionPreview: descriptionPreview(topic.description),
    trailCount: topic.trailIds.length,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
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

// ============================================================================
// Per-user manifest — powers "your topics" listings without a fan-out scan.
// Owner-only mutates a topic, so the manifest is single-writer per user and
// stays cheap to keep coherent under the same ETag-locked pattern repos use.
// ============================================================================

function emptyByUserIndex(): TopicByUserIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getByUserWithETag(
  githubId: number,
): Promise<{ data: TopicByUserIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildByUserKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TopicByUserIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Topics] Get by-user index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve topics index',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

async function putByUserWithETag(
  githubId: number,
  data: TopicByUserIndex,
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
    } = {
      Bucket: BUCKET_NAME,
      Key: buildByUserKey(githubId),
      Body: JSON.stringify(data, null, 2),
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
    console.error('[Topics] Put by-user index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save topics index',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

export async function getTopicsByUser(
  githubId: number,
): Promise<TopicByUserIndex> {
  const result = await getByUserWithETag(githubId);
  return result ? result.data : emptyByUserIndex();
}

export async function updateTopicsByUser(
  githubId: number,
  modifier: (data: TopicByUserIndex) => TopicByUserIndex,
): Promise<TopicByUserIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getByUserWithETag(githubId);
      const data = current ? current.data : emptyByUserIndex();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putByUserWithETag(githubId, updated, etag);
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

/**
 * Upsert (add or replace) a topic's row in its owner's by-user manifest.
 * Called from every owner-mutating route — create, patch, add/remove trail,
 * reorder — so the dashboard summary stays in sync without a fan-out scan.
 * Manifest mutations are best-effort: a failure here is logged but doesn't
 * fail the user-facing write (the by-id record is the source of truth).
 */
export async function upsertTopicInUserIndex(topic: TopicPayload): Promise<void> {
  try {
    await updateTopicsByUser(topic.createdBy.githubId, (data) => {
      const entry = topicToByUserEntry(topic);
      const others = data.entries.filter((e) => e.id !== topic.id);
      return { ...data, entries: [entry, ...others] };
    });
  } catch (error) {
    console.error('[Topics] Upsert by-user index failed:', {
      topicId: topic.id,
      githubId: topic.createdBy.githubId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function removeTopicFromUserIndex(
  githubId: number,
  topicId: string,
): Promise<void> {
  try {
    await updateTopicsByUser(githubId, (data) => ({
      ...data,
      entries: data.entries.filter((e) => e.id !== topicId),
    }));
  } catch (error) {
    console.error('[Topics] Remove from by-user index failed:', {
      topicId,
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
