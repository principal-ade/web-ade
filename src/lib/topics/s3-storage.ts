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
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  INBOX_PREFIX,
  INDEX_CACHE_CONTROL,
  INDEX_FILE,
  MAX_ETAG_RETRIES,
  OUTBOX_PREFIX,
  PAYLOAD_CACHE_CONTROL,
  S3_PREFIX,
} from './constants';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicByUserEntry,
  type TopicByUserIndex,
  type TopicInboxIndex,
  type TopicInboxIndexEntry,
  type TopicOutboxIndex,
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
    ...(topic.status !== undefined ? { status: topic.status } : {}),
    ...(topic.visibility !== undefined ? { visibility: topic.visibility } : {}),
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
      // Stamp the owner login so the global feed can render bylines without
      // a per-topic fan-out. We always have it here (`createdBy`).
      return {
        ...data,
        githubLogin: topic.createdBy.githubLogin,
        entries: [entry, ...others],
      };
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

// ============================================================================
// Owner enumeration — powers the global `/topics` feed. The per-user
// manifests live as flat objects at `topics/_by-user/{githubId}.json`, so a
// single `LIST` of that prefix yields every creator who has at least one
// topic. (Unlike trails' repo tree, there's no nesting to walk here.)
// ============================================================================

/**
 * Enumerate every GitHub id that owns a by-user manifest. One `LIST` pass
 * (paged) over the `_by-user/` prefix; the caller fans out a manifest read
 * per id to build the feed.
 */
export async function listTopicOwnerIds(): Promise<number[]> {
  const prefix = `${S3_PREFIX}/_by-user/`;
  const ids: number[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      // `obj.Key` is `topics/_by-user/{githubId}.json`.
      const file = obj.Key.slice(prefix.length);
      const match = /^(\d+)\.json$/.exec(file);
      if (!match) continue;
      ids.push(Number(match[1]));
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return ids;
}

// ============================================================================
// Inbox — per-recipient topic delivery index keyed by GitHub numeric id so it
// survives login changes. Mirrors the trails inbox store
// ([[../trails/s3-storage.ts]]); the only difference is the topic-shaped
// entry/snapshot and the `topics/` prefix.
// ============================================================================

function inboxPrefix(githubId: number): string {
  return `${S3_PREFIX}/${INBOX_PREFIX}/${githubId}`;
}

export function buildTopicInboxIndexKey(githubId: number): string {
  return `${inboxPrefix(githubId)}/${INDEX_FILE}`;
}

export function buildTopicInboxEntryKey(
  githubId: number,
  topicId: string,
): string {
  return `${inboxPrefix(githubId)}/by-topic/${topicId}.json`;
}

function emptyInbox(): TopicInboxIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getInboxWithETag(
  githubId: number,
): Promise<{ data: TopicInboxIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildTopicInboxIndexKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TopicInboxIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Topics] Get inbox failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve inbox',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

async function putInboxWithETag(
  githubId: number,
  data: TopicInboxIndex,
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
      Key: buildTopicInboxIndexKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: INDEX_CACHE_CONTROL,
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
    console.error('[Topics] Put inbox failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save inbox',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

export async function getTopicInbox(
  githubId: number,
): Promise<TopicInboxIndex> {
  const result = await getInboxWithETag(githubId);
  return result ? result.data : emptyInbox();
}

/** Mutate the topic inbox index under optimistic locking. */
export async function updateTopicInbox(
  githubId: number,
  modifier: (data: TopicInboxIndex) => TopicInboxIndex,
): Promise<TopicInboxIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getInboxWithETag(githubId);
      const data = current ? current.data : emptyInbox();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putInboxWithETag(githubId, updated, etag);
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
 * Write a per-entry inbox object at
 * `topics/_inbox/{githubId}/by-topic/{topicId}.json` so point reads of a
 * single row (e.g. `POST /inbox/{id}/read`) don't scan the whole index.
 */
export async function putTopicInboxEntry(
  githubId: number,
  entry: TopicInboxIndexEntry,
): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildTopicInboxEntryKey(githubId, entry.topicId),
        Body: JSON.stringify(entry),
        ContentType: 'application/json',
        CacheControl: PAYLOAD_CACHE_CONTROL,
      }),
    );
  } catch (error: unknown) {
    console.error('[Topics] Put inbox entry failed:', {
      githubId,
      topicId: entry.topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save inbox entry',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

export async function deleteTopicInboxEntry(
  githubId: number,
  topicId: string,
): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildTopicInboxEntryKey(githubId, topicId),
      }),
    );
  } catch (error) {
    // Best-effort: a stale per-entry object is a rounding error against the
    // inbox index, which is the source of truth for membership.
    console.error('[Topics] Delete inbox entry failed:', {
      githubId,
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Point-read a single inbox row by `(githubId, topicId)` — one S3 GET against
 * the per-entry object, no full-index scan. Returns `null` when the topic was
 * never delivered to this user. Powers the private-topic read gate
 * ("was this topic sent to me?") without paging the whole inbox.
 */
export async function getTopicInboxEntry(
  githubId: number,
  topicId: string,
): Promise<TopicInboxIndexEntry | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildTopicInboxEntryKey(githubId, topicId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as TopicInboxIndexEntry;
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Topics] Get inbox entry failed:', {
      githubId,
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve inbox entry',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

// ============================================================================
// Outbox — sender-side mirror of the inbox keyed by the sender's numeric
// GitHub id. Written from the send route so a "Sent" view can list what the
// user has shared without scanning every recipient's inbox. Same ETag-locked
// flow as the inbox; no per-entry object (no read-state to point-read).
// ============================================================================

function outboxPrefix(githubId: number): string {
  return `${S3_PREFIX}/${OUTBOX_PREFIX}/${githubId}`;
}

export function buildTopicOutboxIndexKey(githubId: number): string {
  return `${outboxPrefix(githubId)}/${INDEX_FILE}`;
}

function emptyOutbox(): TopicOutboxIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getOutboxWithETag(
  githubId: number,
): Promise<{ data: TopicOutboxIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildTopicOutboxIndexKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TopicOutboxIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Topics] Get outbox failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve outbox',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

async function putOutboxWithETag(
  githubId: number,
  data: TopicOutboxIndex,
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
      Key: buildTopicOutboxIndexKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: INDEX_CACHE_CONTROL,
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
    console.error('[Topics] Put outbox failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save outbox',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

export async function getTopicOutbox(
  githubId: number,
): Promise<TopicOutboxIndex> {
  const result = await getOutboxWithETag(githubId);
  return result ? result.data : emptyOutbox();
}

/** Mutate the topic outbox index under optimistic locking. */
export async function updateTopicOutbox(
  githubId: number,
  modifier: (data: TopicOutboxIndex) => TopicOutboxIndex,
): Promise<TopicOutboxIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getOutboxWithETag(githubId);
      const data = current ? current.data : emptyOutbox();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putOutboxWithETag(githubId, updated, etag);
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
