/**
 * S3 cache for repo-analysis results + a warm-VM registry.
 *
 * Two record families, both keyed by `{owner}/{repo}` (latest only — each write
 * overwrites the previous one, no history):
 *
 *   - `repo-analysis/{owner}/{repo}.json`      — the cached RepoAnalysis, stamped
 *     with the commit `sha` it was computed at. A reader compares this `sha` to
 *     the repo's current HEAD (`resolveHeadSha`) to decide whether a refresh is
 *     due. The old record is never deleted before a new one is written, so a
 *     reader always has *something* to show while a refresh runs.
 *   - `repo-analysis-vms/{owner}/{repo}.json`  — the id of the warm Freestyle VM
 *     that holds this repo's clone, so the next run reuses it (`git fetch` +
 *     re-sweep) instead of cloning from scratch. Kept outside the analysis
 *     prefix so repo-enumeration never mistakes `_vms` for an owner.
 *
 * Mirrors the line-counts cache conventions: same `@aws-sdk/client-s3` v3
 * client, the `TTS_S3_BUCKET`/`TTS_AWS_REGION` → `repo-tour-audio` bucket, and
 * the ambient AWS credential chain (only `region` is set).
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { RepoAnalysis } from './run';

const s3Client = new S3Client({
  region: process.env.TTS_AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.TTS_S3_BUCKET || 'repo-tour-audio';
const CACHE_PREFIX = 'repo-analysis';
const VM_PREFIX = 'repo-analysis-vms';
const ERROR_PREFIX = 'repo-analysis-errors';

/** The cached analysis record. `sha` is the commit the sweep ran against
 *  (`git rev-parse HEAD` inside the VM) — null only if the VM couldn't report
 *  it. Freshness is `sha !== currentHeadSha`, not a TTL. */
export interface RepoAnalysisCache {
  owner: string;
  repo: string;
  sha: string | null;
  generatedAt: string;
  generatedBy: 'web-ade';
  analysis: RepoAnalysis;
}

/** Treat both the v3 error name and a bare 404 as "not cached". */
function isNoSuchKey(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * Read-error policy. A genuine miss (`NoSuchKey`/404) is normal — the caller
 * gets `null`. ANY other error (AccessDenied/403, a credential or region
 * misconfig, throttling) is NOT an empty cache: log it loudly and RETHROW, so a
 * permissions gap can never masquerade as "nothing cached". A missing IAM grant
 * on the `repo-analysis*` prefixes hid behind a swallowed error exactly this way.
 */
function rethrowUnlessMiss(error: unknown, key: string, op: string): void {
  if (isNoSuchKey(error)) return;
  const e = error as {
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const status = e?.$metadata?.httpStatusCode;
  const denied = e?.name === 'AccessDenied' || status === 403;
  console.error(
    `[Repo Analysis S3] ${op} FAILED for "${key}" — real S3 error, NOT an empty cache` +
      (denied ? ' (AccessDenied — check the IAM policy grants this prefix)' : '') +
      `: name=${e?.name ?? 'unknown'} status=${status ?? '?'}: ${e?.message ?? String(error)}`
  );
  throw error;
}

export function repoAnalysisS3Key(owner: string, repo: string): string {
  return `${CACHE_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/** Read the cached analysis, or null on a miss. */
export async function getRepoAnalysisFromS3(
  owner: string,
  repo: string
): Promise<RepoAnalysisCache | null> {
  const key = repoAnalysisS3Key(owner, repo);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    if (!response.Body) return null;
    const bodyString = await response.Body.transformToString();
    return JSON.parse(bodyString) as RepoAnalysisCache;
  } catch (error) {
    rethrowUnlessMiss(error, key, 'getRepoAnalysisFromS3');
    return null;
  }
}

/** Overwrite the cached analysis for a repo (latest only). */
export async function storeRepoAnalysisInS3(
  data: RepoAnalysisCache
): Promise<void> {
  const key = repoAnalysisS3Key(data.owner, data.repo);
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
        // No public max-age: freshness is sha-driven, not time-driven.
        CacheControl: 'no-cache',
        Metadata: {
          'generated-at': data.generatedAt,
          'generated-by': data.generatedBy,
          sha: data.sha ?? 'unknown',
        },
      })
    );
  } catch (error) {
    const e = error as {
      name?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const denied = e?.name === 'AccessDenied' || e?.$metadata?.httpStatusCode === 403;
    console.error(
      `[Repo Analysis S3] storeRepoAnalysisInS3 FAILED for "${key}"` +
        (denied ? ' (AccessDenied — check the IAM policy grants this prefix)' : '') +
        `: name=${e?.name ?? 'unknown'}: ${e?.message ?? String(error)}`
    );
    // Rethrow the ORIGINAL error so the real cause (e.g. AccessDenied) survives
    // instead of being flattened into an opaque 'S3_STORE_ERROR'.
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// --- Warm-VM registry: repo → the id of the VM holding its clone. ---

interface VmPointer {
  vmId: string;
  updatedAt: string;
}

function repoVmS3Key(owner: string, repo: string): string {
  return `${VM_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/** The warm VM id for a repo, or null if none is recorded. */
export async function getRepoVmId(
  owner: string,
  repo: string
): Promise<string | null> {
  const key = repoVmS3Key(owner, repo);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    if (!response.Body) return null;
    const data = JSON.parse(await response.Body.transformToString()) as VmPointer;
    return data.vmId ?? null;
  } catch (error) {
    rethrowUnlessMiss(error, key, 'getRepoVmId');
    return null;
  }
}

/** Point a repo at the VM that now holds its clone. */
export async function setRepoVmId(
  owner: string,
  repo: string,
  vmId: string,
  now: string = new Date().toISOString()
): Promise<void> {
  const key = repoVmS3Key(owner, repo);
  const pointer: VmPointer = { vmId, updatedAt: now };
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(pointer),
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    })
  );
}

