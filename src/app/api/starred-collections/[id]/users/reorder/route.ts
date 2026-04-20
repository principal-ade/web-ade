/**
 * Starred Collections API - Reorder Users in Collection
 *
 * PATCH - Reorder users within a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import { validateReorderUsersRequest } from '@/lib/starred-collections/validation';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import type {
  CollectionUser,
  ReorderUsersRequest,
} from '@/lib/starred-collections/types';

/**
 * PATCH /api/starred-collections/[id]/users/reorder
 *
 * Reorder users within a collection
 * Array order in the request body becomes the new display order
 *
 * Request Body: { users: Array<{ login: string }> }
 * Response: { users: CollectionUser[] }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const { id } = await params;

    // Parse request
    const body = (await request.json()) as ReorderUsersRequest;

    // Update collection
    const updated = await updateCollections(userIdStr, (data) => {
      // Find collection
      const collection = data.collections.find(c => c.id === id);

      if (!collection) {
        throw new CollectionError(
          'Collection not found',
          404,
          ErrorCodes.NOT_FOUND
        );
      }

      // Validate reorder request
      validateReorderUsersRequest(collection, body);

      // Build a map of existing users for O(1) lookup (case-insensitive)
      const userMap = new Map<string, CollectionUser>();
      collection.users.forEach((u) => {
        const key = u.login.toLowerCase();
        userMap.set(key, u);
      });

      // Create reordered array preserving full user objects
      const reordered = body.users.map(({ login }) => {
        const key = login.toLowerCase();
        return userMap.get(key)!; // Validation ensures this exists
      });

      // Update collection
      collection.users = reordered;
      collection.updatedAt = new Date().toISOString();

      return data;
    });

    // Return reordered users
    const updatedCollection = updated.collections.find(c => c.id === id);

    return NextResponse.json({ users: updatedCollection?.users || [] });
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Reorder users error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder users' },
      { status: 500 }
    );
  }
}
