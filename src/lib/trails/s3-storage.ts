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
  MAX_ETAG_RETRIES,
} from './constants';
import { TrailShareError, ShareErrorCodes } from './types';
import type {
  TrailPayload,
  SharedTrailIndex,
  SharedTrailIndexEntry,
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
