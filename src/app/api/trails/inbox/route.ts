/**
 * Inbox listing — per-user delivery feed for shared trails.
 *
 * Storage lives under `trails/_inbox/{githubId}/index.json`. The inbox is
 * a thin indirection on top of the existing repo-centric trail store:
 * sender designates GitHub login recipients, server appends to each
 * recipient's inbox; the trail itself and its repo-access check are
 * unchanged.
 *
 * Lazy snapshot freshness: when an entry is returned, the live index
 * entry for the underlying trail is consulted. If it advanced, the
 * snapshot in the response is replaced (and the inbox index is patched
 * in-place so future reads stay fresh). If the trail is gone, the
 * entry is dropped from the response and from the index. Per-trail
 * lookups are deduped by (owner, repo) so a page of 100 entries from
 * a handful of repos costs only a few S3 reads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  findIndexEntry,
  getIdPointer,
  getIndex,
  getInbox,
  updateInbox,
} from '@/lib/trails/s3-storage';
import {
  ShareErrorCodes,
  TrailShareError,
  type InboxIndexEntry,
  type SharedTrailIndex,
} from '@/lib/trails/types';
import { deriveInboxNotification } from '@/lib/trails/notifications';

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

function isValidIsoDate(value: string): boolean {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

/**
 * Page-level lazy snapshot refresh. For each `(owner, repo)` seen on the
 * page, read the live index once; for each entry, either patch its
 * snapshot or mark it for removal if the underlying trail is gone.
 *
 * Returns the patched entries to return *and* a flag indicating whether
 * the inbox index needs to be written back (any patch or any removal).
 */
async function refreshPage(
  page: InboxIndexEntry[]
): Promise<{ patched: InboxIndexEntry[]; removedTrailIds: Set<string>; dirty: boolean }> {
  const repoKeyOf = (entry: InboxIndexEntry) =>
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
  const patched: InboxIndexEntry[] = [];
  let dirty = false;

  for (const entry of page) {
    const repoKey = repoKeyOf(entry);
    const liveIndex = indexCache.get(repoKey);
    const liveEntry = liveIndex
      ? findIndexEntry(liveIndex, entry.trailId)
      : undefined;

    if (!liveEntry) {
      // Index didn't have it. Confirm via the id pointer before treating
      // it as deleted — the index might just be a transient miss for a
      // trail that's been re-homed (defensive; pointer is the source of
      // truth for existence).
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
      // Pointer exists but index is missing the entry — surface as-is
      // (stale snapshot) rather than dropping. This is a rare edge.
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
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const sinceRaw = searchParams.get('since');
    const since =
      sinceRaw && isValidIsoDate(sinceRaw) ? Date.parse(sinceRaw) : null;
    const limit = parseLimit(searchParams.get('limit'));
    const offset = decodeCursor(searchParams.get('cursor'));

    // unreadCount is the total unread across the inbox, independent of
    // filters/pagination — the mobile tab badge needs the unfiltered count
    // even when the user is viewing "unread only" or paging through.
    const fullInbox = await getInbox(user.id);
    const sorted = [...fullInbox.entries].sort(
      (a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)
    );
    // "Unread" now means "needs attention" — unopened OR has new notes since
    // the recipient last looked. Derived in one place so the badge, the
    // filter, and the per-row notification all agree.
    const unreadCount = sorted.reduce(
      (acc, e) => (deriveInboxNotification(e).dot ? acc + 1 : acc),
      0
    );

    const filtered = sorted.filter((entry) => {
      if (unreadOnly && !deriveInboxNotification(entry).dot) return false;
      if (since !== null && Date.parse(entry.sentAt) <= since) return false;
      return true;
    });

    const pageRaw = filtered.slice(offset, offset + limit);
    const { patched, removedTrailIds, dirty } = await refreshPage(pageRaw);

    if (dirty) {
      await updateInbox(user.id, (data) => {
        const trailIdToPatched = new Map(patched.map((e) => [e.trailId, e]));
        const next: InboxIndexEntry[] = [];
        for (const entry of data.entries) {
          if (removedTrailIds.has(entry.trailId)) continue;
          const replacement = trailIdToPatched.get(entry.trailId);
          next.push(replacement ?? entry);
        }
        return { ...data, entries: next };
      }).catch((error) => {
        // Lazy patches are best-effort — a write conflict here doesn't
        // affect the response the caller already saw.
        console.error('[Trails] Lazy inbox patch failed:', error);
      });
    }

    const nextOffset = offset + patched.length;
    const hasMore = nextOffset < filtered.length;

    return NextResponse.json({
      entries: patched.map((entry) => ({
        ...entry,
        notification: deriveInboxNotification(entry),
      })),
      unreadCount,
      ...(hasMore ? { cursor: encodeCursor({ offset: nextOffset }) } : {}),
    });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Inbox list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve inbox' },
      { status: 500 }
    );
  }
}

