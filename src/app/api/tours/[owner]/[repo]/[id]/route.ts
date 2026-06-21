import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import {
  deleteIdPointer,
  deletePayload,
  findIndexEntry,
  getIndex,
  removeTourFromUserIndex,
  updateIndex,
} from '@/lib/tours/s3-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';

interface Params {
  params: Promise<{ owner: string; repo: string; id: string }>;
}

/**
 * Delete a store-backed tour. Mirrors the trails DELETE gate
 * (`/api/trails/[owner]/[repo]/[id]`): requires a validated GitHub token + user
 * id, then allows the tour's author or a repo admin to remove it. The `id` is
 * the store key (TourListItem.store.id), not the tour's own `tourId`.
 */
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
        { error: 'Tour not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    // Author or repo admin may delete. `canAdmin` rides on the per-user access
    // check above (GitHub `permissions.admin`), so org admins — not just the
    // literal `{owner}` user — can moderate tours they didn't author.
    const isAuthor = String(entry.createdBy.githubId) === String(userId);
    if (!isAuthor && !access.canAdmin) {
      return NextResponse.json(
        {
          error: 'Only the creator or a repo admin can delete this tour',
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
    await removeTourFromUserIndex(entry.createdBy.githubId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Tours] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete tour' },
      { status: 500 }
    );
  }
}
