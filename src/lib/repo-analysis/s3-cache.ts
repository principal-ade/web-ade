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
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RepoAnalysis } from './run';
import type { IdentityByEmail } from './identity-cache';

const s3Client = new S3Client({
  region: process.env.TTS_AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.TTS_S3_BUCKET || 'repo-tour-audio';
const CACHE_PREFIX = 'repo-analysis';
const VM_PREFIX = 'repo-analysis-vms';
const ERROR_PREFIX = 'repo-analysis-errors';
const IDENTITY_PREFIX = 'repo-analysis-identities';
const RATE_LIMIT_PREFIX = 'repo-analysis-ratelimits';

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

/** repo → its warm VM. `updatedAt` is stamped each time a run is LAUNCHED (it's
 *  the launch time, not a completion time), so it doubles as the freshest
 *  "a run started at" marker for the in-progress check. */
export interface VmPointer {
  vmId: string;
  updatedAt: string;
}

function repoVmS3Key(owner: string, repo: string): string {
  return `${VM_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/** The warm-VM pointer for a repo (vmId + last-launch time), or null if none. */
export async function getRepoVmPointer(
  owner: string,
  repo: string
): Promise<VmPointer | null> {
  const key = repoVmS3Key(owner, repo);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    if (!response.Body) return null;
    const data = JSON.parse(await response.Body.transformToString()) as VmPointer;
    return data.vmId ? data : null;
  } catch (error) {
    rethrowUnlessMiss(error, key, 'getRepoVmPointer');
    return null;
  }
}

/** The warm VM id for a repo, or null if none is recorded. */
export async function getRepoVmId(
  owner: string,
  repo: string
): Promise<string | null> {
  return (await getRepoVmPointer(owner, repo))?.vmId ?? null;
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

/** A persisted analysis failure. `stage` names the step that broke — either a
 *  host-side `RepoAnalysisError` stage ('create'/'launch'), a stage reported by
 *  the in-VM job ('clone'/'sweep'/'publish'), or 'unknown'. `message` is already
 *  truncated upstream. */
export interface RepoAnalysisErrorRecord {
  owner: string;
  repo: string;
  stage: string;
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

// --- Rate-limit registry: repo → recent GitHub rate-limit pressure. ---
//
// GitHub throttles the shared anonymous budget (and, less often, a user token)
// under load. A throttle on a PUBLIC repo used to be indistinguishable from a
// private-repo 404 downstream — it now surfaces as a retryable RATE_LIMITED
// error (see github-access.ts), and each hit is recorded here so the ops
// /status page can show when the app is getting throttled and for which repos.
// Per-repo, latest-only, with a running hit count kept via read-modify-write.
// Best-effort telemetry: a lost increment under a burst just undercounts — it
// must never throw into the access path.

export type RateLimitScope = 'anon' | 'user';

/** A repo's recent rate-limit pressure. `count` accumulates across hits since
 *  `firstHitAt`; `lastHitAt` is the freshest one. `scope` reflects the most
 *  recent hit — whether it drained the shared anonymous budget or a user token. */
export interface RepoRateLimitRecord {
  owner: string;
  repo: string;
  scope: RateLimitScope;
  count: number;
  firstHitAt: string;
  lastHitAt: string;
}

function repoRateLimitS3Key(owner: string, repo: string): string {
  return `${RATE_LIMIT_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/** The recorded rate-limit pressure for a repo, or null on a miss. Throws on a
 *  real S3 error (see `rethrowUnlessMiss`). */
export async function getRepoRateLimitFromS3(
  owner: string,
  repo: string
): Promise<RepoRateLimitRecord | null> {
  const key = repoRateLimitS3Key(owner, repo);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    if (!response.Body) return null;
    return JSON.parse(
      await response.Body.transformToString()
    ) as RepoRateLimitRecord;
  } catch (error) {
    rethrowUnlessMiss(error, key, 'getRepoRateLimitFromS3');
    return null;
  }
}

/**
 * Record one rate-limit hit for a repo (read-modify-write to bump the running
 * count). BEST-EFFORT — logs and swallows every failure, including a genuine S3
 * error, because rate-limit telemetry must never break or slow-fail the request
 * that tripped the limit. A racy lost increment during a burst just undercounts.
 */
export async function recordRateLimitHit(
  owner: string,
  repo: string,
  scope: RateLimitScope,
  now: string = new Date().toISOString()
): Promise<void> {
  const key = repoRateLimitS3Key(owner, repo);
  try {
    const existing = await getRepoRateLimitFromS3(owner, repo).catch(() => null);
    const record: RepoRateLimitRecord = {
      owner,
      repo,
      scope,
      count: (existing?.count ?? 0) + 1,
      firstHitAt: existing?.firstHitAt ?? now,
      lastHitAt: now,
    };
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(record),
        ContentType: 'application/json',
        CacheControl: 'no-cache',
      })
    );
  } catch (error) {
    console.error(
      `[Repo Analysis S3] recordRateLimitHit dropped for "${key}" — ` +
        `rate-limit telemetry lost, request path unaffected: ${String(error)}`
    );
  }
}

