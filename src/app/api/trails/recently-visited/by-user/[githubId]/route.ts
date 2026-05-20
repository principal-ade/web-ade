/**
 * Per-user "recently visited" trails — signed-in dashboard listing.
 *
 * Reads the per-user manifest at `trails/_recently-visited/{githubId}.json`,
 * which the `/api/trails/by-id/{id}/visits` POST upserts on every signed-in
 * trail open. Entries are returned newest-visit-first.
 *
 * The manifest itself is public S3 (same posture as `_by-user`), but the
 * data is per-user — there's no broadcast read here, so callers are
 * expected to pass their own `githubId`. We don't auth-gate the response;
 * the listed trails self-gate on read via `/api/trails/by-id/{id}` if a
 * reader lacks repo access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecentlyVisitedTrails } from '@/lib/trails/s3-storage';
import { ShareErrorCodes } from '@/lib/trails/types';
import type { ListRecentlyVisitedTrailsResponse } from '@/lib/trails/types';

interface Params {
  params: Promise<{ githubId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { githubId: githubIdRaw } = await params;
    const githubId = Number(githubIdRaw);
    if (!Number.isFinite(githubId) || githubId <= 0) {
      return NextResponse.json(
        { error: 'Invalid githubId', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }

    const index = await getRecentlyVisitedTrails(githubId);
    const entries = [...index.entries].sort((a, b) =>
      b.lastVisitedAt.localeCompare(a.lastVisitedAt),
    );
    const response: ListRecentlyVisitedTrailsResponse = { entries };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Trails] recently-visited GET error:', error);
    return NextResponse.json(
      { error: 'Failed to list recently-visited trails' },
      { status: 500 },
    );
  }
}
