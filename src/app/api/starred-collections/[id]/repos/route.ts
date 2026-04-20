/**
 * Starred Collections API - Add Repo to Collection
 *
 * POST - Add a repository to a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections } from '@/lib/starred-collections/s3-storage';
import {
  validateAddRepoRequest,
  checkReposLimit,
  checkDuplicateRepo,
} from '@/lib/starred-collections/validation';
import { fetchRepoMetadata } from '@/lib/starred-collections/github-metadata';
import { CollectionError, ErrorCodes } from '@/lib/starred-collections/types';
import type {
  CollectionRepo,
  AddRepoRequest,
} from '@/lib/starred-collections/types';

/**
 * POST /api/starred-collections/[id]/repos
 *
 * Add a repository to a collection
 *
 * Request Body: { owner: string, repo: string }
 * Response: CollectionRepo
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
    const body = (await request.json()) as AddRepoRequest;
    validateAddRepoRequest(body);

    // Fetch GitHub metadata (also validates repo exists)
    const metadata = await fetchRepoMetadata(
      body.owner,
      body.repo,
      userIdStr,
      githubToken
    );

    // Create new repo entry
    const newRepo: CollectionRepo = {
      owner: body.owner,
      repo: body.repo,
      addedAt: new Date().toISOString(),
      description: metadata.description || undefined,
      stargazersCount: metadata.stargazersCount,
      avatarUrl: metadata.avatarUrl,
    };

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

      // Check limits
      checkReposLimit(collection);

      // Check for duplicates
      checkDuplicateRepo(collection, body.owner, body.repo);

      // Add repo
      collection.repos.push(newRepo);
      collection.updatedAt = new Date().toISOString();

      return data;
    });

    // Return the added repo
    const updatedCollection = updated.collections.find(c => c.id === id);
    const addedRepo = updatedCollection?.repos.find(
      r => r.owner.toLowerCase() === body.owner.toLowerCase() &&
           r.repo.toLowerCase() === body.repo.toLowerCase()
    );

    return NextResponse.json(addedRepo);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Add repo to collection error:', error);
    return NextResponse.json(
      { error: 'Failed to add repository to collection' },
      { status: 500 }
    );
  }
}
