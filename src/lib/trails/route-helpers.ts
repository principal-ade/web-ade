/**
 * Shared resolver for /api/trails/[id]/* mutation routes (notes,
 * sign-offs). Resolves the trail by id, gates on GitHub repo read
 * access, fetches the authenticated user, and returns the four pieces
 * every mutation handler needs: {owner, repo, entry, user}. The trail
 * payload itself is read inside `updatePayload` for ETag-locked
 * mutation, so this helper deliberately doesn't fetch it.
 */

import { NextResponse } from 'next/server';
import {
  fetchGitHubUser,
  getGitHubToken,
} from '@/lib/auth/request';
import {
  findIndexEntry,
  getIdPointer,
  getIndex,
} from '@/lib/trails/s3-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import {
  TrailShareError,
  ShareErrorCodes,
  type SharedTrailIndexEntry,
} from '@/lib/trails/types';

export interface ResolvedTrailMutationContext {
  owner: string;
  repo: string;
  entry: SharedTrailIndexEntry;
  user: { id: number; login: string };
}

/**
 * Returns either the resolved context or a NextResponse to return
 * directly. Handlers should branch on the discriminator.
 */
export async function resolveTrailForMutation(
  id: string
): Promise<
  | { ok: true; ctx: ResolvedTrailMutationContext }
  | { ok: false; response: NextResponse }
> {
  if (!id || typeof id !== 'string') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid trail id', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      ),
    };
  }

  const githubToken = await getGitHubToken();
  if (!githubToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      ),
    };
  }

  const pointer = await getIdPointer(id);
  if (!pointer) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      ),
    };
  }

  const { owner, repo } = pointer;
  validateOwnerRepo(owner, repo);

  const access = await checkRepoAccess(owner, repo, githubToken);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 }
      ),
    };
  }

  const user = await fetchGitHubUser(githubToken);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      ),
    };
  }

  const index = await getIndex(owner, repo);
  const entry = findIndexEntry(index, id);
  if (!entry) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      ),
    };
  }

  return { ok: true, ctx: { owner, repo, entry, user } };
}

export function trailErrorResponse(
  error: unknown,
  fallback: string
): NextResponse {
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[Trails] mutation error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * Authorization for note/sign-off deletion: original author OR trail
 * owner (entry.createdBy.githubId). Owner gets moderation rights per
 * product decision.
 */
export function canModerate(
  user: { id: number; login: string },
  entry: SharedTrailIndexEntry,
  authorLogin: string
): boolean {
  if (user.login === authorLogin) return true;
  return user.id === entry.createdBy.githubId;
}
