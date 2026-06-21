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
  getIndex,
  putIdPointer,
  putPayload,
  updateIndex,
  upsertTourInUserIndex,
} from '@/lib/tours/s3-storage';
import { summarizeTour, validateTour } from '@/lib/tours/validation';
import { assertTourWriteAllowed } from '@/lib/tours/authorization';
import { MAX_TOURS_PER_REPO } from '@/lib/tours/constants';
import type { CreateTourResponse, TourIndexEntry } from '@/lib/tours/types';
import type { TourRepoRef } from '@principal-ai/file-city-builder';

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
 * stamps the publish target as the tour's primary `repos[0]` (authoritative),
 * and writes the tour payload, id pointer, repo index, and by-user manifest.
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

    // owner/repo come from the URL (authoritative for the publish target); the
    // body carries the tour document under `tour`.
    validateOwnerRepo(ownerParam, repoParam);
    const owner = ownerParam;
    const repo = repoParam;
    const body = await request.json().catch(() => null);
    const rawTour =
      body && typeof body === 'object'
        ? (body as { tour?: unknown }).tour
        : undefined;
    if (!rawTour || typeof rawTour !== 'object') {
      throw new TrailShareError(
        'Request body must include a tour object',
        400,
        ShareErrorCodes.INVALID_PAYLOAD,
      );
    }

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

    const commitSha = await resolveHeadSha(owner, repo, githubToken);

    // The server is authoritative for the publish target: stamp it as the
    // primary repo (`repos[0]`), preserving any additional repos the client
    // declared for a multi-repo tour. `repos[0]` is what discovery derives the
    // audio coords + working-tree resolution from, so it must match the URL.
    const primaryRepo: TourRepoRef = {
      id: `pkg:github/${owner.toLowerCase()}/${repo}`,
      name: repo,
      remote: { host: 'github', owner, name: repo },
      ...(commitSha ? { authoredAtSha: commitSha } : {}),
    };
    const clientRepos = Array.isArray((rawTour as { repos?: unknown }).repos)
      ? ((rawTour as { repos: TourRepoRef[] }).repos.slice(1))
      : [];
    const stampedTour = {
      ...(rawTour as Record<string, unknown>),
      repos: [primaryRepo, ...clientRepos],
    };

    // Validate the stamped tour (now guaranteed to carry repos) via parseTour.
    const tour = validateTour(stampedTour);

    // Republish-as-replace: if a tour with the same author-chosen `tourId`
    // already exists for this repo, reuse its server store id so the payload,
    // id pointer, and index entries all overwrite in place instead of stacking
    // up a duplicate. Otherwise mint a fresh id for a brand-new tour.
    const existingEntry = existingIndex.entries.find(
      (e) => e.tourId === tour.id,
    );
    const id = existingEntry?.id ?? crypto.randomUUID();

    const { sizeBytes } = await putPayload(owner, repo, id, tour);
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

    // Point the share link at the repo page, which is where tours actually
    // render — there is no standalone `/tour/<id>` page route. (A `?tour=<id>`
    // query param to open this specific tour is a planned follow-up; for now
    // the repo page auto-selects the first tour.)
    const response: CreateTourResponse = {
      id,
      url: `/${owner}/${repo}`,
      entry,
    };
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
