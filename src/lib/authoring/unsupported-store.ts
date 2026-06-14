/**
 * S3-backed store for repos that have failed to import for hosted trail
 * authoring. A single global object, so a repo that fails for one user surfaces
 * a warning for the next — see the authoring repos endpoint + the mobile picker.
 *
 * Lives at `authoring-meta/unsupported-repos.json`, OUTSIDE the `trails/` prefix
 * (same reasoning as `run-store.ts`) so `/explore`'s `listRepoPrefixes` never
 * mistakes it for a repo owner.
 *
 * Privacy: only PUBLIC repos are ever recorded here (the caller gates on repo
 * visibility) — this object is served to everyone, so a private repo name must
 * never land in it.
 *
 * Concurrency: multiple background jobs can fail at once, so the upsert uses an
 * ETag compare-and-set read-modify-write with bounded retries, mirroring
 * `updateIndex` in `src/lib/trails/s3-storage.ts`.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  MAX_ETAG_RETRIES,
} from '@/lib/trails/constants';
import type { AuthoringErrorCode } from './run-types';

const s3 = new S3Client({ region: BUCKET_REGION });

const UNSUPPORTED_KEY = 'authoring-meta/unsupported-repos.json';

export interface UnsupportedRepo {
  owner: string;
  repo: string;
  firstFailedAt: string;
  lastFailedAt: string;
  failCount: number;
  lastError: { code: AuthoringErrorCode; message: string };
}

interface UnsupportedDoc {
  version: 1;
  updatedAt: string;
  repos: UnsupportedRepo[];
}

function isNoSuchKey(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

function isEtagConflict(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === 'PreconditionFailed' || name === '412';
}

function repoKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

async function getWithETag(): Promise<{ doc: UnsupportedDoc; etag: string | null }> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: UNSUPPORTED_KEY })
    );
    const body = await res.Body?.transformToString();
    if (!body) return { doc: emptyDoc(), etag: res.ETag ?? null };
    return { doc: JSON.parse(body) as UnsupportedDoc, etag: res.ETag ?? null };
  } catch (error) {
    if (isNoSuchKey(error)) return { doc: emptyDoc(), etag: null };
    throw error;
  }
}

function emptyDoc(): UnsupportedDoc {
  return { version: 1, updatedAt: new Date().toISOString(), repos: [] };
}

/** All recorded unsupported repos (most-recently-failed first). Empty if none. */
export async function getUnsupportedRepos(): Promise<UnsupportedRepo[]> {
  const { doc } = await getWithETag();
  return [...doc.repos].sort((a, b) =>
    b.lastFailedAt.localeCompare(a.lastFailedAt)
  );
}

/**
 * Upsert a repo into the unsupported list. New repo → inserted with
 * `failCount: 1`; existing → `failCount` bumped, `lastFailedAt`/`lastError`
 * refreshed, `firstFailedAt` preserved. Best-effort: callers should not let a
 * failure here change run state.
 */
export async function recordUnsupportedRepo(
  owner: string,
  repo: string,
  error: { code: AuthoringErrorCode; message: string }
): Promise<void> {
  const key = repoKey(owner, repo);

  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { doc, etag } = await getWithETag();
    const now = new Date().toISOString();
    const existing = doc.repos.find((r) => repoKey(r.owner, r.repo) === key);

    if (existing) {
      existing.failCount += 1;
      existing.lastFailedAt = now;
      existing.lastError = error;
    } else {
      doc.repos.push({
        owner,
        repo,
        firstFailedAt: now,
        lastFailedAt: now,
        failCount: 1,
        lastError: error,
      });
    }
    doc.updatedAt = now;

    try {
      const params: {
        Bucket: string;
        Key: string;
        Body: string;
        ContentType: string;
        IfMatch?: string;
      } = {
        Bucket: BUCKET_NAME,
        Key: UNSUPPORTED_KEY,
        Body: JSON.stringify(doc, null, 2),
        ContentType: 'application/json',
      };
      if (etag) params.IfMatch = etag;
      await s3.send(new PutObjectCommand(params));
      return;
    } catch (err) {
      if (isEtagConflict(err) && attempt < MAX_ETAG_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Remove a repo from the unsupported list (no-op if absent). Used to undo a
 * false positive or to re-verify a repo once it imports again. ETag CAS RMW.
 */
export async function removeUnsupportedRepo(
  owner: string,
  repo: string
): Promise<void> {
  const key = repoKey(owner, repo);
  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { doc, etag } = await getWithETag();
    const next = doc.repos.filter((r) => repoKey(r.owner, r.repo) !== key);
    if (next.length === doc.repos.length) return; // not present
    doc.repos = next;
    doc.updatedAt = new Date().toISOString();
    try {
      const params: {
        Bucket: string;
        Key: string;
        Body: string;
        ContentType: string;
        IfMatch?: string;
      } = {
        Bucket: BUCKET_NAME,
        Key: UNSUPPORTED_KEY,
        Body: JSON.stringify(doc, null, 2),
        ContentType: 'application/json',
      };
      if (etag) params.IfMatch = etag;
      await s3.send(new PutObjectCommand(params));
      return;
    } catch (err) {
      if (isEtagConflict(err) && attempt < MAX_ETAG_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}
