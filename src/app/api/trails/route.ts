/**
 * Shared Trails API
 *
 * POST - Publish a saved trail payload. Access is gated by GitHub read
 *        access to the named repo.
 *
 * Mirrors `/api/sequence-diagrams` POST but consumes `TrailPayload`
 * (markers + views) and writes to the `trails/` S3 prefix.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchGitHubUser,
  getGitHubToken,
  getGitHubUserId,
} from '@/lib/auth/request';
import {
  putIdPointer,
  putPayload,
  updateIndex,
} from '@/lib/trails/s3-storage';
import {
  summarizePayload,
  validateCreateRequest,
} from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import type {
  CreateSharedTrailResponse,
  SharedTrailIndexEntry,
} from '@/lib/trails/types';
import { MAX_TRAILS_PER_REPO } from '@/lib/trails/constants';

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[Trails] POST error:', error);
  return NextResponse.json(
    { error: 'Failed to publish trail' },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const { owner, repo, payload } = validateCreateRequest(body);

    const access = await checkRepoAccess(owner, repo, githubToken);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 }
      );
    }

    const user = await fetchGitHubUser(githubToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const id = payload.id;
    const summary = summarizePayload(payload);

    const { sizeBytes } = await putPayload(owner, repo, id, payload);
    await putIdPointer(owner, repo, id);

    const entry: SharedTrailIndexEntry = {
      id,
      title: payload.title,
      summaryPreview: summary.summaryPreview,
      markerCount: summary.markerCount,
      repoNames: summary.repoNames,
      hasDiffSnippets: summary.hasDiffSnippets,
      createdBy: { githubId: user.id, githubLogin: user.login },
      githubRepoId: access.githubRepoId,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      sizeBytes,
    };

    await updateIndex(owner, repo, (data) => {
      // Replace any existing entry with the same id (republish) so we
      // don't accumulate duplicates.
      const next = [...data.entries.filter((e) => e.id !== id), entry];
      // Soft cap: prune oldest by updatedAt when over the limit.
      if (next.length > MAX_TRAILS_PER_REPO) {
        next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        next.length = MAX_TRAILS_PER_REPO;
      }
      return { ...data, entries: next };
    });

    const url = `/trail/${id}`;
    const response: CreateSharedTrailResponse = { id, url, entry };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
