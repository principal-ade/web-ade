/**
 * Tour by id — repo-less share-link resolver.
 *
 * Reads the `tours/_by-id/{id}.json` pointer to find the owning {owner, repo},
 * then returns the stored tour payload + its index entry. This is what a
 * `/tour/{id}` share link and the CLI's `tour fetch <id>` consume. Access is
 * gated by GitHub read access to the owning repo, exactly like trails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/request';
import {
  findIndexEntry,
  getIdPointer,
  getIndex,
  getPayload,
} from '@/lib/tours/s3-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid tour id', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }

    const pointer = await getIdPointer(id);
    if (!pointer) {
      return NextResponse.json(
        { error: 'Tour not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    const { owner, repo } = pointer;
    validateOwnerRepo(owner, repo);

    const githubToken = await getGitHubToken();
    const access = await checkRepoAccess(owner, repo, githubToken ?? null);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 },
      );
    }

    const [payload, index] = await Promise.all([
      getPayload(owner, repo, id),
      getIndex(owner, repo),
    ]);

    const entry = findIndexEntry(index, id);

    // Pointer existed but payload/entry doesn't — pointer is stale.
    if (!payload || !entry) {
      return NextResponse.json(
        { error: 'Tour not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    return NextResponse.json({ owner, repo, entry, payload });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Tours] by-id error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve tour' },
      { status: 500 },
    );
  }
}
