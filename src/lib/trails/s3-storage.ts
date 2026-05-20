/**
 * S3 storage for shared trails.
 *
 * Layout:
 *   trails/{owner}/{repo}/index.json   - per-repo manifest (ETag-locked)
 *   trails/{owner}/{repo}/{id}.json    - per-payload object
 *   trails/_by-id/{id}.json            - id → {owner, repo} pointer
 *
 * The manifest is updated under optimistic-locking with retries (mirrors
 * starred-collections + sequence-diagrams). Per-payload objects are
 * id-scoped and don't need locking. The by-id pointer lets share links
 * resolve a trail without carrying owner/repo in the URL — that's what
 * `/trail/{id}` consumes.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  S3_PREFIX,
  INDEX_FILE,
  INDEX_CACHE_CONTROL,
  PAYLOAD_CACHE_CONTROL,
  INBOX_PREFIX,
  MAX_ETAG_RETRIES,
} from './constants';
import { TrailShareError, ShareErrorCodes } from './types';
import type {
  TrailPayload,
  SharedTrailIndex,
  SharedTrailIndexEntry,
  TrailByUserEntry,
  TrailByUserIndex,
  TrailRecentlyVisitedEntry,
  TrailRecentlyVisitedIndex,
  InboxIndex,
  InboxIndexEntry,
} from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

// ============================================================================
// Key builders
// ============================================================================

function repoPrefix(owner: string, repo: string): string {
  return `${S3_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function buildIndexKey(owner: string, repo: string): string {
  return `${repoPrefix(owner, repo)}/${INDEX_FILE}`;
}

export function buildPayloadKey(
  owner: string,
  repo: string,
  id: string
): string {
  return `${repoPrefix(owner, repo)}/${id}.json`;
}

export function buildIdPointerKey(id: string): string {
  return `${S3_PREFIX}/_by-id/${id}.json`;
}

export function buildByUserKey(githubId: number): string {
  return `${S3_PREFIX}/_by-user/${githubId}.json`;
}

export function buildRecentlyVisitedKey(githubId: number): string {
  return `${S3_PREFIX}/_recently-visited/${githubId}.json`;
}

interface IdPointer {
  owner: string;
  repo: string;
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

function emptyIndex(): SharedTrailIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

// ============================================================================
// Index operations
// ============================================================================

async function getIndexWithETag(
  owner: string,
  repo: string
): Promise<{ data: SharedTrailIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildIndexKey(owner, repo),
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return {
      data: JSON.parse(body) as SharedTrailIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;

    console.error('[Trails] Get index failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve trail index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putIndexWithETag(
  owner: string,
  repo: string,
  data: SharedTrailIndex,
  etag: string | null
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
      Key: buildIndexKey(owner, repo),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: INDEX_CACHE_CONTROL,
    };

    if (etag) params.IfMatch = etag;

    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TrailShareError(
        'Concurrent modification detected',
        409,
        ShareErrorCodes.ETAG_CONFLICT
      );
    }

    console.error('[Trails] Put index failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save trail index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getIndex(
  owner: string,
  repo: string
): Promise<SharedTrailIndex> {
  const result = await getIndexWithETag(owner, repo);
  return result ? result.data : emptyIndex();
}

export async function updateIndex(
  owner: string,
  repo: string,
  modifier: (data: SharedTrailIndex) => SharedTrailIndex
): Promise<SharedTrailIndex> {
  let attempts = 0;

  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getIndexWithETag(owner, repo);
      const data = current ? current.data : emptyIndex();
      const etag = current ? current.etag : null;

      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();

      await putIndexWithETag(owner, repo, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof TrailShareError &&
        error.code === ShareErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TrailShareError(
            'Concurrent modification conflict — please retry',
            409,
            ShareErrorCodes.MAX_RETRIES
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }

  throw new TrailShareError(
    'Update failed after retries',
    500,
    ShareErrorCodes.S3_ERROR
  );
}

// ============================================================================
// Payload operations
// ============================================================================

export async function getPayload(
  owner: string,
  repo: string,
  id: string
): Promise<TrailPayload | null> {
  const result = await getPayloadWithETag(owner, repo, id);
  return result ? result.data : null;
}

async function getPayloadWithETag(
  owner: string,
  repo: string,
  id: string
): Promise<{ data: TrailPayload; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildPayloadKey(owner, repo, id),
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return {
      data: JSON.parse(body) as TrailPayload,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;

    console.error('[Trails] Get payload failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve trail payload',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function putPayload(
  owner: string,
  repo: string,
  id: string,
  payload: TrailPayload
): Promise<{ sizeBytes: number }> {
  return putPayloadWithETag(owner, repo, id, payload, null);
}

async function putPayloadWithETag(
  owner: string,
  repo: string,
  id: string,
  payload: TrailPayload,
  etag: string | null
): Promise<{ sizeBytes: number }> {
  const body = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(body, 'utf8');

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
      Key: buildPayloadKey(owner, repo, id),
      Body: body,
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };

    if (etag) params.IfMatch = etag;

    await s3Client.send(new PutObjectCommand(params));

    return { sizeBytes };
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TrailShareError(
        'Concurrent modification detected',
        409,
        ShareErrorCodes.ETAG_CONFLICT
      );
    }

    console.error('[Trails] Put payload failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save trail payload',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

/**
 * Mutate a trail payload under optimistic concurrency. Mirrors
 * `updateIndex` — reads the current object with its ETag, applies the
 * modifier, and writes back with `IfMatch`. Retries up to MAX_ETAG_RETRIES
 * on conflict before surfacing a 409. Returns the new payload.
 */
