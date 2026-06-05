/**
 * S3 storage for per-user bookmarked lists.
 *
 * Layout:
 *   topics/_bookmarked/{githubId}/index.json   - bookmarked topics for a user
 *   trails/_bookmarked/{githubId}/index.json   - bookmarked trails for a user
 *
 * Both indexes use ETag-locked read-modify-write (same pattern as the trails
 * inbox in `../trails/s3-storage.ts`). The bookmarked entry shapes are small
 * (snapshot only) and the cap is 500, so single-file indexes are fine — no
 * per-entry sidecars.
 *
 * The bookmarks surface deliberately does NOT mutate the underlying topic /
 * trail records. The by-id record is the source of truth; bookmark indexes are
 * thin recipient-side indirection.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3_PREFIX as TOPICS_PREFIX } from '../topics/constants';
import { S3_PREFIX as TRAILS_PREFIX } from '../trails/constants';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  MAX_ETAG_RETRIES,
  MAX_BOOKMARKED_ENTRIES,
  PAYLOAD_CACHE_CONTROL,
  BOOKMARKED_PREFIX,
} from './constants';
import {
  BookmarkError,
  BookmarkErrorCodes,
  type BookmarkedTopicEntry,
  type BookmarkedTopicsIndex,
  type BookmarkedTrailEntry,
  type BookmarkedTrailsIndex,
} from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

// ============================================================================
// Key builders
// ============================================================================

export function buildBookmarkedTopicsKey(githubId: number): string {
  return `${TOPICS_PREFIX}/${BOOKMARKED_PREFIX}/${githubId}/index.json`;
}

export function buildBookmarkedTrailsKey(githubId: number): string {
  return `${TRAILS_PREFIX}/${BOOKMARKED_PREFIX}/${githubId}/index.json`;
}

// ============================================================================
// Error classification
// ============================================================================

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

// ============================================================================
// Bookmarked topics — read / write
// ============================================================================

function emptyTopicsIndex(): BookmarkedTopicsIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getBookmarkedTopicsWithETag(
  githubId: number,
): Promise<{ data: BookmarkedTopicsIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildBookmarkedTopicsKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as BookmarkedTopicsIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Bookmarks] Get bookmarked-topics index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new BookmarkError(
      'Failed to retrieve bookmarked topics index',
      500,
      BookmarkErrorCodes.S3_ERROR,
    );
  }
}

async function putBookmarkedTopicsWithETag(
  githubId: number,
  data: BookmarkedTopicsIndex,
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
      Key: buildBookmarkedTopicsKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new BookmarkError(
        'Concurrent modification detected',
        409,
        BookmarkErrorCodes.ETAG_CONFLICT,
      );
    }
    console.error('[Bookmarks] Put bookmarked-topics index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new BookmarkError(
      'Failed to save bookmarked topics index',
      500,
      BookmarkErrorCodes.S3_ERROR,
    );
  }
}

export async function getBookmarkedTopics(
  githubId: number,
): Promise<BookmarkedTopicsIndex> {
  const result = await getBookmarkedTopicsWithETag(githubId);
  return result ? result.data : emptyTopicsIndex();
}

export async function updateBookmarkedTopics(
  githubId: number,
  modifier: (data: BookmarkedTopicsIndex) => BookmarkedTopicsIndex,
): Promise<BookmarkedTopicsIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getBookmarkedTopicsWithETag(githubId);
      const data = current ? current.data : emptyTopicsIndex();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putBookmarkedTopicsWithETag(githubId, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof BookmarkError &&
        error.code === BookmarkErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new BookmarkError(
            'Concurrent modification conflict — please retry',
            409,
            BookmarkErrorCodes.MAX_RETRIES,
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new BookmarkError(
    'Update failed after retries',
    500,
    BookmarkErrorCodes.S3_ERROR,
  );
}

// ============================================================================
// Bookmarked trails — read / write
// ============================================================================

function emptyTrailsIndex(): BookmarkedTrailsIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getBookmarkedTrailsWithETag(
  githubId: number,
): Promise<{ data: BookmarkedTrailsIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildBookmarkedTrailsKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as BookmarkedTrailsIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Bookmarks] Get bookmarked-trails index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new BookmarkError(
      'Failed to retrieve bookmarked trails index',
      500,
      BookmarkErrorCodes.S3_ERROR,
    );
  }
}

async function putBookmarkedTrailsWithETag(
  githubId: number,
  data: BookmarkedTrailsIndex,
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
      Key: buildBookmarkedTrailsKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new BookmarkError(
        'Concurrent modification detected',
        409,
        BookmarkErrorCodes.ETAG_CONFLICT,
      );
    }
    console.error('[Bookmarks] Put bookmarked-trails index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new BookmarkError(
      'Failed to save bookmarked trails index',
      500,
      BookmarkErrorCodes.S3_ERROR,
    );
  }
}

export async function getBookmarkedTrails(
  githubId: number,
): Promise<BookmarkedTrailsIndex> {
  const result = await getBookmarkedTrailsWithETag(githubId);
  return result ? result.data : emptyTrailsIndex();
}

export async function updateBookmarkedTrails(
  githubId: number,
  modifier: (data: BookmarkedTrailsIndex) => BookmarkedTrailsIndex,
): Promise<BookmarkedTrailsIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getBookmarkedTrailsWithETag(githubId);
      const data = current ? current.data : emptyTrailsIndex();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putBookmarkedTrailsWithETag(githubId, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof BookmarkError &&
        error.code === BookmarkErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new BookmarkError(
            'Concurrent modification conflict — please retry',
            409,
            BookmarkErrorCodes.MAX_RETRIES,
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new BookmarkError(
    'Update failed after retries',
    500,
    BookmarkErrorCodes.S3_ERROR,
  );
}

// ============================================================================
// High-level mutations
//
// Returned `pruned` flag tells the caller whether the 500-entry cap was hit
// on this append. Route handlers translate that into a `BOOKMARK_LIMIT_REACHED`
// warning on the 200 response.
// ============================================================================

export interface BookmarkUpsertResult<TEntry> {
  entry: TEntry;
  pruned: boolean;
}

/**
 * Insert-or-refresh a topic in the user's bookmarked list. Re-bookmarkring an
 * already-bookmarked topic moves the row to the head (refreshed `bookmarkedAt`)
 * and replaces the snapshot.
 */
