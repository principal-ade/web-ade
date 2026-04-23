/**
 * Starred Collections API - Repo within Collection
 *
 * PATCH  - Update repo fields (e.g. collection-scoped notes)
 * DELETE - Remove a repository from a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import type { UpdateCollectionRepoRequest } from '@/lib/starred-collections/types';
import { findCollection } from '@/lib/starred-collections/find-collection';
import { MAX_NOTE_LENGTH } from '@/lib/repo-notes/types';

/**
 * PATCH /api/starred-collections/[id]/repos/[owner]/[repo]
 *
 * Update a repo's collection-scoped fields.
 * Request Body: { notes?: string | null }
 * Response: CollectionRepo
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; owner: string; repo: string }> }
) {
  try {
    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userIdStr = String(userId);
    const { id, owner, repo } = await params;
    const body = (await request.json()) as UpdateCollectionRepoRequest;

    if (body.notes !== undefined && body.notes !== null) {
      if (typeof body.notes !== 'string') {
        return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
      }
      if (body.notes.length > MAX_NOTE_LENGTH) {
        return NextResponse.json(
          { error: `notes exceeds maximum length of ${MAX_NOTE_LENGTH} characters` },
          { status: 400 }
        );
      }
    }

    const result = await findCollection(id, userIdStr, githubToken);

    if (!result) {
      throw new CollectionError('Collection not found', 404, ErrorCodes.NOT_FOUND);
    }

    let updatedRepo: (typeof result.collection.repos)[number] | undefined;

    await updateCollections(result.ownerType, result.ownerId, (data) => {
      const collection = data.collections.find(c => c.id === id);

      if (!collection) {
        throw new CollectionError('Collection not found', 404, ErrorCodes.NOT_FOUND);
      }

      const repoEntry = collection.repos.find(
        r =>
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
      );

      if (!repoEntry) {
        throw new CollectionError(
          'Repository not found in collection',
          404,
          ErrorCodes.REPO_NOT_FOUND_IN_COLLECTION
        );
      }

      if (body.notes !== undefined) {
        repoEntry.notes = body.notes ?? undefined;
      }

      collection.updatedAt = new Date().toISOString();
      updatedRepo = repoEntry;

      return data;
    });

    return NextResponse.json(updatedRepo);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Update collection repo error:', error);
    return NextResponse.json({ error: 'Failed to update repository in collection' }, { status: 500 });
  }
}

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
