/**
 * Sent listing — sender-side feed of trails the signed-in user has shared.
 *
 * The mirror of `GET /api/trails/inbox`. Storage lives under
 * `trails/_outbox/{githubId}/index.json`, written by the send route. Each row
 * is one trail with the merged recipient set and the most-recent `sentAt`.
 * There is no read-state here (the sender's own list), so no `unreadCount`.
 *
 * Lazy snapshot freshness mirrors the inbox: when an entry is returned the
 * live repo index is consulted; if the trail advanced its snapshot is patched
 * (and the outbox is written back), and if the trail is gone the row is
 * dropped from both the response and the index. Per-trail lookups are deduped
 * by (owner, repo) so a page costs only a few S3 reads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  findIndexEntry,
  getIdPointer,
  getIndex,
  getOutbox,
  updateOutbox,
} from '@/lib/trails/s3-storage';
import {
  ShareErrorCodes,
  TrailShareError,
  type OutboxIndexEntry,
  type SharedTrailIndex,
} from '@/lib/trails/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface CursorState {
  offset: number;
}

function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8')
    ) as Partial<CursorState>;
    const offset = parsed.offset;
    if (typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) {
      return offset;
    }
  } catch {
    // Fall through to 0 — invalid cursor is treated as a fresh page.
  }
  return 0;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

/**
 * Page-level lazy snapshot refresh. For each `(owner, repo)` seen on the
 * page, read the live index once; for each entry, either patch its snapshot
 * or mark it for removal if the underlying trail is gone. Mirrors the inbox.
 */
async function refreshPage(
  page: OutboxIndexEntry[]
): Promise<{
  patched: OutboxIndexEntry[];
  removedTrailIds: Set<string>;
  dirty: boolean;
}> {
  const repoKeyOf = (entry: OutboxIndexEntry) =>
    `${entry.owner.toLowerCase()}/${entry.repo.toLowerCase()}`;
  const repoOriginals = new Map<string, { owner: string; repo: string }>();
  for (const entry of page) {
    const key = repoKeyOf(entry);
    if (!repoOriginals.has(key)) {
      repoOriginals.set(key, { owner: entry.owner, repo: entry.repo });
    }
  }
  const indexCache = new Map<string, SharedTrailIndex | null>();
  const pointerCache = new Map<string, boolean>();

  for (const [key, { owner, repo }] of repoOriginals) {
    try {
      indexCache.set(key, await getIndex(owner, repo));
    } catch {
      indexCache.set(key, null);
    }
  }

  const removedTrailIds = new Set<string>();
  const patched: OutboxIndexEntry[] = [];
  let dirty = false;

  for (const entry of page) {
    const repoKey = repoKeyOf(entry);
    const liveIndex = indexCache.get(repoKey);
    const liveEntry = liveIndex
      ? findIndexEntry(liveIndex, entry.trailId)
      : undefined;

    if (!liveEntry) {
      // Index miss — confirm via the id pointer before treating as deleted.
      let pointerExists = pointerCache.get(entry.trailId);
      if (pointerExists === undefined) {
        const pointer = await getIdPointer(entry.trailId).catch(() => null);
        pointerExists = pointer !== null;
        pointerCache.set(entry.trailId, pointerExists);
      }
      if (!pointerExists) {
        removedTrailIds.add(entry.trailId);
        dirty = true;
        continue;
      }
      patched.push(entry);
      continue;
    }

    if (liveEntry.updatedAt !== entry.snapshot.updatedAt) {
      patched.push({ ...entry, snapshot: liveEntry });
      dirty = true;
    } else {
      patched.push(entry);
    }
  }

  return { patched, removedTrailIds, dirty };
}

export async function GET(request: NextRequest) {
  try {
    const githubToken = await getGitHubToken();
    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const user = await fetchGitHubUser(githubToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const limit = parseLimit(searchParams.get('limit'));
    const offset = decodeCursor(searchParams.get('cursor'));

    const fullOutbox = await getOutbox(user.id);
    const sorted = [...fullOutbox.entries].sort(
      (a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)
    );

    const pageRaw = sorted.slice(offset, offset + limit);
    const { patched, removedTrailIds, dirty } = await refreshPage(pageRaw);

    if (dirty) {
      await updateOutbox(user.id, (data) => {
        const trailIdToPatched = new Map(patched.map((e) => [e.trailId, e]));
        const next: OutboxIndexEntry[] = [];
        for (const entry of data.entries) {
          if (removedTrailIds.has(entry.trailId)) continue;
          const replacement = trailIdToPatched.get(entry.trailId);
          next.push(replacement ?? entry);
        }
        return { ...data, entries: next };
      }).catch((error) => {
        // Lazy patches are best-effort — a write conflict here doesn't
        // affect the response the caller already saw.
        console.error('[Trails] Lazy outbox patch failed:', error);
      });
    }

    const nextOffset = offset + patched.length;
    const hasMore = nextOffset < sorted.length;

    return NextResponse.json({
      entries: patched,
      ...(hasMore ? { cursor: encodeCursor({ offset: nextOffset }) } : {}),
    });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Sent list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve sent items' },
      { status: 500 }
    );
  }
}
