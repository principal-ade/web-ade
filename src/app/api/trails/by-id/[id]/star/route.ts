/**
 * Trail star toggle — per-user starred-trails indirection.
 *
 * POST   stars a trail for the authenticated caller. Repo-access checked
 *        against the trail's `(owner, repo)` — you can only star something
 *        you can read.
 * DELETE unstars. No repo-access check — unstarring after losing access
 *        must still work.
 *
 * Both are idempotent. Re-starring refreshes `starredAt` + `snapshot`;
 * unstarring an entry that isn't there is a no-op.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  findIndexEntry,
  getIdPointer,
  getIndex,
} from '@/lib/trails/s3-storage';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { TrailShareError } from '@/lib/trails/types';
import {
  removeStarredTrail,
  upsertStarredTrail,
} from '@/lib/stars/s3-storage';
import {
  StarError,
  StarErrorCodes,
  StarWarningCodes,
  type StarredTrailEntry,
} from '@/lib/stars/types';

interface Params {
  params: Promise<{ id: string }>;
}

function errorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof StarError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error(`[Stars] Trail ${where} error:`, error);
  return NextResponse.json(
    { error: `Failed to ${where} starred trail` },
    { status: 500 },
  );
}

async function requireUser(): Promise<
  | { kind: 'ok'; userId: number; token: string }
  | { kind: 'response'; response: NextResponse }
> {
  const token = await getGitHubToken();
  if (!token) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not authenticated', code: StarErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  const user = await fetchGitHubUser(token);
  if (!user) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not authenticated', code: StarErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  return { kind: 'ok', userId: user.id, token };
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireUser();
    if (guard.kind === 'response') return guard.response;

    const pointer = await getIdPointer(id);
    if (!pointer) {
      return NextResponse.json(
        { error: 'Trail not found', code: StarErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }
    const { owner, repo } = pointer;
    validateOwnerRepo(owner, repo);

    const access = await checkRepoAccess(owner, repo, guard.token);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: StarErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 },
      );
    }

    const index = await getIndex(owner, repo);
    const indexEntry = findIndexEntry(index, id);
    if (!indexEntry) {
      // Pointer existed but the repo index lost the entry — treat as gone.
      return NextResponse.json(
        { error: 'Trail not found', code: StarErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    const entry: StarredTrailEntry = {
      trailId: id,
      starredAt: new Date().toISOString(),
      owner,
      repo,
      snapshot: indexEntry,
    };
    const result = await upsertStarredTrail(guard.userId, entry);

    return NextResponse.json({
      entry: result.entry,
      ...(result.pruned
        ? { warnings: [StarWarningCodes.STAR_LIMIT_REACHED] }
        : {}),
    });
  } catch (error) {
    return errorResponse(error, 'POST');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireUser();
    if (guard.kind === 'response') return guard.response;

    // No pointer / repo-access check — losing read access must not block
    // unstar. Idempotent: removing a missing entry is a no-op.
    await removeStarredTrail(guard.userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 'DELETE');
  }
}
