import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { getIndex } from '@/lib/trails/s3-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import type { ListSharedTrailsResponse } from '@/lib/trails/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const { owner, repo } = await params;

    // Public repos are readable by logged-out callers; checkRepoAccess
    // falls back to anonymous GitHub when the token is null.
    const githubToken = await getGitHubToken();

    validateOwnerRepo(owner, repo);

    const access = await checkRepoAccess(owner, repo, githubToken ?? null, 'page-load');
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 }
      );
    }

    const [index, viewerId] = await Promise.all([
      getIndex(owner, repo),
      getGitHubUserId(),
    ]);
    const entries = [...index.entries].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );

    const response: ListSharedTrailsResponse = {
      entries,
      viewerGithubId: viewerId ?? null,
      viewerIsRepoAdmin: access.canAdmin,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list trails' },
      { status: 500 }
    );
  }
}
