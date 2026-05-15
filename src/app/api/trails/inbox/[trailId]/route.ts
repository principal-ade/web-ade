/**
 * Remove an entry from the caller's inbox.
 *
 * Does NOT delete the underlying trail — only the inbox row. The trail
 * stays readable via `/api/trails/by-id/{id}` as long as the recipient
 * still has repo access. 404 `INBOX_NOT_FOUND` distinguishes "not in
 * your inbox" from "trail doesn't exist".
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { deleteInboxEntry, updateInbox } from '@/lib/trails/s3-storage';
import { ShareErrorCodes, TrailShareError } from '@/lib/trails/types';

interface Params {
  params: Promise<{ trailId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
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

    let entryMissing = false;
    await updateInbox(user.id, (inbox) => {
      const next = inbox.entries.filter((entry) => entry.trailId !== trailId);
      if (next.length === inbox.entries.length) {
        entryMissing = true;
        return inbox;
      }
      return { ...inbox, entries: next };
    });

    if (entryMissing) {
      return NextResponse.json(
        {
          error: 'Inbox entry not found',
          code: ShareErrorCodes.INBOX_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    await deleteInboxEntry(user.id, trailId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Inbox delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete inbox entry' },
      { status: 500 }
    );
  }
}
