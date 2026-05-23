/**
 * S3 storage for per-user starred lists.
 *
 * Layout:
 *   topics/_starred/{githubId}/index.json   - starred topics for a user
 *   trails/_starred/{githubId}/index.json   - starred trails for a user
 *
 * Both indexes use ETag-locked read-modify-write (same pattern as the trails
 * inbox in `../trails/s3-storage.ts`). The starred entry shapes are small
 * (snapshot only) and the cap is 500, so single-file indexes are fine — no
 * per-entry sidecars.
 *
 * The stars surface deliberately does NOT mutate the underlying topic /
 * trail records. The by-id record is the source of truth; star indexes are
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
  MAX_STARRED_ENTRIES,
  PAYLOAD_CACHE_CONTROL,
  STARRED_PREFIX,
} from './constants';
import {
  StarError,
  StarErrorCodes,
  type StarredTopicEntry,
  type StarredTopicsIndex,
  type StarredTrailEntry,
  type StarredTrailsIndex,
} from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

// ============================================================================
// Key builders
// ============================================================================

export function buildStarredTopicsKey(githubId: number): string {
  return `${TOPICS_PREFIX}/${STARRED_PREFIX}/${githubId}/index.json`;
}

export function buildStarredTrailsKey(githubId: number): string {
  return `${TRAILS_PREFIX}/${STARRED_PREFIX}/${githubId}/index.json`;
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
// Starred topics — read / write
// ============================================================================

function emptyTopicsIndex(): StarredTopicsIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getStarredTopicsWithETag(
  githubId: number,
): Promise<{ data: StarredTopicsIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildStarredTopicsKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as StarredTopicsIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Stars] Get starred-topics index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StarError(
      'Failed to retrieve starred topics index',
      500,
      StarErrorCodes.S3_ERROR,
    );
  }
}

async function putStarredTopicsWithETag(
  githubId: number,
  data: StarredTopicsIndex,
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
      Key: buildStarredTopicsKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new StarError(
        'Concurrent modification detected',
        409,
        StarErrorCodes.ETAG_CONFLICT,
      );
    }
    console.error('[Stars] Put starred-topics index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StarError(
      'Failed to save starred topics index',
      500,
      StarErrorCodes.S3_ERROR,
    );
  }
}

export async function getStarredTopics(
  githubId: number,
): Promise<StarredTopicsIndex> {
  const result = await getStarredTopicsWithETag(githubId);
  return result ? result.data : emptyTopicsIndex();
}

export async function updateStarredTopics(
  githubId: number,
  modifier: (data: StarredTopicsIndex) => StarredTopicsIndex,
): Promise<StarredTopicsIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getStarredTopicsWithETag(githubId);
      const data = current ? current.data : emptyTopicsIndex();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putStarredTopicsWithETag(githubId, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof StarError &&
        error.code === StarErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new StarError(
            'Concurrent modification conflict — please retry',
            409,
            StarErrorCodes.MAX_RETRIES,
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new StarError(
    'Update failed after retries',
    500,
    StarErrorCodes.S3_ERROR,
  );
}

// ============================================================================
// Starred trails — read / write
// ============================================================================

function emptyTrailsIndex(): StarredTrailsIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getStarredTrailsWithETag(
  githubId: number,
): Promise<{ data: StarredTrailsIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildStarredTrailsKey(githubId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as StarredTrailsIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Stars] Get starred-trails index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StarError(
      'Failed to retrieve starred trails index',
      500,
      StarErrorCodes.S3_ERROR,
    );
  }
}

async function putStarredTrailsWithETag(
  githubId: number,
  data: StarredTrailsIndex,
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
      Key: buildStarredTrailsKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new StarError(
        'Concurrent modification detected',
        409,
        StarErrorCodes.ETAG_CONFLICT,
      );
    }
    console.error('[Stars] Put starred-trails index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StarError(
      'Failed to save starred trails index',
      500,
      StarErrorCodes.S3_ERROR,
    );
  }
}

export async function getStarredTrails(
  githubId: number,
): Promise<StarredTrailsIndex> {
  const result = await getStarredTrailsWithETag(githubId);
  return result ? result.data : emptyTrailsIndex();
}

export async function updateStarredTrails(
  githubId: number,
  modifier: (data: StarredTrailsIndex) => StarredTrailsIndex,
): Promise<StarredTrailsIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getStarredTrailsWithETag(githubId);
      const data = current ? current.data : emptyTrailsIndex();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putStarredTrailsWithETag(githubId, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof StarError &&
        error.code === StarErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new StarError(
            'Concurrent modification conflict — please retry',
            409,
            StarErrorCodes.MAX_RETRIES,
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new StarError(
    'Update failed after retries',
    500,
    StarErrorCodes.S3_ERROR,
  );
}

// ============================================================================
// High-level mutations
//
// Returned `pruned` flag tells the caller whether the 500-entry cap was hit
// on this append. Route handlers translate that into a `STAR_LIMIT_REACHED`
// warning on the 200 response.
// ============================================================================

export interface StarUpsertResult<TEntry> {
  entry: TEntry;
  pruned: boolean;
}

/**
 * Insert-or-refresh a topic in the user's starred list. Re-starring an
 * already-starred topic moves the row to the head (refreshed `starredAt`)
 * and replaces the snapshot.
 */
