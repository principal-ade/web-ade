/**
 * Topic inbox unread-count — tab-badge helper.
 *
 * Returns just the unread total for the authenticated user. Same number
 * `GET /api/topics/inbox` would compute, without the entries body — so the
 * desktop tab badge can poll cheaply. Mirrors
 * `GET /api/trails/inbox/unread-count`.
 */

import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getTopicInbox } from '@/lib/topics/s3-storage';
import { TopicErrorCodes, TopicShareError } from '@/lib/topics/types';

export async function GET() {
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

    const inbox = await getTopicInbox(user.id);
    const count = inbox.entries.reduce(
      (acc, entry) => (entry.readAt === null ? acc + 1 : acc),
      0,
    );

    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof TopicShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Topics] Inbox unread-count error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve inbox unread count' },
      { status: 500 },
    );
  }
}
