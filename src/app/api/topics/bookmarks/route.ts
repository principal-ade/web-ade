/**
 * Per-user bookmarked-topics listing.
 *
 * Returns the caller's bookmarked topics, sorted newest-first. Per the spec
 * (mobile-app/docs/BOOKMARKED_TOPICS_TRAILS_API.md §3), snapshots are NOT
 * refreshed on this read — that happens lazily when the user opens an
 * entry. Entries whose underlying topic 404s are returned with
 * `gone: true` so the client can render a "no longer available" affordance.
 */

import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getTopic } from '@/lib/topics/s3-storage';
import { getBookmarkedTopics } from '@/lib/bookmarks/s3-storage';
import {
  BookmarkError,
  BookmarkErrorCodes,
  type BookmarkedTopicEntry,
} from '@/lib/bookmarks/types';

export async function GET() {
  try {
    const token = await getGitHubToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated', code: BookmarkErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }
    const user = await fetchGitHubUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: BookmarkErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    const index = await getBookmarkedTopics(user.id);
    const sorted = [...index.entries].sort(
      (a, b) => Date.parse(b.bookmarkedAt) - Date.parse(a.bookmarkedAt),
    );

    // Annotate entries whose underlying topic no longer exists. Parallel
    // existence checks; the 500-entry cap bounds the fan-out and S3
    // cache-control gives repeat tab-opens within a session a warm window.
    const annotated: BookmarkedTopicEntry[] = await Promise.all(
      sorted.map(async (entry) => {
        const live = await getTopic(entry.topicId).catch(() => null);
        return live === null ? { ...entry, gone: true as const } : entry;
      }),
    );

    return NextResponse.json({ entries: annotated });
  } catch (error) {
    if (error instanceof BookmarkError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Bookmarks] Topics list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve bookmarked topics' },
      { status: 500 },
    );
  }
}