/** Every repo with a recorded rate-limit hit, merged into one record apiece.
 *  The caller filters by recency + sorts (mirrors `listRepoAnalysisJobs`). */
export async function listRepoRateLimitHits(): Promise<RepoRateLimitRecord[]> {
  const repos = await listPrefixRepos(RATE_LIMIT_PREFIX);
  const records = await mapPool(repos, 12, ({ owner, repo }) =>
    getRepoRateLimitFromS3(owner, repo).catch(() => null)
  );
  return records.filter((r): r is RepoRateLimitRecord => r !== null);
}

// --- Identity map: repo → its blame-email → GitHub-account overlay. ---
//
// Kept in its OWN object (not folded into the analysis blob) on purpose: the VM
// sweep overwrites `repo-analysis/{owner}/{repo}.json` wholesale on every run and
// knows nothing about identities, so embedding the map there would wipe it each
// sweep. Here it survives sweeps. The hot per-email source of truth is the
// account-global Redis cache (identity-cache.ts); this per-repo blob is the
// pre-resolved map the GET route embeds so the page needs zero client round-trips
// to draw avatars/logins on first paint. Latest only — merged, never historied.

/** A repo's persisted blame-email → GitHub-account overlay. */
export interface RepoIdentityMapCache {
  owner: string;
  repo: string;
  updatedAt: string;
  identityByEmail: IdentityByEmail;
}

function repoIdentityS3Key(owner: string, repo: string): string {
  return `${IDENTITY_PREFIX}/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;
}

/** The persisted identity map for a repo, or null on a miss. Throws on a real S3
 *  error (see `rethrowUnlessMiss`) so a permissions gap can't read as "empty". */
export async function getRepoIdentityMapFromS3(
  owner: string,
  repo: string
): Promise<RepoIdentityMapCache | null> {
  const key = repoIdentityS3Key(owner, repo);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    if (!response.Body) return null;
    return JSON.parse(
      await response.Body.transformToString()
    ) as RepoIdentityMapCache;
  } catch (error) {
    rethrowUnlessMiss(error, key, 'getRepoIdentityMapFromS3');
    return null;
  }
}

/**
 * Merge newly-resolved entries into a repo's identity map (read-modify-write).
 * New emails are added and existing ones overwritten with the fresher value;
 * nothing is dropped. No-ops when `additions` is empty. Best-effort — a failed
 * persist just means the next visit re-resolves and re-writes, so it logs and
 * swallows rather than throwing into the resolve path.
 */
export async function mergeRepoIdentityMapInS3(
  owner: string,
  repo: string,
  additions: IdentityByEmail,
  now: string = new Date().toISOString()
): Promise<void> {
  if (Object.keys(additions).length === 0) return;
  const key = repoIdentityS3Key(owner, repo);
  try {
    const existing = await getRepoIdentityMapFromS3(owner, repo);
    const merged: IdentityByEmail = {
      ...(existing?.identityByEmail ?? {}),
      ...additions,
    };
    const record: RepoIdentityMapCache = {
      owner,
      repo,
      updatedAt: now,
      identityByEmail: merged,
    };
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(record),
        ContentType: 'application/json',
        CacheControl: 'no-cache',
      })
    );
  } catch (error) {
    console.error(
      `[Repo Analysis S3] mergeRepoIdentityMapInS3 failed for "${key}" — ` +
        `identities will be re-resolved next visit: ${String(error)}`
    );
  }
}

/** TTL for the upload URLs handed to the VM (seconds). Generous enough to cover
 *  a cold clone + full blame sweep of a large repo. */
const UPLOAD_URL_TTL_SECONDS = 900;

/**
 * Pre-signed PUT URLs the analysis VM uploads its result to DIRECTLY — the
 * success envelope to the analysis key, or a failure record to the error key.
 * Each URL is scoped to exactly one key and expires, so it carries no ambient
 * S3 credentials and can't write anywhere else. This is what lets the long
 * clone+sweep run detached on the VM (and publish straight to the shared cache)
 * instead of being held open by the request that started it.
 */
export async function presignAnalysisUploadUrls(
  owner: string,
  repo: string
): Promise<{ analysisUrl: string; errorUrl: string }> {
  const [analysisUrl, errorUrl] = await Promise.all([
    getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: repoAnalysisS3Key(owner, repo),
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS }
    ),
    getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: repoErrorS3Key(owner, repo),
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS }
    ),
  ]);
  return { analysisUrl, errorUrl };
}

// --- Cross-repo enumeration: the raw material for a status/jobs page. ---
//
// Every producer above writes per-repo, latest-only, keyed `{owner}/{repo}.json`
// under a fixed prefix — so the state a status page needs (a launch happened / it
// failed / it finished) already exists; it's just never read across repos. This
// section lists those prefixes and merges them into one record per repo. It does
// NOT derive a status (that needs `Date.now()` + the in-progress window, which
// live in the route) — it only gathers the timestamps/breadcrumbs a caller
// classifies. Result BODIES are large (per-file line counts), so results are read
// via HeadObject metadata (`generated-at`, `sha`) — never downloaded.

/** One repo's merged analysis-job signals. Any field is null when its record is
 *  absent: no `launchedAt` → no run ever launched; no `generatedAt` → never
 *  succeeded; no `error` → no failure on record. The caller derives status. */
export interface RepoAnalysisJobRecord {
  owner: string;
  repo: string;
  /** Warm-VM pointer's `updatedAt` — the last launch time, or null if none. */
  launchedAt: string | null;
  vmId: string | null;
  /** The cached result's `generated-at` metadata (VM publish time), or null. */
  generatedAt: string | null;
  /** The cached result's `sha` metadata (commit swept), or null. */
  sha: string | null;
  error: RepoAnalysisErrorRecord | null;
}

/** Run `fn` over `items` at most `concurrency` at a time (keeps the fan-out of
 *  per-repo reads from opening hundreds of sockets at once). Order-preserving. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** List every `{owner}/{repo}` under `prefix/`, paging through truncated results.
 *  Returns the parsed owner/repo pairs (keys are `prefix/{owner}/{repo}.json`). */
async function listPrefixRepos(prefix: string): Promise<Array<{ owner: string; repo: string }>> {
  const out: Array<{ owner: string; repo: string }> = [];
  let token: string | undefined;
  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${prefix}/`,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key || !key.endsWith('.json')) continue;
      const rest = key.slice(prefix.length + 1, -'.json'.length); // `{owner}/{repo}`
      const slash = rest.indexOf('/');
      if (slash <= 0 || slash === rest.length - 1) continue;
      out.push({ owner: rest.slice(0, slash), repo: rest.slice(slash + 1) });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Read a result's `generated-at`/`sha` from object metadata WITHOUT downloading
 *  the (large) body. Returns null on a miss. */
