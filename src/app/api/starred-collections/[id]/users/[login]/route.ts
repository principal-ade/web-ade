/**
 * Starred Collections API - Remove User from Collection
 *
 * DELETE - Remove a GitHub user from a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';

/**
 * DELETE /api/starred-collections/[id]/users/[login]
 *
 * Remove a GitHub user from a collection
 *
 * Response: 204 No Content
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; login: string }> }
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
    const { id, login } = await params;

    // Update collection
    await updateCollections(userIdStr, (data) => {
      // Find collection
      const collection = data.collections.find(c => c.id === id);

      if (!collection) {
        throw new CollectionError(
          'Collection not found',
          404,
          ErrorCodes.NOT_FOUND
        );
      }

      // Find user index
      const userIndex = collection.users.findIndex(
        u => u.login.toLowerCase() === login.toLowerCase()
      );

      if (userIndex === -1) {
        throw new CollectionError(
          'User not found in collection',
          404,
          ErrorCodes.USER_NOT_FOUND_IN_COLLECTION
        );
      }

      // Remove user
      collection.users.splice(userIndex, 1);
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

    console.error('Remove user from collection error:', error);
    return NextResponse.json(
      { error: 'Failed to remove user from collection' },
      { status: 500 }
    );
  }
}
