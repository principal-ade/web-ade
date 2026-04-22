/**
 * Starred Collections API - Remove Repo from Collection
 *
 * DELETE - Remove a repository from a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import { findCollection } from '@/lib/starred-collections/find-collection';

/**
 * DELETE /api/starred-collections/[id]/repos/[owner]/[repo]
 *
 * Remove a repository from a collection (user or org)
 *
 * Response: 204 No Content
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; owner: string; repo: string }> }
) {
  try {
    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userIdStr = String(userId);
    const { id, owner, repo } = await params;

    // Find collection across user/org storage
    const result = await findCollection(id, userIdStr, githubToken);

    if (!result) {
      throw new CollectionError(
        'Collection not found',
        404,
        ErrorCodes.NOT_FOUND
      );
    }

    // Update collection in appropriate storage
    await updateCollections(result.ownerType, result.ownerId, (data) => {
      // Find collection
      const collection = data.collections.find(c => c.id === id);

      if (!collection) {
        throw new CollectionError(
          'Collection not found',
          404,
          ErrorCodes.NOT_FOUND
        );
      }

      // Find repo index
      const repoIndex = collection.repos.findIndex(
        r =>
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
      );

      if (repoIndex === -1) {
        throw new CollectionError(
          'Repository not found in collection',
          404,
          ErrorCodes.REPO_NOT_FOUND_IN_COLLECTION
        );
      }

      // Remove repo
      collection.repos.splice(repoIndex, 1);
      collection.updatedAt = new Date().toISOString();

      return data;
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Remove repo from collection error:', error);
    return NextResponse.json(
      { error: 'Failed to remove repository from collection' },
      { status: 500 }
    );
  }
}
