/**
 * Community repo-visit feed.
 *
 * A single global S3 manifest recording the public repos people have opened
 * recently, newest-first, with a rough deduped visitor count. This is the
 * server-side counterpart to the per-browser `recent-repositories` localStorage
 * — that signal never leaves the client, so a "repos other people visited"
 * feed needs its own store.
 *
 * Layout:
 *   trails/_community-repos/global.json   — one global manifest (ETag-locked)
 *
 * Anti-gaming: each entry keeps a bounded set of visitor fingerprints
 * (`g:{githubId}` for signed-in visitors, `a:{anonUuid}` for the HttpOnly
 * anon cookie). A fingerprint already in the set bumps recency but NOT the
 * count, so refresh-spam from one browser/account counts once. The set is
 * capped ({@link SEEN_IDS_CAP}) to bound PUT size — beyond that a returning
 * visitor evicted from the set may re-count, which is why the count is
 * documented as "rough". Private repos are never recorded (the recorder's
 * caller gates on the GitHub `private` flag).
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
  INDEX_CACHE_CONTROL,
  MAX_ETAG_RETRIES,
} from '@/lib/trails/constants';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';

const s3Client = new S3Client({ region: BUCKET_REGION });

const GLOBAL_KEY = `${S3_PREFIX}/_community-repos/global.json`;

/** Max repos retained in the feed. Oldest (by lastVisitedAt) are pruned. */
const COMMUNITY_CAP = 1000;

/** Per-repo dedup-memory bound. Count becomes approximate past this many
 *  distinct visitors — see the file header. */
const SEEN_IDS_CAP = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A stored entry, including the internal dedup set. */
export interface CommunityRepoVisitEntry {
  /** Lowercased "owner/repo" — the dedup key. */
  fullName: string;
  /** Display owner login (GitHub's canonical casing). */
  owner: string;
  /** Display repo name (GitHub's canonical casing). */
  repo: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  /** Rough count of distinct visitors (see file header). */
  visitorCount: number;
  /** ISO 8601 — when this repo was last opened by anyone. */
  lastVisitedAt: string;
  /** Deduped visitor fingerprints. Internal; stripped before serving. */
  _seenVisitorIds: string[];
}

export interface CommunityRepoVisitIndex {
  version: 1;
  updatedAt: string;
  entries: CommunityRepoVisitEntry[];
}

/** The public shape served to clients — no internal dedup set. */
export type PublicCommunityRepoVisit = Omit<
  CommunityRepoVisitEntry,
  '_seenVisitorIds'
>;

/** Metadata needed to record a visit; count/recency are derived server-side. */
export interface CommunityRepoVisitInput {
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
}

// ---------------------------------------------------------------------------
// S3 access (ETag-locked, mirrors trails/s3-storage.ts)
// ---------------------------------------------------------------------------

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

function emptyIndex(): CommunityRepoVisitIndex {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

async function getWithETag(): Promise<{
  data: CommunityRepoVisitIndex;
  etag: string;
} | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: GLOBAL_KEY })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as CommunityRepoVisitIndex,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[CommunityRepos] Get index failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve community-repos index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function putWithETag(
  data: CommunityRepoVisitIndex,
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
      Key: GLOBAL_KEY,
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
    console.error('[CommunityRepos] Put index failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save community-repos index',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function updateIndex(
  modifier: (data: CommunityRepoVisitIndex) => CommunityRepoVisitIndex
): Promise<void> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    try {
      const current = await getWithETag();
      const data = current ? current.data : emptyIndex();
      const etag = current ? current.etag : null;
      const updated = modifier(data);
      updated.updatedAt = new Date().toISOString();
      await putWithETag(updated, etag);
      return;
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
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the feed, newest-first, with the internal dedup set stripped. */
export async function getCommunityRepoVisits(
  limit = COMMUNITY_CAP
): Promise<PublicCommunityRepoVisit[]> {
  const current = await getWithETag();
  const entries = current ? current.data.entries : [];
  return entries
    .slice()
    .sort(
      (a, b) =>
        new Date(b.lastVisitedAt).getTime() -
        new Date(a.lastVisitedAt).getTime()
    )
    .slice(0, limit)
    .map(({ _seenVisitorIds: _omit, ...pub }) => pub);
}

export interface CommunityRepoVisitFeed {
  updatedAt: string;
  entries: PublicCommunityRepoVisit[];
}

/** Read the full feed with its last-updated timestamp. Used by the carousel
 *  cache to detect staleness. */
export async function getCommunityRepoVisitFeed(): Promise<CommunityRepoVisitFeed> {
  const current = await getWithETag();
  const data = current ? current.data : emptyIndex();
  const entries = data.entries
    .slice()
    .sort(
      (a, b) =>
        new Date(b.lastVisitedAt).getTime() -
        new Date(a.lastVisitedAt).getTime()
    )
    .map(({ _seenVisitorIds: _omit, ...pub }) => pub);
  return { updatedAt: data.updatedAt, entries };
}

/**
 * Record a visit to a public repo by `visitorId` (`g:{githubId}` or
 * `a:{anonUuid}`). Refreshes recency + metadata always; increments the rough
 * visitor count only when this fingerprint hasn't been seen for this repo.
 *
 * Best-effort: failures are logged, never thrown — the visit-record POST must
 * not sink a repo page load.
 */
export async function recordCommunityRepoVisit(
  input: CommunityRepoVisitInput,
  visitorId: string
): Promise<void> {
  const fullName = `${input.owner}/${input.repo}`.toLowerCase();
  try {
    await updateIndex((data) => {
      const now = new Date().toISOString();
      const existing = data.entries.find((e) => e.fullName === fullName);
      const alreadySeen = existing?._seenVisitorIds.includes(visitorId) ?? false;

      const seen = alreadySeen
        ? existing!._seenVisitorIds
        : [...(existing?._seenVisitorIds ?? []), visitorId].slice(-SEEN_IDS_CAP);

      const next: CommunityRepoVisitEntry = {
        fullName,
        owner: input.owner,
        repo: input.repo,
        description: input.description,
        language: input.language,
        stargazersCount: input.stargazersCount,
        visitorCount: (existing?.visitorCount ?? 0) + (alreadySeen ? 0 : 1),
        lastVisitedAt: now,
        _seenVisitorIds: seen,
      };

      const others = data.entries.filter((e) => e.fullName !== fullName);
      return {
        ...data,
        entries: [next, ...others].slice(0, COMMUNITY_CAP),
      };
    });
  } catch (error) {
    console.error('[CommunityRepos] Record visit failed:', {
      fullName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
