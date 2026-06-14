import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/request';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import { listToursForRepo } from '@/lib/tours/discovery';

/**
 * List the tours available for a repo. Walks the git tree for every
 * `*.tour.json` (in the repo or a cached fork) and returns each
 * fully-parsed `IntroductionTour`.
 *
 * Tours are small and few, so — unlike trails — the full payloads ship in the
 * index response and there's no separate by-id endpoint.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await params;

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
        { status: 403 },
      );
    }

    const tours = await listToursForRepo(owner, repo, githubToken ?? null);
    return NextResponse.json({ tours });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Tours] List error:', error);
    return NextResponse.json({ error: 'Failed to list tours' }, { status: 500 });
  }
}
