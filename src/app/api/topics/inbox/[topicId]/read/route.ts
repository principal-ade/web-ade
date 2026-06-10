/**
 * Mark a single topic inbox entry read.
 *
 * Idempotent — repeated calls leave `readAt` at the original timestamp.
 * 404 `INBOX_NOT_FOUND` if the topicId isn't in the caller's inbox; this is
 * distinct from `NOT_FOUND` (the topic doesn't exist at all) so the client
 * can distinguish "topic vanished" from "wrong inbox row". Mirrors
 * `POST /api/trails/inbox/[trailId]/read`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  putTopicInboxEntry,
  updateTopicInbox,
} from '@/lib/topics/s3-storage';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicInboxIndexEntry,
} from '@/lib/topics/types';

interface Params {
  params: Promise<{ topicId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { topicId } = await params;

    if (!topicId || typeof topicId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid topic id', code: TopicErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }

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

    let patchedEntry: TopicInboxIndexEntry | null = null;
    let entryMissing = false;

    await updateTopicInbox(user.id, (inbox) => {
      const next: TopicInboxIndexEntry[] = [];
      let found = false;
      for (const entry of inbox.entries) {
        if (entry.topicId !== topicId) {
          next.push(entry);
          continue;
        }
        found = true;
        // Idempotent: keep the original readAt if already read.
        const readAt = entry.readAt ?? new Date().toISOString();
        const patched: TopicInboxIndexEntry = { ...entry, readAt };
        patchedEntry = patched;
        next.push(patched);
      }
      if (!found) {
        entryMissing = true;
        return inbox;
      }
      return { ...inbox, entries: next };
    });

    if (entryMissing || !patchedEntry) {
      return NextResponse.json(
        {
          error: 'Inbox entry not found',
          code: TopicErrorCodes.INBOX_NOT_FOUND,
        },
        { status: 404 },
      );
    }

    // Keep the per-entry object in sync. Best-effort — the inbox index is the
    // source of truth for read-state.
    await putTopicInboxEntry(user.id, patchedEntry).catch(() => undefined);

    return NextResponse.json({
      readAt: (patchedEntry as TopicInboxIndexEntry).readAt,
    });
  } catch (error) {
    if (error instanceof TopicShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Topics] Inbox mark-read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark inbox entry read' },
      { status: 500 },
    );
  }
}
