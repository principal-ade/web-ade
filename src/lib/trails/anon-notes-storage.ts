/**
 * S3 storage for anonymous trail notes.
 *
 * Layout:
 *   trails/_anon-notes/{trailId}.json   - per-trail anon-notes object
 *
 * Held in a side-table rather than the main `TrailPayload.notes[]`
 * array because anon submissions go through a no-auth POST: keeping
 * them isolated stops a bad actor from corrupting the authored notes
 * via a concurrent write, and gives the trail GET a cheap way to
 * skip the merge when the owner hasn't opted in.
 *
 * Owner moderation: there's no edit path for anon notes (write-once);
 * the trail owner can delete via `DELETE /api/trails/by-id/{id}/anon-notes/{noteId}`,
 * which calls `deleteAnonNote` here. The author themselves cannot
 * edit or delete — they're anonymous, so there's no identity to
 * authorize against. That's the trade-off for skipping the
 * signed-cookie anonAuthorId infrastructure.
 *
 * Anon note ids are prefixed `anon-` so the trail page can route
 * deletes to this storage rather than the authored-notes path.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  S3_PREFIX,
  MAX_ETAG_RETRIES,
  PAYLOAD_CACHE_CONTROL,
} from './constants';
import { TrailShareError, ShareErrorCodes } from './types';
import type { TrailNote } from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

const ANON_NOTE_ID_PREFIX = 'anon-';

interface AnonNotesFile {
  version: 1;
  updatedAt: string;
  notes: TrailNote[];
}

function buildKey(trailId: string): string {
  return `${S3_PREFIX}/_anon-notes/${trailId}.json`;
}

export function newAnonNoteId(): string {
  return `${ANON_NOTE_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isAnonNoteId(id: string): boolean {
  return id.startsWith(ANON_NOTE_ID_PREFIX);
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

function emptyFile(): AnonNotesFile {
  return { version: 1, updatedAt: new Date().toISOString(), notes: [] };
}

async function getWithETag(
  trailId: string
): Promise<{ data: AnonNotesFile; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: buildKey(trailId) })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as AnonNotesFile,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[Trails] Get anon-notes failed:', {
      trailId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve anonymous notes',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putWithETag(
  trailId: string,
  data: AnonNotesFile,
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
      IfNoneMatch?: string;
    } = {
      Bucket: BUCKET_NAME,
      Key: buildKey(trailId),
      Body: JSON.stringify(data),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) {
      params.IfMatch = etag;
    } else {
      // Creating for the first time — fail if someone else just created it.
      params.IfNoneMatch = '*';
    }
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TrailShareError(
        'Concurrent modification detected',
        409,
        ShareErrorCodes.ETAG_CONFLICT
      );
    }
    console.error('[Trails] Put anon-notes failed:', {
      trailId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save anonymous notes',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

export async function getAnonNotes(trailId: string): Promise<TrailNote[]> {
  const current = await getWithETag(trailId);
  return current ? current.data.notes : [];
}

async function mutate(
  trailId: string,
  modifier: (notes: TrailNote[]) => TrailNote[]
): Promise<TrailNote[]> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getWithETag(trailId);
      const file = current ? current.data : emptyFile();
      const etag = current ? current.etag : null;
      const nextNotes = modifier(file.notes);
      const next: AnonNotesFile = {
        version: 1,
        updatedAt: new Date().toISOString(),
        notes: nextNotes,
      };
      await putWithETag(trailId, next, etag);
      return nextNotes;
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

export async function appendAnonNote(
  trailId: string,
  note: TrailNote
): Promise<void> {
  await mutate(trailId, (notes) => [...notes, note]);
}

/**
 * Delete an anon note by id. Returns true if a note was removed,
 * false if no note with that id was found.
 */
export async function deleteAnonNote(
  trailId: string,
  noteId: string
): Promise<boolean> {
  let removed = false;
  await mutate(trailId, (notes) => {
    const next = notes.filter((n) => n.id !== noteId);
    removed = next.length !== notes.length;
    return next;
  });
  return removed;
}