async function headRepoResult(
  owner: string,
  repo: string
): Promise<{ generatedAt: string | null; sha: string | null } | null> {
  try {
    const res = await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: repoAnalysisS3Key(owner, repo) })
    );
    const meta = res.Metadata ?? {};
    return {
      generatedAt: meta['generated-at'] ?? res.LastModified?.toISOString() ?? null,
      sha: meta['sha'] && meta['sha'] !== 'unknown' ? meta['sha'] : null,
    };
  } catch (error) {
    rethrowUnlessMiss(error, repoAnalysisS3Key(owner, repo), 'headRepoResult');
    return null;
  }
}

/**
 * Enumerate every repo that has *any* analysis-job record (a launch, a result, or
 * a failure) and merge its signals into one record apiece. This is the read a
 * status page issues: it fans out `ListObjectsV2` across the three prefixes, then
 * reads only what each repo actually has. Cost scales with the number of analyzed
 * repos, not the size of any result. The caller classifies each record into
 * in-progress / failed / stalled / done.
 */
export async function listRepoAnalysisJobs(): Promise<RepoAnalysisJobRecord[]> {
  const [vmRepos, errorRepos, resultRepos] = await Promise.all([
    listPrefixRepos(VM_PREFIX),
    listPrefixRepos(ERROR_PREFIX),
    listPrefixRepos(CACHE_PREFIX),
  ]);

  // Union the three key spaces so a repo shows up even if it has only one signal.
  const byRepo = new Map<string, { owner: string; repo: string }>();
  for (const r of [...vmRepos, ...errorRepos, ...resultRepos]) {
    byRepo.set(`${r.owner}/${r.repo}`, r);
  }
  const has = (list: Array<{ owner: string; repo: string }>) =>
    new Set(list.map((r) => `${r.owner}/${r.repo}`));
  const hasVm = has(vmRepos);
  const hasError = has(errorRepos);
  const hasResult = has(resultRepos);

  return mapPool(Array.from(byRepo.values()), 12, async ({ owner, repo }) => {
    const id = `${owner}/${repo}`;
    const [vmPointer, error, result] = await Promise.all([
      hasVm.has(id) ? getRepoVmPointer(owner, repo).catch(() => null) : Promise.resolve(null),
      hasError.has(id)
        ? getRepoAnalysisErrorFromS3(owner, repo).catch(() => null)
        : Promise.resolve(null),
      hasResult.has(id) ? headRepoResult(owner, repo).catch(() => null) : Promise.resolve(null),
    ]);
    return {
      owner,
      repo,
      launchedAt: vmPointer?.updatedAt ?? null,
      vmId: vmPointer?.vmId ?? null,
      generatedAt: result?.generatedAt ?? null,
      sha: result?.sha ?? null,
      error,
    };
  });
}
