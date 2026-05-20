/**
 * Topics owned by a GitHub user — public listing.
 *
 * Reads the per-user manifest at `topics/_by-user/{githubId}.json`. The
 * manifest is upserted by every owner-mutating topic route (create / patch /
 * trail-add / trail-remove / reorder) so listings stay cheap — no fan-out
 * scan over `topics/_by-id/`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTopicsByUser } from '@/lib/topics/s3-storage';
import { TopicErrorCodes } from '@/lib/topics/types';
import type { ListTopicsByUserResponse } from '@/lib/topics/types';

interface Params {
  params: Promise<{ githubId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { githubId: githubIdRaw } = await params;
    const githubId = Number(githubIdRaw);
    if (!Number.isFinite(githubId) || githubId <= 0) {
      return NextResponse.json(
        { error: 'Invalid githubId', code: TopicErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }

    const index = await getTopicsByUser(githubId);
    // Most-recently-updated first; the upsert path already prepends, but
    // re-sort here so legacy rows (or future bulk writes) stay coherent.
    const entries = [...index.entries].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    const response: ListTopicsByUserResponse = { entries };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Topics] by-user GET error:', error);
    return NextResponse.json(
      { error: 'Failed to list topics' },
      { status: 500 },
    );
  }
}
