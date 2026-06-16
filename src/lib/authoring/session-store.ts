/**
 * S3-backed store for hosted-authoring sessions.
 *
 * Sessions live at `authoring-sessions/{sessionId}.json` in the trails bucket,
 * OUTSIDE the `trails/` prefix (same reasoning as `run-store.ts`) so the
 * `/explore` repo-enumeration never mistakes a session id for a repo owner.
 *
 * Mostly single-writer per session (the prepare job, then the ask job — never
 * concurrently), so plain put/get/patch is sufficient; no ETag locking.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  PAYLOAD_CACHE_CONTROL,
} from '@/lib/trails/constants';
import type { AuthoringSessionRecord } from './session-types';

const s3 = new S3Client({ region: BUCKET_REGION });

function buildSessionKey(sessionId: string): string {
  return `authoring-sessions/${sessionId}.json`;
}

function isNoSuchKey(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

export async function putSession(record: AuthoringSessionRecord): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: buildSessionKey(record.sessionId),
      Body: JSON.stringify(record),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    })
  );
}

export async function getSessionRecord(
  sessionId: string
): Promise<AuthoringSessionRecord | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: buildSessionKey(sessionId) })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as AuthoringSessionRecord;
  } catch (error) {
    if (isNoSuchKey(error)) return null;
    throw error;
  }
}

/**
 * Merge a patch into an existing session and bump `updatedAt`. Returns the
 * merged record (or null if the session is gone). Single-writer per phase, so
 * read-modify-write is race-free in practice.
 */
export async function patchSession(
  sessionId: string,
  patch: Partial<AuthoringSessionRecord>
): Promise<AuthoringSessionRecord | null> {
  const current = await getSessionRecord(sessionId);
  if (!current) return null;
  const next: AuthoringSessionRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await putSession(next);
  return next;
}
