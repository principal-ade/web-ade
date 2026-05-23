/**
 * Per-user starred-trails listing.
 *
 * Sibling to `/api/topics/starred`. Snapshots are returned as-stored; the
 * detail-fetch path is where lazy refresh happens. Entries whose underlying
 * trail no longer exists carry `gone: true`.
 *
 * No repo-access gate at list time — the list is the caller's own, and
 * snapshots are static metadata. The gate enforces on the *original* star
 * (you can only star what you can read) and on opening the live trail.
 */

import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getIdPointer } from '@/lib/trails/s3-storage';
import { getStarredTrails } from '@/lib/stars/s3-storage';
import {
  StarError,
  StarErrorCodes,
  type StarredTrailEntry,
} from '@/lib/stars/types';

export async function GET() {
  try {
    const token = await getGitHubToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated', code: StarErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }
    const user = await fetchGitHubUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: StarErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    const index = await getStarredTrails(user.id);
    const sorted = [...index.entries].sort(
      (a, b) => Date.parse(b.starredAt) - Date.parse(a.starredAt),
    );

    // `gone` annotation uses the id pointer (small JSON, not the full
    // payload). Parallel fan-out is bounded by the 500-entry cap.
    const annotated: StarredTrailEntry[] = await Promise.all(
      sorted.map(async (entry) => {
        const pointer = await getIdPointer(entry.trailId).catch(() => null);
        return pointer === null ? { ...entry, gone: true as const } : entry;
      }),
    );

    return NextResponse.json({ entries: annotated });
  } catch (error) {
    if (error instanceof StarError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Stars] Trails list error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve starred trails' },
      { status: 500 },
    );
  }
}
