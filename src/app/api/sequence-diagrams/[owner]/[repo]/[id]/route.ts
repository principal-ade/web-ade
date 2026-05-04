import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import {
  deletePayload,
  findIndexEntry,
  getIndex,
  getPayload,
  updateIndex,
} from '@/lib/sequence-diagrams/s3-storage';
import { validateOwnerRepo } from '@/lib/sequence-diagrams/validation';
import { checkRepoAccess } from '@/lib/sequence-diagrams/github-access';
import {
  SequenceDiagramShareError,
  ShareErrorCodes,
} from '@/lib/sequence-diagrams/types';

interface Params {
  params: Promise<{ owner: string; repo: string; id: string }>;
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof SequenceDiagramShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[SequenceDiagrams] by-id error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { owner, repo, id } = await params;

    // Public repos are readable by logged-out callers; checkRepoAccess
    // falls back to anonymous GitHub when the token is null.
    const githubToken = await getGitHubToken();

    validateOwnerRepo(owner, repo);

    const access = await checkRepoAccess(owner, repo, githubToken ?? null);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 }
      );
    }

    const [payload, index] = await Promise.all([
      getPayload(owner, repo, id),
      getIndex(owner, repo),
    ]);

    const entry = findIndexEntry(index, id);

    if (!payload || !entry) {
      return NextResponse.json(
        { error: 'Sequence diagram not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    return NextResponse.json({ entry, payload });
  } catch (error) {
    return errorResponse(error, 'Failed to retrieve sequence diagram');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { owner, repo, id } = await params;

    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    validateOwnerRepo(owner, repo);

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

    const index = await getIndex(owner, repo);
    const entry = findIndexEntry(index, id);

    if (!entry) {
      return NextResponse.json(
        { error: 'Sequence diagram not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    if (String(entry.createdBy.githubId) !== String(userId)) {
      return NextResponse.json(
        {
          error: 'Only the creator can delete this diagram',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    await deletePayload(owner, repo, id);
    await updateIndex(owner, repo, (data) => ({
      ...data,
      entries: data.entries.filter((e) => e.id !== id),
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete sequence diagram');
  }
}