export async function upsertStarredTopic(
  githubId: number,
  entry: StarredTopicEntry,
): Promise<StarUpsertResult<StarredTopicEntry>> {
  let pruned = false;
  await updateStarredTopics(githubId, (data) => {
    const others = data.entries.filter((e) => e.topicId !== entry.topicId);
    const next = [entry, ...others];
    if (next.length > MAX_STARRED_ENTRIES) {
      pruned = true;
      next.length = MAX_STARRED_ENTRIES;
    }
    return { ...data, entries: next };
  });
  return { entry, pruned };
}

export async function removeStarredTopic(
  githubId: number,
  topicId: string,
): Promise<void> {
  await updateStarredTopics(githubId, (data) => ({
    ...data,
    entries: data.entries.filter((e) => e.topicId !== topicId),
  }));
}

export async function upsertStarredTrail(
  githubId: number,
  entry: StarredTrailEntry,
): Promise<StarUpsertResult<StarredTrailEntry>> {
  let pruned = false;
  await updateStarredTrails(githubId, (data) => {
    const others = data.entries.filter((e) => e.trailId !== entry.trailId);
    const next = [entry, ...others];
    if (next.length > MAX_STARRED_ENTRIES) {
      pruned = true;
      next.length = MAX_STARRED_ENTRIES;
    }
    return { ...data, entries: next };
  });
  return { entry, pruned };
}

export async function removeStarredTrail(
  githubId: number,
  trailId: string,
): Promise<void> {
  await updateStarredTrails(githubId, (data) => ({
    ...data,
    entries: data.entries.filter((e) => e.trailId !== trailId),
  }));
}

// ============================================================================
// Membership checks — back the `starred` field on by-id GET responses.
// These do a full index read; the index is small (max 500 entries) and S3
// cache-control gives detail-fetch traffic a 60s warm window.
// ============================================================================

export async function isTopicStarred(
  githubId: number,
  topicId: string,
): Promise<boolean> {
  const index = await getStarredTopics(githubId);
  return index.entries.some((e) => e.topicId === topicId);
}

export async function isTrailStarred(
  githubId: number,
  trailId: string,
): Promise<boolean> {
  const index = await getStarredTrails(githubId);
  return index.entries.some((e) => e.trailId === trailId);
}

// ============================================================================
// Lazy snapshot refresh — called from the detail-fetch path. If the caller
// has the topic / trail starred and its `updatedAt` has advanced since the
// snapshot was taken, patch the snapshot in the index. Best-effort: a
// failure here is logged but doesn't fail the user-facing read.
// ============================================================================

export async function refreshStarredTopicSnapshot(
  githubId: number,
  topicId: string,
  liveSnapshot: StarredTopicEntry['snapshot'],
): Promise<void> {
  try {
    await updateStarredTopics(githubId, (data) => {
      const idx = data.entries.findIndex((e) => e.topicId === topicId);
      const existing = idx === -1 ? undefined : data.entries[idx];
      if (!existing) return data;
      if (existing.snapshot.updatedAt === liveSnapshot.updatedAt) return data;
      const next = [...data.entries];
      next[idx] = { ...existing, snapshot: liveSnapshot };
      return { ...data, entries: next };
    });
  } catch (error) {
    console.error('[Stars] Refresh starred-topic snapshot failed:', {
      githubId,
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function refreshStarredTrailSnapshot(
  githubId: number,
  trailId: string,
  liveSnapshot: StarredTrailEntry['snapshot'],
): Promise<void> {
  try {
    await updateStarredTrails(githubId, (data) => {
      const idx = data.entries.findIndex((e) => e.trailId === trailId);
      const existing = idx === -1 ? undefined : data.entries[idx];
      if (!existing) return data;
      if (existing.snapshot.updatedAt === liveSnapshot.updatedAt) return data;
      const next = [...data.entries];
      next[idx] = { ...existing, snapshot: liveSnapshot };
      return { ...data, entries: next };
    });
  } catch (error) {
    console.error('[Stars] Refresh starred-trail snapshot failed:', {
      githubId,
      trailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
