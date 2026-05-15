/**
 * Mark every unread inbox entry read in one shot.
 *
 * Used when the user opens the Trails tab and we want to clear the badge
 * wholesale. Per-entry by-trail objects are patched best-effort; the
 * inbox index is the source of truth for read-state.
 */

import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { putInboxEntry, updateInbox } from '@/lib/trails/s3-storage';
import {
  ShareErrorCodes,
  TrailShareError,
  type InboxIndexEntry,
} from '@/lib/trails/types';

export async function POST() {
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

    const newlyMarked: InboxIndexEntry[] = [];
    const readAt = new Date().toISOString();

    await updateInbox(user.id, (inbox) => {
      const next: InboxIndexEntry[] = [];
      for (const entry of inbox.entries) {
        if (entry.readAt !== null) {
          next.push(entry);
          continue;
        }
        const patched: InboxIndexEntry = { ...entry, readAt };
        newlyMarked.push(patched);
        next.push(patched);
      }
      return { ...inbox, entries: next };
    });

    // Best-effort per-entry fan-out. Concurrent so the response isn't
    // gated on N sequential S3 writes; failures are swallowed because
    // the inbox index already reflects the new state.
    await Promise.allSettled(
      newlyMarked.map((entry) => putInboxEntry(user.id, entry))
    );

    return NextResponse.json({ marked: newlyMarked.length });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Inbox read-all error:', error);
    return NextResponse.json(
      { error: 'Failed to mark inbox read' },
      { status: 500 }
    );
  }
}
