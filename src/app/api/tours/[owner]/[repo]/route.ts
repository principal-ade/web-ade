import { NextRequest, NextResponse } from 'next/server';
import {
  fetchGitHubUser,
  getGitHubToken,
  getGitHubUserId,
} from '@/lib/auth/request';
import { validateOwnerRepo } from '@/lib/trails/validation';
import {
  checkRepoAccess,
  resolveHeadSha,
} from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import { listToursForRepo } from '@/lib/tours/discovery';
import {
  buildStoreTourPath,
  getIndex,
  putIdPointer,
  putPayload,
  updateIndex,
  upsertTourInUserIndex,
} from '@/lib/tours/s3-storage';
import {
  summarizeTour,
  validateCreateTourRequest,
} from '@/lib/tours/validation';
import { assertTourWriteAllowed } from '@/lib/tours/authorization';
import { MAX_TOURS_PER_REPO } from '@/lib/tours/constants';
import type {
  CreateTourResponse,
  StoredTourPayload,
  TourIndexEntry,
} from '@/lib/tours/types';

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

/**
 * Publish a tour into the store for `owner/repo`. Gated by GitHub read access
 * (plus any owner-configured `writePolicy`). The server mints the store id,
 * stamps audio coordinates so TTS keying survives off-git, and writes the
 * payload, id pointer, repo index, and the creator's by-user manifest.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner: ownerParam, repo: repoParam } = await params;

    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();
    if (!githubToken || !userId) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    // The {owner}/{repo} the tour is published *under* comes from the URL; the
    // body carries the tour document (and, defensively, may echo owner/repo).
    const body = await request.json().catch(() => null);
    const merged =
      body && typeof body === 'object'
        ? { owner: ownerParam, repo: repoParam, ...body }
        : { owner: ownerParam, repo: repoParam };
    const { owner, repo, tour } = validateCreateTourRequest(merged);

    const access = await checkRepoAccess(owner, repo, githubToken);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 },
      );
    }

    const user = await fetchGitHubUser(githubToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    // Owner-gated create: honor the repo's write policy if one is set.
    const existingIndex = await getIndex(owner, repo);
    assertTourWriteAllowed(existingIndex.writePolicy, user.login, owner);

    const id = crypto.randomUUID();

    // Audio (TTS) keys off (owner, repo, path). A store-published tour has no
    // git file, so synthesize a stable path from the store id — this is the
    // off-git replacement for the discovered `*.tour.json` path. SHA is pinned
    // best-effort, exactly like trail provenance.
    const commitSha = await resolveHeadSha(owner, repo, githubToken);
    const storedPayload: StoredTourPayload = {
      tour,
      audio: {
        owner,
        repo,
        path: buildStoreTourPath(id),
        commitSha,
      },
    };

    const { sizeBytes } = await putPayload(owner, repo, id, storedPayload);
    await putIdPointer(owner, repo, id);

    const now = new Date().toISOString();
    const entry: TourIndexEntry = {
      id,
      ...summarizeTour(tour),
      createdBy: { githubId: user.id, githubLogin: user.login },
      githubRepoId: access.githubRepoId,
      createdAt: now,
      updatedAt: now,
      sizeBytes,
    };

    await updateIndex(owner, repo, (data) => {
      const next = [...data.entries, entry];
      // Soft cap: prune oldest by updatedAt when over the limit.
      if (next.length > MAX_TOURS_PER_REPO) {
        next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        next.length = MAX_TOURS_PER_REPO;
      }
      return {
        ...data,
        entries: next,
        repoVisibility: access.private ? 'private' : 'public',
        repoVisibilityCheckedAt: now,
      };
    });
    await upsertTourInUserIndex(owner, repo, entry);

    const response: CreateTourResponse = { id, url: `/tour/${id}`, entry };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Tours] Publish error:', error);
    return NextResponse.json(
      { error: 'Failed to publish tour' },
      { status: 500 },
    );
  }
}