/** Forget a repo's warm VM (e.g. after it's been deleted). Best-effort. */
export async function clearRepoVmId(owner: string, repo: string): Promise<void> {
  const key = repoVmS3Key(owner, repo);
  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
  } catch {
    /* best-effort */
  }
}

// --- Failure registry: repo → its last analysis failure, for retrieval. ---
//
// A failed analysis used to vanish into request logs — the VM is deleted and
// nothing durable is written. This records the last failure so a repo that won't
// analyze leaves a retrievable breadcrumb (shown on the next GET). Latest only:
// overwritten on each new failure, cleared on the next success.

/** A persisted analysis failure. `stage` is the step that broke; 'unknown' for a
 *  non-`RepoAnalysisError`. `message` is already truncated upstream for VM
 *  stderr. */
export interface RepoAnalysisErrorRecord {
  owner: string;
  repo: string;
  stage: 'create' | 'clone' | 'sweep' | 'parse' | 'unknown';
  message: string;
  failedAt: string;
}

function repoErrorS3Key(owner: string, repo: string): string {
  return `${ERROR_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/** The last recorded failure for a repo, or null if none (or it's been cleared
 *  by a later success). Throws on a real S3 error (see `rethrowUnlessMiss`). */
export async function getRepoAnalysisErrorFromS3(
  owner: string,
  repo: string
): Promise<RepoAnalysisErrorRecord | null> {
  const key = repoErrorS3Key(owner, repo);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    if (!response.Body) return null;
    return JSON.parse(
      await response.Body.transformToString()
    ) as RepoAnalysisErrorRecord;
  } catch (error) {
    rethrowUnlessMiss(error, key, 'getRepoAnalysisErrorFromS3');
    return null;
  }
}

/** Record a repo's latest analysis failure (overwrites the previous one). */
export async function storeRepoAnalysisErrorInS3(
  record: RepoAnalysisErrorRecord
): Promise<void> {
  const key = repoErrorS3Key(record.owner, record.repo);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(record),
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    })
  );
}

/** Clear a repo's recorded failure (call after a successful run). Best-effort. */
export async function clearRepoAnalysisErrorInS3(
  owner: string,
  repo: string
): Promise<void> {
  const key = repoErrorS3Key(owner, repo);
  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
  } catch {
    /* best-effort */
  }
}
