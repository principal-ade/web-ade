/**
 * Inbox unread-count — tab-badge helper.
 *
 * Returns just the unread total for the authenticated user. Same number
 * `GET /api/trails/inbox` would compute, without the entries body — so
 * the mobile tab badge can poll cheaply on foreground / pull-to-refresh.
 */

import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getInbox } from '@/lib/trails/s3-storage';
import { deriveInboxNotification } from '@/lib/trails/notifications';
import { ShareErrorCodes, TrailShareError } from '@/lib/trails/types';

export async function GET() {
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

    const inbox = await getInbox(user.id);
    // Mirror the inbox list's "needs attention" derivation: unopened OR has
    // new notes since last open.
    const count = inbox.entries.reduce(
      (acc, entry) => (deriveInboxNotification(entry).dot ? acc + 1 : acc),
      0
    );

    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Inbox unread-count error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve inbox unread count' },
      { status: 500 }
    );
  }
}
