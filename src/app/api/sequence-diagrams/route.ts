/**
 * Shared Sequence Diagrams API
 *
 * POST - Publish a saved sequence-diagram payload. Access is gated by
 *        GitHub read access to the named repo.
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
} from '@/lib/sequence-diagrams/s3-storage';
import {
  summarizePayload,
  validateCreateRequest,
} from '@/lib/sequence-diagrams/validation';
import { checkRepoAccess } from '@/lib/sequence-diagrams/github-access';
import {
  SequenceDiagramShareError,
  ShareErrorCodes,
} from '@/lib/sequence-diagrams/types';
import type {
  CreateSharedDiagramResponse,
  SharedSequenceDiagramIndexEntry,
} from '@/lib/sequence-diagrams/types';
import { MAX_DIAGRAMS_PER_REPO } from '@/lib/sequence-diagrams/constants';

function errorResponse(error: unknown): NextResponse {
  if (error instanceof SequenceDiagramShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[SequenceDiagrams] POST error:', error);
  return NextResponse.json(
    { error: 'Failed to publish sequence diagram' },
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

    const entry: SharedSequenceDiagramIndexEntry = {
      id,
      title: payload.title,
      summaryPreview: summary.summaryPreview,
      eventCount: summary.eventCount,
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
      if (next.length > MAX_DIAGRAMS_PER_REPO) {
        next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        next.length = MAX_DIAGRAMS_PER_REPO;
      }
      return { ...data, entries: next };
    });

    const url = `/d/${owner}/${repo}/${id}`;
    const response: CreateSharedDiagramResponse = { id, url, entry };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
