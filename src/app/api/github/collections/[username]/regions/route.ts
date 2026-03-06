/**
 * POST /api/github/collections/[username]/regions
 * Region management API for collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import { GitHubFileSystemAdapter } from '@/lib/server/GitHubFileSystemAdapter';
import {
  CollectionStorageAdapter,
  type CustomRegion,
  type RepositoryLayoutData,
} from '@principal-ai/alexandria-collections';
import { getRepoName, type CollectionVisibility } from '@/lib/collections/github-repo-manager';

interface RegionOperation {
  type: 'createRegion' | 'updateRegion' | 'deleteRegion' | 'assignRepository' | 'updatePosition' | 'batchInitialize';
  collectionId: string;
  regionId?: string;
  region?: Omit<CustomRegion, 'id'>;
  updates?: Partial<CustomRegion>;
  repositoryId?: string;
  layout?: RepositoryLayoutData;
  batchUpdates?: {
    regions?: CustomRegion[];
    assignments?: Array<{ repositoryId: string; regionId: string }>;
    positions?: Array<{ repositoryId: string; layout: RepositoryLayoutData }>;
  };
  visibility?: CollectionVisibility;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const operation: RegionOperation = await request.json();
    const visibility: CollectionVisibility = operation.visibility || 'public';
    const repoName = getRepoName(visibility);

    // Create adapter
    const adapter = new GitHubFileSystemAdapter(username, repoName, 'main', token);
    const storage = new CollectionStorageAdapter('/', adapter);

    let result;

    switch (operation.type) {
      case 'createRegion':
        if (!operation.region) {
          return NextResponse.json({ error: 'Region data required' }, { status: 400 });
        }
        result = await storage.createRegion(operation.collectionId, operation.region);
        break;

      case 'updateRegion':
        if (!operation.regionId || !operation.updates) {
          return NextResponse.json({ error: 'Region ID and updates required' }, { status: 400 });
        }
        await storage.updateRegion(operation.collectionId, operation.regionId, operation.updates);
        result = { success: true };
        break;

      case 'deleteRegion':
        if (!operation.regionId) {
          return NextResponse.json({ error: 'Region ID required' }, { status: 400 });
        }
        await storage.deleteRegion(operation.collectionId, operation.regionId);
        result = { success: true };
        break;

      case 'assignRepository':
        if (!operation.repositoryId || !operation.regionId) {
          return NextResponse.json({ error: 'Repository ID and region ID required' }, { status: 400 });
        }
        await storage.assignRepositoryToRegion(
          operation.collectionId,
          operation.repositoryId,
          operation.regionId
        );
        result = { success: true };
        break;

      case 'updatePosition':
        if (!operation.repositoryId || !operation.layout) {
          return NextResponse.json({ error: 'Repository ID and layout required' }, { status: 400 });
        }
        await storage.updateRepositoryPosition(
          operation.collectionId,
          operation.repositoryId,
          operation.layout
        );
        result = { success: true };
        break;

      case 'batchInitialize':
        if (!operation.batchUpdates) {
          return NextResponse.json({ error: 'Batch updates required' }, { status: 400 });
        }
        await storage.batchInitializeLayout(operation.collectionId, operation.batchUpdates);
        result = { success: true };
        break;

      default:
        return NextResponse.json({ error: 'Invalid operation type' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Region operation error:', error);

    if (error instanceof Error && error.message.includes('permission')) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this collection' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to perform region operation', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
