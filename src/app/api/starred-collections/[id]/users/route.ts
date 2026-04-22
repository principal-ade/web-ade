/**
 * Starred Collections API - Add User to Collection
 *
 * POST - Add a GitHub user to a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import {
  validateAddUserRequest,
  checkUsersLimit,
  checkDuplicateUser,
} from '@/lib/starred-collections/validation';
import { fetchUserMetadata } from '@/lib/starred-collections/github-metadata';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import { findCollection } from '@/lib/starred-collections/find-collection';
import type {
  CollectionUser,
  AddUserRequest,
} from '@/lib/starred-collections/types';

/**
 * POST /api/starred-collections/[id]/users
 *
 * Add a GitHub user to a collection (user or org)
 *
 * Request Body: { login: string }
 * Response: CollectionUser
 */
export async function POST(
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

    // Parse and validate request
    const body = (await request.json()) as AddUserRequest;
    validateAddUserRequest(body);

    // Find collection across user/org storage
    const result = await findCollection(id, userIdStr, githubToken);

    if (!result) {
      throw new CollectionError(
        'Collection not found',
        404,
        ErrorCodes.NOT_FOUND
      );
    }

    // Fetch GitHub metadata (also validates user exists)
    const metadata = await fetchUserMetadata(
      body.login,
      result.ownerType,
      result.ownerId,
      githubToken
    );

    // Create new user entry
    const newUser: CollectionUser = {
      login: body.login,
      addedAt: new Date().toISOString(),
      avatarUrl: metadata.avatarUrl,
      name: metadata.name || undefined,
    };

    // Update collection in appropriate storage
    const updated = await updateCollections(result.ownerType, result.ownerId, (data) => {
      // Find collection
      const collection = data.collections.find(c => c.id === id);

      if (!collection) {
        throw new CollectionError(
          'Collection not found',
          404,
          ErrorCodes.NOT_FOUND
        );
      }

      // Check limits
      checkUsersLimit(collection);

      // Check for duplicates
      checkDuplicateUser(collection, body.login);

      // Add user
      collection.users.push(newUser);
      collection.updatedAt = new Date().toISOString();

      return data;
    });

    // Return the added user
    const updatedCollection = updated.collections.find(c => c.id === id);
    const addedUser = updatedCollection?.users.find(
      u => u.login.toLowerCase() === body.login.toLowerCase()
    );

    return NextResponse.json(addedUser);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Add user to collection error:', error);
    return NextResponse.json(
      { error: 'Failed to add user to collection' },
      { status: 500 }
    );
  }
}
