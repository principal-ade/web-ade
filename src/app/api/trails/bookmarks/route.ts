/**
 * Per-user bookmarked-trails listing.
 *
 * Sibling to `/api/topics/bookmarks`. Snapshots are returned as-stored; the
 * detail-fetch path is where lazy refresh happens. Entries whose underlying
 * trail no longer exists carry `gone: true`.
 *
 * No repo-access gate at list time — the list is the caller's own, and
 * snapshots are static metadata. The gate enforces on the *original* bookmark
 * (you can only bookmark what you can read) and on opening the live trail.
 */

import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getIdPointer } from '@/lib/trails/s3-storage';
import { getBookmarkedTrails } from '@/lib/bookmarks/s3-storage';
import {
  BookmarkError,
  BookmarkErrorCodes,
  type BookmarkedTrailEntry,
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

    const index = await getBookmarkedTrails(user.id);
    const sorted = [...index.entries].sort(
      (a, b) => Date.parse(b.bookmarkedAt) - Date.parse(a.bookmarkedAt),
    );

    // `gone` annotation uses the id pointer (small JSON, not the full
    // payload). Parallel fan-out is bounded by the 500-entry cap.
    const annotated: BookmarkedTrailEntry[] = await Promise.all(
      sorted.map(async (entry) => {
        const pointer = await getIdPointer(entry.trailId).catch(() => null);
        return pointer === null ? { ...entry, gone: true as const } : entry;
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
    console.error('[Bookmarks] Trails list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve bookmarked trails' },
      { status: 500 },
    );
  }
}
