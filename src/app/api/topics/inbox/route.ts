/**
 * Inbox listing — per-user delivery feed for shared topics.
 *
 * The mirror of `GET /api/trails/inbox`. Storage lives under
 * `topics/_inbox/{githubId}/index.json`, written by the topic send route.
 *
 * Lazy snapshot freshness: when an entry is returned the live topic record is
 * consulted. If its `updatedAt` advanced, the snapshot in the response is
 * replaced (and the inbox index is patched in-place so future reads stay
 * fresh). If the topic is gone, the entry is dropped from the response and
 * from the index. Per-topic lookups are deduped so a page of 100 entries
 * pointing at a handful of topics costs only a few S3 reads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  getTopic,
  getTopicInbox,
  topicToByUserEntry,
  updateTopicInbox,
} from '@/lib/topics/s3-storage';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicInboxIndexEntry,
} from '@/lib/topics/types';

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
      Buffer.from(raw, 'base64url').toString('utf8'),
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
 * Page-level lazy snapshot refresh. For each distinct topicId on the page,
 * read the live topic once; for each entry, either patch its snapshot or mark
 * it for removal if the underlying topic is gone. Mirrors the trail inbox,
 * but topics aren't repo-scoped so the dedup key is just the topic id.
 */
async function refreshPage(page: TopicInboxIndexEntry[]): Promise<{
  patched: TopicInboxIndexEntry[];
  removedTopicIds: Set<string>;
  dirty: boolean;
}> {
  const topicCache = new Map<
    string,
    Awaited<ReturnType<typeof getTopic>>
  >();
  for (const entry of page) {
    if (!topicCache.has(entry.topicId)) {
      try {
        topicCache.set(entry.topicId, await getTopic(entry.topicId));
      } catch {
        // Treat a transient read failure as "unknown" — surface the entry
        // as-is rather than dropping it on a blip.
        topicCache.set(entry.topicId, null);
      }
    }
  }

  const removedTopicIds = new Set<string>();
  const patched: TopicInboxIndexEntry[] = [];
  let dirty = false;

  for (const entry of page) {
    const liveTopic = topicCache.get(entry.topicId);

    if (liveTopic === undefined) {
      // Should not happen (we primed the cache above), but be defensive.
      patched.push(entry);
      continue;
    }

    if (liveTopic === null) {
      // Topic record is gone — drop the row from the response and the index.
      removedTopicIds.add(entry.topicId);
      dirty = true;
      continue;
    }

    if (liveTopic.updatedAt !== entry.snapshot.updatedAt) {
      patched.push({ ...entry, snapshot: topicToByUserEntry(liveTopic) });
      dirty = true;
    } else {
      patched.push(entry);
    }
  }

  return { patched, removedTopicIds, dirty };
}

export async function GET(request: NextRequest) {
  try {
    const githubToken = await getGitHubToken();
    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    const user = await fetchGitHubUser(githubToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
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
    // filters/pagination — the tab badge needs the unfiltered count even when
    // the user is viewing "unread only" or paging through.
    const fullInbox = await getTopicInbox(user.id);
    const sorted = [...fullInbox.entries].sort(
      (a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt),
    );
    const unreadCount = sorted.reduce(
      (acc, e) => (e.readAt === null ? acc + 1 : acc),
      0,
    );

    const filtered = sorted.filter((entry) => {
      if (unreadOnly && entry.readAt !== null) return false;
      if (since !== null && Date.parse(entry.sentAt) <= since) return false;
      return true;
    });

    const pageRaw = filtered.slice(offset, offset + limit);
    const { patched, removedTopicIds, dirty } = await refreshPage(pageRaw);

    if (dirty) {
      await updateTopicInbox(user.id, (data) => {
        const topicIdToPatched = new Map(patched.map((e) => [e.topicId, e]));
        const next: TopicInboxIndexEntry[] = [];
        for (const entry of data.entries) {
          if (removedTopicIds.has(entry.topicId)) continue;
          const replacement = topicIdToPatched.get(entry.topicId);
          next.push(replacement ?? entry);
        }
        return { ...data, entries: next };
      }).catch((error) => {
        // Lazy patches are best-effort — a write conflict here doesn't affect
        // the response the caller already saw.
        console.error('[Topics] Lazy inbox patch failed:', error);
      });
    }

    const nextOffset = offset + patched.length;
    const hasMore = nextOffset < filtered.length;

    return NextResponse.json({
      entries: patched,
      unreadCount,
      ...(hasMore ? { cursor: encodeCursor({ offset: nextOffset }) } : {}),
    });
  } catch (error) {
    if (error instanceof TopicShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Topics] Inbox list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve inbox' },
      { status: 500 },
    );
  }
}
