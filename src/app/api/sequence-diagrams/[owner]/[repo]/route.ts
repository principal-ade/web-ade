import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/request';
import { getIndex } from '@/lib/sequence-diagrams/s3-storage';
import { validateOwnerRepo } from '@/lib/sequence-diagrams/validation';
import { checkRepoAccess } from '@/lib/sequence-diagrams/github-access';
import {
  SequenceDiagramShareError,
  ShareErrorCodes,
} from '@/lib/sequence-diagrams/types';
import type { ListSharedDiagramsResponse } from '@/lib/sequence-diagrams/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const { owner, repo } = await params;

    const githubToken = await getGitHubToken();
    if (!githubToken) {
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
    const entries = [...index.entries].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );

    const response: ListSharedDiagramsResponse = { entries };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof SequenceDiagramShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[SequenceDiagrams] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list sequence diagrams' },
      { status: 500 }
    );
  }
}