export async function upsertBookmarkedTopic(
  githubId: number,
  entry: BookmarkedTopicEntry,
): Promise<BookmarkUpsertResult<BookmarkedTopicEntry>> {
  let pruned = false;
  await updateBookmarkedTopics(githubId, (data) => {
    const others = data.entries.filter((e) => e.topicId !== entry.topicId);
    const next = [entry, ...others];
    if (next.length > MAX_BOOKMARKED_ENTRIES) {
      pruned = true;
      next.length = MAX_BOOKMARKED_ENTRIES;
    }
    return { ...data, entries: next };
  });
  return { entry, pruned };
}

export async function removeBookmarkedTopic(
  githubId: number,
  topicId: string,
): Promise<void> {
  await updateBookmarkedTopics(githubId, (data) => ({
    ...data,
    entries: data.entries.filter((e) => e.topicId !== topicId),
  }));
}

export async function upsertBookmarkedTrail(
  githubId: number,
  entry: BookmarkedTrailEntry,
): Promise<BookmarkUpsertResult<BookmarkedTrailEntry>> {
  let pruned = false;
  await updateBookmarkedTrails(githubId, (data) => {
    const others = data.entries.filter((e) => e.trailId !== entry.trailId);
    const next = [entry, ...others];
    if (next.length > MAX_BOOKMARKED_ENTRIES) {
      pruned = true;
      next.length = MAX_BOOKMARKED_ENTRIES;
    }
    return { ...data, entries: next };
  });
  return { entry, pruned };
}

export async function removeBookmarkedTrail(
  githubId: number,
  trailId: string,
): Promise<void> {
  await updateBookmarkedTrails(githubId, (data) => ({
    ...data,
    entries: data.entries.filter((e) => e.trailId !== trailId),
  }));
}

// ============================================================================
// Membership checks — back the `bookmarked` field on by-id GET responses.
// These do a full index read; the index is small (max 500 entries) and S3
// cache-control gives detail-fetch traffic a 60s warm window.
// ============================================================================

export async function isTopicBookmarked(
  githubId: number,
  topicId: string,
): Promise<boolean> {
  const index = await getBookmarkedTopics(githubId);
  return index.entries.some((e) => e.topicId === topicId);
}

export async function isTrailBookmarked(
  githubId: number,
  trailId: string,
): Promise<boolean> {
  const index = await getBookmarkedTrails(githubId);
  return index.entries.some((e) => e.trailId === trailId);
}

// ============================================================================
// Lazy snapshot refresh — called from the detail-fetch path. If the caller
// has the topic / trail bookmarked and its `updatedAt` has advanced since the
// snapshot was taken, patch the snapshot in the index. Best-effort: a
// failure here is logged but doesn't fail the user-facing read.
// ============================================================================

export async function refreshBookmarkedTopicSnapshot(
  githubId: number,
  topicId: string,
  liveSnapshot: BookmarkedTopicEntry['snapshot'],
): Promise<void> {
  try {
    await updateBookmarkedTopics(githubId, (data) => {
      const idx = data.entries.findIndex((e) => e.topicId === topicId);
      const existing = idx === -1 ? undefined : data.entries[idx];
      if (!existing) return data;
      if (existing.snapshot.updatedAt === liveSnapshot.updatedAt) return data;
      const next = [...data.entries];
      next[idx] = { ...existing, snapshot: liveSnapshot };
      return { ...data, entries: next };
    });
  } catch (error) {
    console.error('[Bookmarks] Refresh bookmarked-topic snapshot failed:', {
      githubId,
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function refreshBookmarkedTrailSnapshot(
  githubId: number,
  trailId: string,
  liveSnapshot: BookmarkedTrailEntry['snapshot'],
): Promise<void> {
  try {
    await updateBookmarkedTrails(githubId, (data) => {
      const idx = data.entries.findIndex((e) => e.trailId === trailId);
      const existing = idx === -1 ? undefined : data.entries[idx];
      if (!existing) return data;
      if (existing.snapshot.updatedAt === liveSnapshot.updatedAt) return data;
      const next = [...data.entries];
      next[idx] = { ...existing, snapshot: liveSnapshot };
      return { ...data, entries: next };
    });
  } catch (error) {
    console.error('[Bookmarks] Refresh bookmarked-trail snapshot failed:', {
      githubId,
      trailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
