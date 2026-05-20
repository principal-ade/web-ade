/**
 * Trails published by a GitHub user — public listing.
 *
 * Reads the per-user manifest at `trails/_by-user/{githubId}.json`. The
 * manifest is upserted by the publish path on POST `/api/trails` and pruned
 * by DELETE on the repo-scoped trail route, so this endpoint avoids fanning
 * out over every repo to find someone's trails.
 *
 * The manifest is public, but each individual trail still self-gates on
 * read via `/api/trails/by-id/{id}` (repo-access check). A reader without
 * access to a listed trail's repo will get the entry summary here but a
 * 403 on the per-trail fetch — same posture as the topics page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTrailsByUser } from '@/lib/trails/s3-storage';
import { ShareErrorCodes } from '@/lib/trails/types';
import type { ListTrailsByUserResponse } from '@/lib/trails/types';

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

    const index = await getTrailsByUser(githubId);
    const entries = [...index.entries].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    const response: ListTrailsByUserResponse = { entries };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Trails] by-user GET error:', error);
    return NextResponse.json(
      { error: 'Failed to list trails' },
      { status: 500 },
    );
  }
}
