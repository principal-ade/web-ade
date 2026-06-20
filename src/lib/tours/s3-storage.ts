/**
 * S3 storage for store-backed tours.
 *
 * Layout (mirrors the trails store):
 *   tours/{owner}/{repo}/index.json   - per-repo manifest (ETag-locked)
 *   tours/{owner}/{repo}/{id}.json    - per-tour payload object
 *   tours/_by-id/{id}.json            - id → {owner, repo} pointer
 *   tours/_by-user/{githubId}.json    - tours a user has published
 *
 * The manifest is updated under optimistic-locking with retries (mirrors
 * `../trails/s3-storage.ts`). Per-payload objects are id-scoped and don't need
 * locking. The by-id pointer lets share links resolve a tour without carrying
 * owner/repo in the URL.
 *
 * Errors reuse `TrailShareError` / `ShareErrorCodes` from the trails module so
 * the tour routes report failures the same way the existing tours list route
 * already does (it imports those today).
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
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
import { TrailShareError, ShareErrorCodes } from '../trails/types';
import type {
  StoredTourPayload,
  TourIndex,
  TourIndexEntry,
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

/**
 * Synthetic tour-file "path" recorded in a store tour's audio ref. Store tours
 * have no git file, but the TTS pipeline keys off `(owner, repo, path)` — so we
 * give each one a stable pseudo-path derived from its store id. The TTS fetcher
 * recognizes this prefix and loads the tour from the store instead of GitHub.
 */
export const STORE_TOUR_PATH_PREFIX = '__store__/';

export function buildStoreTourPath(id: string): string {
  return `${STORE_TOUR_PATH_PREFIX}${id}.tour.json`;
}

/** Extract the store id from a synthetic store path, or `null` if it isn't one. */
export function parseStoreTourPath(path: string): string | null {
  if (!path.startsWith(STORE_TOUR_PATH_PREFIX)) return null;
  const rest = path.slice(STORE_TOUR_PATH_PREFIX.length);
  const id = rest.endsWith('.tour.json')
    ? rest.slice(0, -'.tour.json'.length)
    : rest;
  return id || null;
}

export function buildByUserKey(githubId: number): string {
  return `${S3_PREFIX}/_by-user/${githubId}.json`;
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

function emptyIndex(): TourIndex {
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
): Promise<{ data: TourIndex; etag: string } | null> {
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
      data: JSON.parse(body) as TourIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;

    console.error('[Tours] Get index failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve tour index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putIndexWithETag(
  owner: string,
  repo: string,
  data: TourIndex,
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

    console.error('[Tours] Put index failed:', {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save tour index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getIndex(
  owner: string,
  repo: string
): Promise<TourIndex> {
  const result = await getIndexWithETag(owner, repo);
  return result ? result.data : emptyIndex();
}

export async function updateIndex(
  owner: string,
  repo: string,
  modifier: (data: TourIndex) => TourIndex
): Promise<TourIndex> {
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

export function findIndexEntry(
  index: TourIndex,
  id: string
): TourIndexEntry | undefined {
  return index.entries.find((e) => e.id === id);
}

// ============================================================================
// Payload operations
// ============================================================================

export async function getPayload(
  owner: string,
  repo: string,
  id: string
): Promise<StoredTourPayload | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildPayloadKey(owner, repo, id),
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as StoredTourPayload;
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;

    console.error('[Tours] Get payload failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve tour payload',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function putPayload(
  owner: string,
  repo: string,
  id: string,
  payload: StoredTourPayload
): Promise<{ sizeBytes: number }> {
  const body = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(body, 'utf8');

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildPayloadKey(owner, repo, id),
        Body: body,
        ContentType: 'application/json',
        CacheControl: PAYLOAD_CACHE_CONTROL,
      })
    );

    return { sizeBytes };
  } catch (error: unknown) {
    console.error('[Tours] Put payload failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save tour payload',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
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
    console.error('[Tours] Delete payload failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to delete tour payload',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

// ============================================================================
// Repo enumeration — every `{owner, repo}` with a tour index. Mirrors the
// trails enumeration; synthetic top-level segments (`_by-id`, `_by-user`) are
// filtered out since they all start with `_`.
// ============================================================================

export async function listRepoPrefixes(): Promise<
  Array<{ owner: string; repo: string }>
> {
  const pairs: Array<{ owner: string; repo: string }> = [];

  const owners = await listChildPrefixes(`${S3_PREFIX}/`);
  for (const owner of owners) {
    if (owner.startsWith('_')) continue;

    const repos = await listChildPrefixes(`${S3_PREFIX}/${owner}/`);
    for (const repo of repos) {
      pairs.push({ owner, repo });
    }
  }

  return pairs;
}

async function listChildPrefixes(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      })
    );

    for (const cp of response.CommonPrefixes ?? []) {
      if (!cp.Prefix) continue;
      const child = cp.Prefix.slice(prefix.length, -1);
      if (child) out.push(child);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return out;
}

// ============================================================================
// Id pointer (for repo-less share links: /tour/{id})
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

    console.error('[Tours] Get id pointer failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve tour pointer',
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
    console.error('[Tours] Put id pointer failed:', {
      owner,
      repo,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save tour pointer',
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
    // Best-effort: a stale pointer 404s on the next payload fetch, which the
    // route handles. Don't fail the user-facing delete on pointer cleanup.
    console.error('[Tours] Delete id pointer failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Per-user tour manifest — powers "your tours" listings without scanning every
// repo. Written from the publish path; same ETag-locked pattern as the index.
// ============================================================================

interface TourByUserEntry extends TourIndexEntry {
  owner: string;
  repo: string;
}

interface TourByUserIndex {
  version: 1;
  updatedAt: string;
  entries: TourByUserEntry[];
}

function emptyByUser(): TourByUserIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function getByUserWithETag(
  githubId: number
): Promise<{ data: TourByUserIndex; etag: string } | null> {
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
      data: JSON.parse(body) as TourByUserIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Tours] Get by-user index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve tours index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putByUserWithETag(
  githubId: number,
  data: TourByUserIndex,
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
    console.error('[Tours] Put by-user index failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save tours index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getToursByUser(
  githubId: number
): Promise<TourByUserIndex> {
  const result = await getByUserWithETag(githubId);
  return result ? result.data : emptyByUser();
}

async function updateByUser(
  githubId: number,
  modifier: (data: TourByUserIndex) => TourByUserIndex
): Promise<TourByUserIndex> {
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
 * Add (or replace) a tour row in its creator's by-user manifest. Best-effort —
 * a failure is logged but doesn't sink the user-facing publish; the per-repo
 * index is the source of truth for ownership.
 */
export async function upsertTourInUserIndex(
  owner: string,
  repo: string,
  entry: TourIndexEntry
): Promise<void> {
  try {
    await updateByUser(entry.createdBy.githubId, (data) => {
      const next: TourByUserEntry = { ...entry, owner, repo };
      const others = data.entries.filter((e) => e.id !== entry.id);
      return { ...data, entries: [next, ...others] };
    });
  } catch (error) {
    console.error('[Tours] Upsert by-user index failed:', {
      tourId: entry.id,
      githubId: entry.createdBy.githubId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function removeTourFromUserIndex(
  githubId: number,
  tourId: string
): Promise<void> {
  try {
    await updateByUser(githubId, (data) => ({
      ...data,
      entries: data.entries.filter((e) => e.id !== tourId),
    }));
  } catch (error) {
    console.error('[Tours] Remove from by-user index failed:', {
      githubId,
      tourId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
