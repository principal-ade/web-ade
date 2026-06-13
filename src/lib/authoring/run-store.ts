/**
 * Stage 4 — S3-backed store for async authoring runs.
 *
 * Runs live at `authoring-runs/{runId}.json` in the same bucket as trails.
 * Kept OUTSIDE the `trails/` prefix so the `/explore` repo-enumeration
 * (`listRepoPrefixes`) never mistakes it for a repo owner. One writer per run
 * (the background job), so plain put/get is sufficient — no ETag locking.
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
import type { AuthoringRunRecord } from './run-types';

const s3 = new S3Client({ region: BUCKET_REGION });

function buildRunKey(runId: string): string {
  return `authoring-runs/${runId}.json`;
}

function isNoSuchKey(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

export async function putRun(record: AuthoringRunRecord): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: buildRunKey(record.runId),
      Body: JSON.stringify(record),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    })
  );
}

export async function getRunRecord(
  runId: string
): Promise<AuthoringRunRecord | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: buildRunKey(runId) })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as AuthoringRunRecord;
  } catch (error) {
    if (isNoSuchKey(error)) return null;
    throw error;
  }
}

/**
 * Merge a patch into an existing run and bump `updatedAt`. No-op if the run
 * is gone. Single-writer, so read-modify-write is race-free in practice.
 */
export async function patchRun(
  runId: string,
  patch: Partial<AuthoringRunRecord>
): Promise<void> {
  const current = await getRunRecord(runId);
  if (!current) return;
  await putRun({ ...current, ...patch, updatedAt: new Date().toISOString() });
}
