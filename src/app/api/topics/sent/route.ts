/**
 * Sent listing — sender-side feed of topics the signed-in user has shared.
 *
 * The mirror of `GET /api/topics/inbox`. Storage lives under
 * `topics/_outbox/{githubId}/index.json`, written by the topic send route.
 * Each row is one topic with the merged recipient set and the most-recent
 * `sentAt`. There is no read-state here (the sender's own list), so no
 * `unreadCount`.
 *
 * Lazy snapshot freshness mirrors the inbox: when an entry is returned the
 * live topic record is consulted; if it advanced its snapshot is patched (and
 * the outbox is written back), and if the topic is gone the row is dropped
 * from both the response and the index.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  getTopic,
  getTopicOutbox,
  topicToByUserEntry,
  updateTopicOutbox,
} from '@/lib/topics/s3-storage';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicOutboxIndexEntry,
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

/**
 * Page-level lazy snapshot refresh. For each distinct topicId on the page,
 * read the live topic once; for each entry, either patch its snapshot or mark
 * it for removal if the underlying topic is gone. Mirrors the inbox.
 */
async function refreshPage(page: TopicOutboxIndexEntry[]): Promise<{
  patched: TopicOutboxIndexEntry[];
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
        topicCache.set(entry.topicId, null);
      }
    }
  }

  const removedTopicIds = new Set<string>();
  const patched: TopicOutboxIndexEntry[] = [];
  let dirty = false;

  for (const entry of page) {
    const liveTopic = topicCache.get(entry.topicId);

    if (liveTopic === undefined) {
      patched.push(entry);
      continue;
    }

    if (liveTopic === null) {
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
    const limit = parseLimit(searchParams.get('limit'));
    const offset = decodeCursor(searchParams.get('cursor'));

    const fullOutbox = await getTopicOutbox(user.id);
    const sorted = [...fullOutbox.entries].sort(
      (a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt),
    );

    const pageRaw = sorted.slice(offset, offset + limit);
    const { patched, removedTopicIds, dirty } = await refreshPage(pageRaw);

    if (dirty) {
      await updateTopicOutbox(user.id, (data) => {
        const topicIdToPatched = new Map(patched.map((e) => [e.topicId, e]));
        const next: TopicOutboxIndexEntry[] = [];
        for (const entry of data.entries) {
          if (removedTopicIds.has(entry.topicId)) continue;
          const replacement = topicIdToPatched.get(entry.topicId);
          next.push(replacement ?? entry);
        }
        return { ...data, entries: next };
      }).catch((error) => {
        console.error('[Topics] Lazy outbox patch failed:', error);
      });
    }

    const nextOffset = offset + patched.length;
    const hasMore = nextOffset < sorted.length;

    return NextResponse.json({
      entries: patched,
      ...(hasMore ? { cursor: encodeCursor({ offset: nextOffset }) } : {}),
    });
  } catch (error) {
    if (error instanceof TopicShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Topics] Sent list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve sent items' },
      { status: 500 },
    );
  }
}
