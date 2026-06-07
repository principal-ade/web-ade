/**
 * GET /api/trails/feed
 *
 * Flat, newest-first feed of every INDIVIDUAL trail in a publicly-readable
 * repo — the data behind the home "View Trails" surface and `/explore`. Unlike
 * `/api/trails/repos` (which returns repo-level counts), this returns one row
 * per trail so the client can render a card per trail.
 *
 * Pagination is cursor-based: `nextCursor` is the last returned trail's `id`.
 * Because the full list is recomputed each call (and cached for `revalidate`
 * seconds) and deterministically sorted, the next page simply starts right
 * after that id — tie-safe, and cheap to implement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listPublicTrails } from '@/lib/trails/public-listing';
import type { ListPublicTrailsResponse } from '@/lib/trails/types';

export const revalidate = 60;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT)
    );
    const cursor = params.get('cursor');

    const all = await listPublicTrails();

    // Cursor = the id of the last item already shown; start right after it. An
    // unknown id (entry deleted between pages) falls back to the start.
    const from = cursor
      ? (() => {
          const i = all.findIndex((e) => e.id === cursor);
          return i === -1 ? 0 : i + 1;
        })()
      : 0;

    const page = all.slice(from, from + limit);
    const last = page[page.length - 1];
    const hasMore = from + page.length < all.length;

    const response: ListPublicTrailsResponse = {
      entries: page,
      ...(hasMore && last ? { nextCursor: last.id } : {}),
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Trails] Feed error:', error);
    return NextResponse.json(
      { error: 'Failed to list public trails' },
      { status: 500 }
    );
  }
}
