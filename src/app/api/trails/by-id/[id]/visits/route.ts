/**
 * Trail visit recorder.
 *
 * POST /api/trails/by-id/{id}/visits
 *   Body: none
 *   Returns: { visitors: { named: string[]; anonymousCount: number } }
 *
 * Two cohorts:
 * - Verified: caller has a GitHub identity → login is added to
 *   `visitors.named` (deduped). Idempotent per login.
 * - Anonymous: identified by an HttpOnly `trail-anon-id` cookie
 *   (random UUID, 1-year Max-Age). The cookie's UUID is stored
 *   server-side under `payload._seenAnonIds`; if the UUID is already
 *   present, this is a no-op increment. Same browser across reloads
 *   and localStorage clears stays counted once.
 *
 * The cookie is the only line of defense against anonymous
 * overcounting; clients with no cookie support, private browsing
 * sessions, or cookie clears will count again on next visit. That
 * matches the panel's contract for `anonymousCount` (a count of
 * unverified visits, not unique humans).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchGitHubUser,
  getGitHubToken,
} from '@/lib/auth/request';
import {
  getIdPointer,
  recordTrailVisit,
  updatePayload,
} from '@/lib/trails/s3-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import {
  TrailShareError,
  ShareErrorCodes,
  type StoredTrailPayload,
} from '@/lib/trails/types';

const ANON_COOKIE = 'trail-anon-id';
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface Params {
  params: Promise<{ id: string }>;
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[Trails] visits POST error:', error);
  return NextResponse.json(
    { error: 'Failed to record visit' },
    { status: 500 }
  );
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid trail id', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }

    const pointer = await getIdPointer(id);
    if (!pointer) {
      return NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }
    const { owner, repo } = pointer;
    validateOwnerRepo(owner, repo);

    // Public-trail-friendly access gate — pass through anonymous
    // tokens so anyone who can read the trail page can record a visit.
    const githubToken = await getGitHubToken();
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

    const visitor = githubToken ? await fetchGitHubUser(githubToken) : null;
    const visitorLogin = visitor?.login ?? null;

    // Anonymous-visitor identifier: a random UUID stored in an
    // HttpOnly cookie. If the cookie isn't present yet we mint a new
    // one and set it on the response. Generated up front so the
    // payload modifier below can dedup against it.
    const existingAnonId = request.cookies.get(ANON_COOKIE)?.value ?? null;
    const anonId =
      existingAnonId && existingAnonId.length > 0
        ? existingAnonId
        : crypto.randomUUID();

    const updated = (await updatePayload(owner, repo, id, (payload) => {
      const stored = payload as StoredTrailPayload;
      const currentVisitors = stored.visitors ?? {
        named: [],
        anonymousCount: 0,
      };
      const seenAnonIds = stored._seenAnonIds ?? [];

      if (visitorLogin) {
        if (currentVisitors.named.includes(visitorLogin)) {
          return payload;
        }
        const next: StoredTrailPayload = {
          ...stored,
          visitors: {
            named: [...currentVisitors.named, visitorLogin],
            anonymousCount: currentVisitors.anonymousCount,
          },
        };
        return next;
      }

      // Anonymous path. Dedup against the cookie UUID.
      if (seenAnonIds.includes(anonId)) {
        return payload;
      }
      const next: StoredTrailPayload = {
        ...stored,
        visitors: {
          named: currentVisitors.named,
          anonymousCount: currentVisitors.anonymousCount + 1,
        },
        _seenAnonIds: [...seenAnonIds, anonId],
      };
      return next;
    })) as StoredTrailPayload;

    // Record this visit in the viewer's per-user "recently visited" manifest
    // so it can surface on the signed-in dashboard. Best-effort and signed-in
    // only — anonymous opens don't carry a stable identity to key on.
    if (visitor) {
      void recordTrailVisit(visitor.id, {
        id: updated.id,
        title: updated.title ?? '(untitled)',
        owner,
        repo,
        updatedAt: updated.updatedAt ?? new Date().toISOString(),
      });
    }

    const response = NextResponse.json({
      visitors: updated.visitors ?? { named: [], anonymousCount: 0 },
    });

    // Persist the anon cookie if it was just minted, and refresh the
    // Max-Age on every visit so a regular reader's id doesn't expire
    // and re-bump the count a year later.
    response.cookies.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ANON_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
