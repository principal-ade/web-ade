/**
 * Starred Collections API - Reorder Repos in Collection
 *
 * PATCH - Reorder repositories within a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import { validateReorderReposRequest } from '@/lib/starred-collections/validation';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import type {
  CollectionRepo,
  ReorderReposRequest,
} from '@/lib/starred-collections/types';

/**
 * PATCH /api/starred-collections/[id]/repos/reorder
 *
 * Reorder repositories within a collection
 * Array order in the request body becomes the new display order
 *
 * Request Body: { repos: Array<{ owner: string, repo: string }> }
 * Response: { repos: CollectionRepo[] }
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
    const body = (await request.json()) as ReorderReposRequest;

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
      validateReorderReposRequest(collection, body);

      // Build a map of existing repos for O(1) lookup (case-insensitive)
      const repoMap = new Map<string, CollectionRepo>();
      collection.repos.forEach((r) => {
        const key = `${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`;
        repoMap.set(key, r);
      });

      // Create reordered array preserving full repo objects
      const reordered = body.repos.map(({ owner, repo }) => {
        const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
        return repoMap.get(key)!; // Validation ensures this exists
      });

      // Update collection
      collection.repos = reordered;
      collection.updatedAt = new Date().toISOString();

      return data;
    });

    // Return reordered repos
    const updatedCollection = updated.collections.find(c => c.id === id);

    return NextResponse.json({ repos: updatedCollection?.repos || [] });
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Reorder repos error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder repositories' },
      { status: 500 }
    );
  }
}