export async function updatePayload(
  owner: string,
  repo: string,
  id: string,
  modifier: (data: TrailPayload) => TrailPayload
): Promise<TrailPayload> {
  let attempts = 0;

  while (attempts < MAX_ETAG_RETRIES) {
    const current = await getPayloadWithETag(owner, repo, id);
    if (!current) {
      throw new TrailShareError(
        'Trail not found',
        404,
        ShareErrorCodes.NOT_FOUND
      );
    }

    const updated = modifier(current.data);

    try {
      await putPayloadWithETag(owner, repo, id, updated, current.etag);
      return updated;
    } catch (error) {
      if (
        error instanceof TrailShareError &&
        error.code === ShareErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TrailShareError(
            'Concurrent modification conflict — please retry',
            409,
            ShareErrorCodes.MAX_RETRIES
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }

  throw new TrailShareError(
    'Update failed after retries',
    500,
    ShareErrorCodes.S3_ERROR
  );
}

export async function deletePayload(
  owner: string,
  repo: string,
  id: string
): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildPayloadKey(owner, repo, id),
      })
    );
  } catch (error) {
    console.error('[Trails] Delete payload failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to delete trail payload',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export function findIndexEntry(
  index: SharedTrailIndex,
  id: string
): SharedTrailIndexEntry | undefined {
  return index.entries.find((e) => e.id === id);
}

// ============================================================================
// Id pointer (for repo-less share links: /trail/{id})
// ============================================================================

export async function getIdPointer(id: string): Promise<IdPointer | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildIdPointerKey(id),
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    const parsed = JSON.parse(body) as Partial<IdPointer>;
    if (typeof parsed.owner !== 'string' || typeof parsed.repo !== 'string') {
      return null;
    }
    return { owner: parsed.owner, repo: parsed.repo };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;

    console.error('[Trails] Get id pointer failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve trail pointer',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function putIdPointer(
  owner: string,
  repo: string,
  id: string
): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildIdPointerKey(id),
        Body: JSON.stringify({ owner, repo } satisfies IdPointer),
        ContentType: 'application/json',
        CacheControl: PAYLOAD_CACHE_CONTROL,
      })
    );
  } catch (error: unknown) {
    console.error('[Trails] Put id pointer failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save trail pointer',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function deleteIdPointer(id: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildIdPointerKey(id),
      })
    );
  } catch (error) {
    // Pointer deletion is best-effort: a stale pointer 404s on the next
    // payload fetch, which the route handles. Don't fail the user-facing
    // delete just because the pointer cleanup failed.
    console.error('[Trails] Delete id pointer failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Inbox — per-recipient delivery index keyed by GitHub numeric id so it
// survives login changes. Mirrors the repo-index ETag-locked update flow.
// ============================================================================

function inboxPrefix(githubId: number): string {
  return `${S3_PREFIX}/${INBOX_PREFIX}/${githubId}`;
}

export function buildInboxIndexKey(githubId: number): string {
  return `${inboxPrefix(githubId)}/${INDEX_FILE}`;
}

export function buildInboxEntryKey(githubId: number, trailId: string): string {
  return `${inboxPrefix(githubId)}/by-trail/${trailId}.json`;
}

function emptyInbox(): InboxIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getInboxWithETag(
  githubId: number
): Promise<{ data: InboxIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildInboxIndexKey(githubId),
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return {
      data: JSON.parse(body) as InboxIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;

    console.error('[Trails] Get inbox failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve inbox',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putInboxWithETag(
  githubId: number,
  data: InboxIndex,
  etag: string | null
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
      Key: buildInboxIndexKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: INDEX_CACHE_CONTROL,
    };

    if (etag) params.IfMatch = etag;

    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TrailShareError(
        'Concurrent modification detected',
        409,
        ShareErrorCodes.ETAG_CONFLICT
      );
    }

    console.error('[Trails] Put inbox failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save inbox',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getInbox(githubId: number): Promise<InboxIndex> {
  const result = await getInboxWithETag(githubId);
  return result ? result.data : emptyInbox();
}

/**
 * Mutate the inbox index under optimistic locking. Mirrors `updateIndex`.
 */
export async function updateInbox(
  githubId: number,
  modifier: (data: InboxIndex) => InboxIndex
): Promise<InboxIndex> {
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
        error instanceof TrailShareError &&
        error.code === ShareErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TrailShareError(
            'Concurrent modification conflict — please retry',
            409,
            ShareErrorCodes.MAX_RETRIES
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }

  throw new TrailShareError(
    'Update failed after retries',
    500,
    ShareErrorCodes.S3_ERROR
  );
}

/**
 * Write a per-entry inbox object at `trails/_inbox/{githubId}/by-trail/{id}.json`.
 * Written in the same pass as the inbox index append so point reads of a
 * single inbox row (e.g. `POST /inbox/{id}/read`) don't have to scan the
 * whole index.
 */
export async function putInboxEntry(
  githubId: number,
  entry: InboxIndexEntry
): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildInboxEntryKey(githubId, entry.trailId),
        Body: JSON.stringify(entry),
        ContentType: 'application/json',
        CacheControl: PAYLOAD_CACHE_CONTROL,
      })
    );
  } catch (error: unknown) {
    console.error('[Trails] Put inbox entry failed:', {
      githubId,
      trailId: entry.trailId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save inbox entry',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function deleteInboxEntry(
  githubId: number,
  trailId: string
): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildInboxEntryKey(githubId, trailId),
      })
    );
  } catch (error) {
    // Best-effort like the id-pointer delete: a stale per-entry object is
    // a rounding error against the inbox index, which is the source of
    // truth for membership.
    console.error('[Trails] Delete inbox entry failed:', {
      githubId,
      trailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Per-user trail manifest — powers "your trails" listings without scanning
// every repo. Written from the publisher path on POST and trimmed on
// DELETE; mutations use the same ETag-locked pattern the repo index uses.
// ============================================================================

function emptyByUser(): TrailByUserIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getByUserWithETag(
  githubId: number
): Promise<{ data: TrailByUserIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildByUserKey(githubId),
      })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TrailByUserIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Trails] Get by-user index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve trails index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putByUserWithETag(
  githubId: number,
  data: TrailByUserIndex,
  etag: string | null
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
      CacheControl: INDEX_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TrailShareError(
        'Concurrent modification detected',
        409,
        ShareErrorCodes.ETAG_CONFLICT
      );
    }
    console.error('[Trails] Put by-user index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save trails index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getTrailsByUser(
  githubId: number
): Promise<TrailByUserIndex> {
  const result = await getByUserWithETag(githubId);
  return result ? result.data : emptyByUser();
}

async function updateByUser(
  githubId: number,
  modifier: (data: TrailByUserIndex) => TrailByUserIndex
): Promise<TrailByUserIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getByUserWithETag(githubId);
      const data = current ? current.data : emptyByUser();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putByUserWithETag(githubId, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof TrailShareError &&
        error.code === ShareErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TrailShareError(
            'Concurrent modification conflict — please retry',
            409,
            ShareErrorCodes.MAX_RETRIES
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new TrailShareError(
    'Update failed after retries',
    500,
    ShareErrorCodes.S3_ERROR
  );
}

/**
 * Add (or replace) a trail row in its creator's by-user manifest. Called
 * from the publish path. Manifest writes are best-effort — a failure is
 * logged but doesn't sink the user-facing publish; the per-repo index is
 * the source of truth for ownership.
 */
export async function upsertTrailInUserIndex(
  owner: string,
  repo: string,
  entry: SharedTrailIndexEntry
): Promise<void> {
  try {
    await updateByUser(entry.createdBy.githubId, (data) => {
      const next: TrailByUserEntry = { ...entry, owner, repo };
      const others = data.entries.filter((e) => e.id !== entry.id);
      return { ...data, entries: [next, ...others] };
    });
  } catch (error) {
    console.error('[Trails] Upsert by-user index failed:', {
      trailId: entry.id,
      githubId: entry.createdBy.githubId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function removeTrailFromUserIndex(
  githubId: number,
  trailId: string
): Promise<void> {
  try {
    await updateByUser(githubId, (data) => ({
      ...data,
      entries: data.entries.filter((e) => e.id !== trailId),
    }));
  } catch (error) {
    console.error('[Trails] Remove from by-user index failed:', {
      githubId,
      trailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Per-user "recently visited" manifest — bumped on every signed-in trail
// open. Same ETag-locked write pattern as the by-user manifest; the cap
// keeps the manifest size bounded since visits accrue indefinitely.
// ============================================================================

const RECENTLY_VISITED_CAP = 50;

function emptyRecentlyVisited(): TrailRecentlyVisitedIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getRecentlyVisitedWithETag(
  githubId: number
): Promise<{ data: TrailRecentlyVisitedIndex; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildRecentlyVisitedKey(githubId),
      })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TrailRecentlyVisitedIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Trails] Get recently-visited index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve recently-visited index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putRecentlyVisitedWithETag(
  githubId: number,
  data: TrailRecentlyVisitedIndex,
  etag: string | null
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
      Key: buildRecentlyVisitedKey(githubId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: INDEX_CACHE_CONTROL,
    };
    if (etag) params.IfMatch = etag;
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TrailShareError(
        'Concurrent modification detected',
        409,
        ShareErrorCodes.ETAG_CONFLICT
      );
    }
    console.error('[Trails] Put recently-visited index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save recently-visited index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getRecentlyVisitedTrails(
  githubId: number
): Promise<TrailRecentlyVisitedIndex> {
  const result = await getRecentlyVisitedWithETag(githubId);
  return result ? result.data : emptyRecentlyVisited();
}

async function updateRecentlyVisited(
  githubId: number,
  modifier: (data: TrailRecentlyVisitedIndex) => TrailRecentlyVisitedIndex
): Promise<TrailRecentlyVisitedIndex> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getRecentlyVisitedWithETag(githubId);
      const data = current ? current.data : emptyRecentlyVisited();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putRecentlyVisitedWithETag(githubId, updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof TrailShareError &&
        error.code === ShareErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TrailShareError(
            'Concurrent modification conflict — please retry',
            409,
            ShareErrorCodes.MAX_RETRIES
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new TrailShareError(
    'Update failed after retries',
    500,
    ShareErrorCodes.S3_ERROR
  );
}

/**
 * Record a visit by `githubId` to a trail. Bumps `lastVisitedAt` to now,
 * increments `visitCount`, and moves the entry to the head of the list.
 * The manifest is capped at the most-recent {@link RECENTLY_VISITED_CAP}
 * trails — the dashboard only renders the top handful, and keeping the
 * manifest bounded protects S3 PUT size as a user's history grows.
 *
 * Best-effort: failures are logged but don't sink the visits POST (the
 * primary job there is updating the trail's `visitors` block).
 */
export async function recordTrailVisit(
  githubId: number,
  entry: Omit<TrailRecentlyVisitedEntry, 'lastVisitedAt' | 'visitCount'>
): Promise<void> {
  try {
    await updateRecentlyVisited(githubId, (data) => {
      const now = new Date().toISOString();
      const existing = data.entries.find((e) => e.id === entry.id);
      const next: TrailRecentlyVisitedEntry = {
        ...entry,
        lastVisitedAt: now,
        visitCount: (existing?.visitCount ?? 0) + 1,
      };
      const others = data.entries.filter((e) => e.id !== entry.id);
      return {
        ...data,
        entries: [next, ...others].slice(0, RECENTLY_VISITED_CAP),
      };
    });
  } catch (error) {
    console.error('[Trails] Record visit failed:', {
      trailId: entry.id,
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
