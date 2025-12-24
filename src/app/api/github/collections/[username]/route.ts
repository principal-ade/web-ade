/**
 * GET /api/github/collections/[username]
 * Fetches a user's public collections from their web-ade-collections repo.
 * No authentication required since the repo is public.
 *
 * PUT /api/github/collections/[username]
 * Updates a user/org's collections. Requires write access to the repo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

const REPO_NAME = 'web-ade-collections';
const COLLECTIONS_FILE = 'collections.json';
const MEMBERSHIPS_FILE = 'collection-memberships.json';

interface CollectionMembership {
  repositoryId: string;
  collectionId: string;
  addedAt: number;
  metadata?: Record<string, unknown>;
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  repositories: string[];
  createdAt: number;
  updatedAt: number;
}

interface CollectionsData {
  version: number;
  collections: Collection[];
  updatedAt: number;
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Fetch user info, collections, and memberships in parallel
    const [userResponse, collectionsResponse, membershipsResponse] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          // Use token if available for higher rate limits
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
      }),
      fetch(
        `https://raw.githubusercontent.com/${username}/${REPO_NAME}/main/${COLLECTIONS_FILE}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      ),
      fetch(
        `https://raw.githubusercontent.com/${username}/${REPO_NAME}/main/${MEMBERSHIPS_FILE}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      ),
    ]);

    // Check if user exists
    if (!userResponse.ok) {
      if (userResponse.status === 404) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
      throw new Error(`Failed to fetch user: ${userResponse.status}`);
    }

    const user: GitHubUser = await userResponse.json();

    // Check if collections repo exists
    if (!collectionsResponse.ok) {
      if (collectionsResponse.status === 404) {
        return NextResponse.json({
          user: {
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            bio: user.bio,
            html_url: user.html_url,
          },
          exists: false,
          collections: null,
          repoUrl: null,
        });
      }
      throw new Error(`Failed to fetch collections: ${collectionsResponse.status}`);
    }

    // Parse collections
    let collectionsData: CollectionsData;
    try {
      collectionsData = await collectionsResponse.json();
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse collections data' },
        { status: 500 }
      );
    }

    // Parse memberships (optional - only exists for curated format)
    let memberships: CollectionMembership[] = [];
    if (membershipsResponse.ok) {
      try {
        const membershipsData = await membershipsResponse.json();
        memberships = membershipsData.memberships || [];
      } catch {
        // Ignore parse errors for memberships
      }
    }

    // Merge memberships into collections if collections don't have repositories
    // This handles the old format (separate memberships file)
    if (collectionsData.collections && memberships.length > 0) {
      collectionsData.collections = collectionsData.collections.map(col => {
        // If collection already has repositories array, keep it
        if (col.repositories && col.repositories.length > 0) {
          return col;
        }
        // Otherwise, merge from memberships
        const colMemberships = memberships.filter(m => m.collectionId === col.id);
        return {
          ...col,
          repositories: colMemberships.map(m => m.repositoryId),
        };
      });
    }

    // Ensure all collections have repositories array (even if empty)
    if (collectionsData.collections) {
      collectionsData.collections = collectionsData.collections.map(col => ({
        ...col,
        repositories: col.repositories || [],
      }));
    }

    return NextResponse.json({
      user: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        html_url: user.html_url,
      },
      exists: true,
      collections: collectionsData,
      repoUrl: `https://github.com/${username}/${REPO_NAME}`,
    });
  } catch (error) {
    console.error('GitHub collections fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/github/collections/[username]
 *
 * Updates collections for a specific user/org.
 * Requires the authenticated user to have write access to the repo.
 */
export async function PUT(
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

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const collections: Collection[] = body.collections || [];

    // Get current file SHA (needed for update)
    const fileResponse = await fetch(
      `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${COLLECTIONS_FILE}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    let sha: string | undefined;
    if (fileResponse.ok) {
      const fileData = await fileResponse.json();
      sha = fileData.sha;
    } else if (fileResponse.status !== 404) {
      return NextResponse.json(
        { error: 'Failed to access collections file' },
        { status: fileResponse.status }
      );
    }

    // Prepare collections data
    const collectionsData: CollectionsData = {
      version: 1,
      collections,
      updatedAt: Date.now(),
    };

    const content = Buffer.from(JSON.stringify(collectionsData, null, 2)).toString('base64');

    // Update/create the file
    const updateBody: Record<string, unknown> = {
      message: `Update collections - ${new Date().toISOString()}`,
      content,
    };

    if (sha) {
      updateBody.sha = sha;
    }

    const updateResponse = await fetch(
      `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${COLLECTIONS_FILE}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateBody),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();

      // Check for permission error
      if (updateResponse.status === 403 || updateResponse.status === 404) {
        return NextResponse.json(
          { error: 'You do not have permission to edit this collection' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: errorData.message || 'Failed to update collections' },
        { status: updateResponse.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('GitHub collections PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update collections' },
      { status: 500 }
    );
  }
}
