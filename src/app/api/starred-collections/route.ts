/**
 * Starred Collections API - Main Route
 *
 * GET    - List all collections for authenticated user
 * POST   - Create a new collection
 * PATCH  - Reorder collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateCollections, getCollections } from '@/lib/starred-collections/s3-storage';
import {
  validateCreateCollectionRequest,
  validateReorderCollectionsRequest,
  checkCollectionsLimit,
  checkDuplicateCollectionName,
} from '@/lib/starred-collections/validation';
import {  validateCollectionIcon } from '@/lib/starred-collections/validation';
import { CollectionError } from '@/lib/starred-collections/types';
import { getUserOrgs, isOrgMember } from '@/lib/starred-collections/github-org';
import type {
  Collection,
  CreateCollectionRequest,
  ReorderCollectionsRequest,
  ListCollectionsResponse,
} from '@/lib/starred-collections/types';

/**
 * GET /api/starred-collections
 *
 * List all collections for the authenticated user (including org collections)
 *
 * Query Parameters:
 *   include_items (boolean, optional) - Include repos and users arrays. Default: true
 *
 * Response: { collections: Collection[], version: number }
 */
export async function GET(request: NextRequest) {
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

    // Get query parameter
    const { searchParams } = new URL(request.url);
    const includeItems = searchParams.get('include_items') !== 'false';

    // Get user's personal collections
    const userData = await getCollections('user', userIdStr);
    const userCollections = userData?.collections || [];

    // Get user's organizations
    const orgs = await getUserOrgs(githubToken);

    // Fetch collections from each org in parallel
    const orgCollectionsPromises = orgs.map(async (orgLogin) => {
      try {
        const orgData = await getCollections('org', orgLogin);
        return orgData?.collections || [];
      } catch (error) {
        console.error(`Failed to fetch collections for org ${orgLogin}:`, error);
        return [];
      }
    });

    const orgCollectionsArrays = await Promise.all(orgCollectionsPromises);
    const orgCollections = orgCollectionsArrays.flat();

    // Combine user + org collections
    let allCollections = [...userCollections, ...orgCollections];

    // Optionally strip repos/users arrays for performance
    if (!includeItems) {
      allCollections = allCollections.map(c => ({
        ...c,
        repos: [],
        users: [],
      }));
    }

    const response: ListCollectionsResponse = {
      collections: allCollections,
      version: userData?.version || 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('List collections error:', error);
    return NextResponse.json(
      { error: 'Failed to list collections' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/starred-collections
 *
 * Create a new collection (user or org)
 *
 * Request Body: { name: string, description?: string, icon?: string, orgLogin?: string }
 * Response: Collection
 */
export async function POST(request: NextRequest) {
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

    // Parse and validate request
    const body = (await request.json()) as CreateCollectionRequest;
    validateCreateCollectionRequest(body);

    // Determine owner type and ID
    let ownerType: 'user' | 'org' = 'user';
    let ownerId = userIdStr;

    if (body.orgLogin) {
      // Creating org collection - verify membership
      const isMember = await isOrgMember(body.orgLogin, githubToken);
      if (!isMember) {
        return NextResponse.json(
          { error: 'Not a member of this organization', code: 'NOT_ORG_MEMBER' },
          { status: 403 }
        );
      }
      ownerType = 'org';
      ownerId = body.orgLogin;
    }

    // Create new collection with owner information
    const newCollection: Collection = {
      id: Date.now().toString(), // Timestamp-based ID
      name: body.name.trim(),
      description: body.description?.trim(),
      icon: validateCollectionIcon(body.icon),
      ownerType,
      ownerLogin: ownerType === 'org' ? ownerId : undefined,
      repos: [],
      users: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Update collections data in appropriate storage
    const updated = await updateCollections(ownerType, ownerId, (data) => {
      // Check limits
      checkCollectionsLimit(data);

      // Check for duplicate name
      checkDuplicateCollectionName(data, newCollection.name);

      // Add new collection
      return {
        ...data,
        collections: [...data.collections, newCollection],
      };
    });

    // Return the newly created collection
    const created = updated.collections.find(c => c.id === newCollection.id);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Create collection error:', error);
    return NextResponse.json(
      { error: 'Failed to create collection' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/starred-collections
 *
 * Reorder user's personal collections (not org collections)
 *
 * Request Body: { collectionIds: string[] }
 * Response: { collections: Collection[], version: number }
 */
export async function PATCH(request: NextRequest) {
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

    // Parse and validate request
    const body = (await request.json()) as ReorderCollectionsRequest;

    // Update user's collections with reordered array
    const updated = await updateCollections('user', userIdStr, (data) => {
      // Validate reorder request
      validateReorderCollectionsRequest(data, body);

      // Build map of existing collections
      const collectionMap = new Map<string, Collection>();
      data.collections.forEach(c => collectionMap.set(c.id, c));

      // Create reordered array
      const reordered = body.collectionIds.map(id => collectionMap.get(id)!);

      return {
        ...data,
        collections: reordered,
      };
    });

    const response: ListCollectionsResponse = {
      collections: updated.collections,
      version: updated.version,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof CollectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Reorder collections error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder collections' },
      { status: 500 }
    );
  }
}
