/**
 * Community repo-visit feed.
 *
 * GET  /api/repos/community-visits
 *   Returns: { entries: PublicCommunityRepoVisit[] } — public repos people
 *   have opened recently, newest-first, with a rough deduped visitor count.
 *   Public/unauthenticated: it's a community feed, not per-user data.
 *
 * POST /api/repos/community-visits
 *   Body: { owner, repo }
 *   Records an open of a PUBLIC repo. Private repos are silently skipped so a
 *   private repo name never surfaces in anyone else's feed. Visitors are
 *   deduped by GitHub id (signed-in) or an HttpOnly anon cookie — the same
 *   `trail-anon-id` cookie the trail-visits recorder uses, so a browser has
 *   one stable anonymous identity across both feeds. Best-effort: a failure
 *   here never blocks the repo page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import {
  getCommunityRepoVisits,
  recordCommunityRepoVisit,
} from '@/lib/repos/community-visits';
import { warmCarouselCache } from '@/lib/community-carousel/carousel-cache';

// Shared with the trail-visits recorder so one browser has a single anon id.
const ANON_COOKIE = 'trail-anon-id';
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** How many feed rows the home rail renders. */
const FEED_LIMIT = 24;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[CommunityRepos] route error:', error);
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}

export async function GET() {
  try {
    const entries = await getCommunityRepoVisits(FEED_LIMIT);
    return NextResponse.json({ entries });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      owner?: unknown;
      repo?: unknown;
    } | null;
    const owner = body?.owner;
    const repo = body?.repo;
    if (typeof owner !== 'string' || typeof repo !== 'string') {
      return NextResponse.json(
        { error: 'owner and repo are required', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }
    validateOwnerRepo(owner, repo);

    // Resolve public/private + fresh metadata straight from GitHub — never
    // trust the client for the public-only gate. `checkRepoAccess` returns
    // null when the repo can't be read (private-to-others or missing); either
    // way there's nothing to add to a public community feed.
    const token = await getGitHubToken();
    const access = await checkRepoAccess(owner, repo, token ?? null);
    if (!access || access.private) {
      return new NextResponse(null, { status: 204 });
    }

    // Visitor fingerprint: GitHub id when signed in, else a per-browser anon
    // cookie. Minted up front so the recorder can dedup against it.
    const visitor = token ? await fetchGitHubUser(token) : null;
    const existingAnonId = request.cookies.get(ANON_COOKIE)?.value ?? null;
    const anonId =
      existingAnonId && existingAnonId.length > 0
        ? existingAnonId
        : crypto.randomUUID();
    const visitorId = visitor ? `g:${visitor.id}` : `a:${anonId}`;

    // access.fullName carries GitHub's canonical casing for display.
    const [splitOwner, splitRepo] = access.fullName.split('/');
    const displayOwner = splitOwner || owner;
    const displayRepo = splitRepo || repo;

    await recordCommunityRepoVisit(
      {
        owner: displayOwner,
        repo: displayRepo,
        description: access.description,
        language: access.primaryLanguage,
        stargazersCount: access.stars,
      },
      visitorId
    );

    // Warm the carousel cache in the background so the marketing page stays
    // fresh without blocking the visit response.
    void warmCarouselCache().catch(() => {});

    const response = new NextResponse(null, { status: 204 });
    // Persist / refresh the anon cookie (only meaningful for anon visitors,
    // harmless for signed-in ones) so the same browser keeps one identity.
    if (!visitor) {
      response.cookies.set(ANON_COOKIE, anonId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ANON_COOKIE_MAX_AGE,
      });
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
