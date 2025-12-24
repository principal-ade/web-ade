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
import type {
  Collection,
  CollectionMembership,
  CollectionsData,
  CollectionMembershipsData,
} from '@principal-ai/alexandria-collections';

const REPO_NAME = 'web-ade-collections';
const COLLECTIONS_FILE = 'collections.json';
const MEMBERSHIPS_FILE = 'collection-memberships.json';

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
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
      }),
      fetch(
        `https://raw.githubusercontent.com/${username}/${REPO_NAME}/main/${COLLECTIONS_FILE}`,
        { headers: { Accept: 'application/json' } }
      ),
      fetch(
        `https://raw.githubusercontent.com/${username}/${REPO_NAME}/main/${MEMBERSHIPS_FILE}`,
        { headers: { Accept: 'application/json' } }
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
          memberships: null,
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

    // Parse memberships
    let memberships: CollectionMembership[] = [];
    if (membershipsResponse.ok) {
      try {
        const membershipsData: CollectionMembershipsData = await membershipsResponse.json();
        memberships = membershipsData.memberships || [];
      } catch {
        // Ignore parse errors for memberships
      }
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
      collections: collectionsData.collections || [],
      memberships,
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
 * Updates collections and memberships for a specific user/org.
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
    const memberships: CollectionMembership[] = body.memberships || [];

    // Get current file SHAs (needed for updates)
    const [collectionsFileResponse, membershipsFileResponse] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${COLLECTIONS_FILE}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      ),
      fetch(
        `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${MEMBERSHIPS_FILE}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      ),
    ]);

    let collectionsSha: string | undefined;
    let membershipsSha: string | undefined;

    if (collectionsFileResponse.ok) {
      const fileData = await collectionsFileResponse.json();
      collectionsSha = fileData.sha;
    } else if (collectionsFileResponse.status !== 404) {
      return NextResponse.json(
        { error: 'Failed to access collections file' },
        { status: collectionsFileResponse.status }
      );
    }

    if (membershipsFileResponse.ok) {
      const fileData = await membershipsFileResponse.json();
      membershipsSha = fileData.sha;
    }

    // Prepare data
    const collectionsData: CollectionsData = {
      version: '1.0',
      collections,
    };

    const membershipsData: CollectionMembershipsData = {
      version: '1.0',
      memberships,
    };

    const collectionsContent = Buffer.from(
      JSON.stringify(collectionsData, null, 2)
    ).toString('base64');

    const membershipsContent = Buffer.from(
      JSON.stringify(membershipsData, null, 2)
    ).toString('base64');

    // Update both files
    const timestamp = new Date().toISOString();

    const collectionsUpdateBody: Record<string, unknown> = {
      message: `Update collections - ${timestamp}`,
      content: collectionsContent,
    };
    if (collectionsSha) {
      collectionsUpdateBody.sha = collectionsSha;
    }

    const membershipsUpdateBody: Record<string, unknown> = {
      message: `Update memberships - ${timestamp}`,
      content: membershipsContent,
    };
    if (membershipsSha) {
      membershipsUpdateBody.sha = membershipsSha;
    }

    const [collectionsUpdateResponse, membershipsUpdateResponse] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${COLLECTIONS_FILE}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(collectionsUpdateBody),
        }
      ),
      fetch(
        `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${MEMBERSHIPS_FILE}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(membershipsUpdateBody),
        }
      ),
    ]);

    if (!collectionsUpdateResponse.ok) {
      const errorData = await collectionsUpdateResponse.json();
      if (collectionsUpdateResponse.status === 403 || collectionsUpdateResponse.status === 404) {
        return NextResponse.json(
          { error: 'You do not have permission to edit this collection' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: errorData.message || 'Failed to update collections' },
        { status: collectionsUpdateResponse.status }
      );
    }

    if (!membershipsUpdateResponse.ok) {
      const errorData = await membershipsUpdateResponse.json();
      return NextResponse.json(
        { error: errorData.message || 'Failed to update memberships' },
        { status: membershipsUpdateResponse.status }
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
