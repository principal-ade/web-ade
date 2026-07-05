/**
 * Starred Collections API - Single Collection Route
 *
 * GET    - Get a single collection by ID
 * PATCH  - Update collection metadata (name, description, icon)
 * DELETE - Delete a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import {
  validateUpdateCollectionRequest,
  checkDuplicateCollectionName,
} from '@/lib/starred-collections/validation';
import { validateCollectionIcon, validateCollectionVisibility } from '@/lib/starred-collections/validation';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import { findCollection } from '@/lib/starred-collections/find-collection';
import type {
  UpdateCollectionRequest,
} from '@/lib/starred-collections/types';

/**
 * GET /api/starred-collections/[id]
 *
 * Get a single collection by ID (user or org)
 *
 * Response: Collection
 */
export async function GET(
  _request: NextRequest,
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

    // Find collection across user/org storage
    const result = await findCollection(id, userIdStr, githubToken);

    if (!result) {
      throw new CollectionError(
        'Collection not found',
        404,
        ErrorCodes.NOT_FOUND
      );
    }

    return NextResponse.json(result.collection);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Get collection error:', error);
    return NextResponse.json(
      { error: 'Failed to get collection' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/starred-collections/[id]
 *
 * Update collection metadata (name, description, icon)
 *
 * Request Body: { name?: string, description?: string, icon?: string }
 * Response: Collection
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

    // Parse and validate request
    const body = (await request.json()) as UpdateCollectionRequest;
    validateUpdateCollectionRequest(body);

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

      // Check for duplicate name if name is being changed
      if (body.name && body.name.trim() !== collection.name) {
        checkDuplicateCollectionName(data, body.name, id);
      }

      // Apply updates
      if (body.name !== undefined) {
        collection.name = body.name.trim();
      }

      if (body.description !== undefined) {
        collection.description = body.description?.trim();
      }

      if (body.icon !== undefined) {
        collection.icon = validateCollectionIcon(body.icon);
      }

      if (body.visibility !== undefined) {
        collection.visibility = validateCollectionVisibility(body.visibility);
      }

      collection.updatedAt = new Date().toISOString();

      return data;
    });

    // Return updated collection
    const updatedCollection = updated.collections.find(c => c.id === id);

    return NextResponse.json(updatedCollection);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Update collection error:', error);
    return NextResponse.json(
      { error: 'Failed to update collection' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/starred-collections/[id]
 *
 * Delete a collection (user or org)
 *
 * Response: 204 No Content
 */
export async function DELETE(
  _request: NextRequest,
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

    // Find collection across user/org storage
    const result = await findCollection(id, userIdStr, githubToken);

    if (!result) {
      throw new CollectionError(
        'Collection not found',
        404,
        ErrorCodes.NOT_FOUND
      );
    }

    // Delete collection from appropriate storage
    await updateCollections(result.ownerType, result.ownerId, (data) => {
      // Find collection index
      const index = data.collections.findIndex(c => c.id === id);

      if (index === -1) {
        throw new CollectionError(
          'Collection not found',
          404,
          ErrorCodes.NOT_FOUND
        );
      }

      // Remove collection
      return {
        ...data,
        collections: data.collections.filter(c => c.id !== id),
      };
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Delete collection error:', error);
    return NextResponse.json(
      { error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}
