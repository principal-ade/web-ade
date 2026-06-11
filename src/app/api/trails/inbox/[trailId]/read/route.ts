/**
 * Mark a single inbox entry read.
 *
 * Idempotent — repeated calls leave `readAt` at the original timestamp.
 * 404 `INBOX_NOT_FOUND` if the trailId isn't in the caller's inbox; this
 * is distinct from `NOT_FOUND` (the trail doesn't exist at all) so mobile
 * can distinguish "trail vanished" from "wrong inbox row".
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { putInboxEntry, updateInbox } from '@/lib/trails/s3-storage';
import {
  ShareErrorCodes,
  TrailShareError,
  type InboxIndexEntry,
} from '@/lib/trails/types';

interface Params {
  params: Promise<{ trailId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { trailId } = await params;

    if (!trailId || typeof trailId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid trail id', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }

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

    let patchedEntry: InboxIndexEntry | null = null;
    let entryMissing = false;

    await updateInbox(user.id, (inbox) => {
      const next: InboxIndexEntry[] = [];
      let found = false;
      for (const entry of inbox.entries) {
        if (entry.trailId !== trailId) {
          next.push(entry);
          continue;
        }
        found = true;
        // Idempotent on readAt: keep the original timestamp if already read.
        const readAt = entry.readAt ?? new Date().toISOString();
        // Opening always advances the notes watermark to the count the
        // recipient is now looking at, clearing any "(N new)" badge.
        const notesSeenCount = entry.snapshot.noteCount ?? 0;
        const patched: InboxIndexEntry = { ...entry, readAt, notesSeenCount };
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
          code: ShareErrorCodes.INBOX_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    // Keep the per-entry object in sync. Best-effort — the inbox index
    // is the source of truth for read-state.
    await putInboxEntry(user.id, patchedEntry).catch(() => undefined);

    return NextResponse.json({ readAt: (patchedEntry as InboxIndexEntry).readAt });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Inbox mark-read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark inbox entry read' },
      { status: 500 }
    );
  }
}
