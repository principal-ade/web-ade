import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import {
  deleteIdPointer,
  deletePayload,
  findIndexEntry,
  getIdPointer,
  getIndex,
  getPayload,
  putIdPointer,
  removeTrailFromUserIndex,
  updateIndex,
} from '@/lib/trails/s3-storage';
import { getAnonNotes } from '@/lib/trails/anon-notes-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess, getGitHubDisplayName } from '@/lib/trails/github-access';
import {
  TrailShareError,
  ShareErrorCodes,
  toPublicPayload,
  type StoredTrailPayload,
} from '@/lib/trails/types';

interface Params {
  params: Promise<{ owner: string; repo: string; id: string }>;
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[Trails] by-id error:', error);
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

    const [payload, index, anonNotes] = await Promise.all([
      getPayload(owner, repo, id),
      getIndex(owner, repo),
      getAnonNotes(id),
    ]);

    const entry = findIndexEntry(index, id);

    if (!payload || !entry) {
      return NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    // Lazy backfill: trails created before the by-id pointer existed have
    // no entry under _by-id/. Now that we've confirmed the payload, write
    // one if missing so future /trail/{id} share links resolve.
    try {
      const pointer = await getIdPointer(id);
      if (!pointer) {
        await putIdPointer(owner, repo, id);
      }
    } catch (backfillError) {
      // Backfill is opportunistic — never fail the read because of it.
      console.warn('[Trails] Pointer backfill failed:', {
        owner,
        repo,
        id,
        error:
          backfillError instanceof Error
            ? backfillError.message
            : String(backfillError),
      });
    }

    const stored = payload as StoredTrailPayload;
    const publicPayload = toPublicPayload(stored);
    // Merge anon notes into the panel-facing notes array. They carry
    // an `anon-` id prefix so the trail page can route deletes to
    // the anon-notes endpoint instead of the authored-notes one.
    if (anonNotes.length > 0) {
      publicPayload.notes = [...(publicPayload.notes ?? []), ...anonNotes];
    }
    // See `by-id` route for rationale: backfill `author` from the
    // creator's GitHub display name (cached 24h), falling back to the
    // login if the user hasn't set a name, so the panel's brief always
    // has something to show for `From:`.
    if (!publicPayload.author && entry.createdBy?.githubLogin) {
      const login = entry.createdBy.githubLogin;
      const displayName = await getGitHubDisplayName(login);
      publicPayload.author = displayName ?? login;
    }

    return NextResponse.json({
      entry,
      payload: publicPayload,
      allowAnonNotes: stored.allowAnonNotes ?? false,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to retrieve trail');
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
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    // Author or repo admin may delete. `canAdmin` rides on the per-user
    // access check above (GitHub `permissions.admin`), so org admins — not
    // just the literal `{owner}` user — can moderate trails they didn't author.
    const isAuthor = String(entry.createdBy.githubId) === String(userId);
    if (!isAuthor && !access.canAdmin) {
      return NextResponse.json(
        {
          error: 'Only the creator or a repo admin can delete this trail',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    await deletePayload(owner, repo, id);
    await deleteIdPointer(id);
    await updateIndex(owner, repo, (data) => ({
      ...data,
      entries: data.entries.filter((e) => e.id !== id),
      repoVisibility: access.private ? 'private' : 'public',
      repoVisibilityCheckedAt: new Date().toISOString(),
    }));
    await removeTrailFromUserIndex(entry.createdBy.githubId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete trail');
  }
}
