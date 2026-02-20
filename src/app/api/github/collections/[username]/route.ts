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
} from '@principal-ai/alexandria-collections';

const REPO_NAME = 'web-ade-collections';
const COLLECTIONS_DIR = 'collections';

interface CollectionFile {
  version: string;
  collection: Collection;
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

    // Fetch user info first
    const userResponse = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        }),
      },
    });

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

    // List files in collections directory
    const dirResponse = await fetch(
      `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${COLLECTIONS_DIR}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
      }
    );

    // Check if collections directory exists
    if (dirResponse.status === 404) {
      return NextResponse.json({
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
          bio: user.bio,
          html_url: user.html_url,
        },
        exists: false,
        collections: [],
        repoUrl: null,
      });
    }

    if (!dirResponse.ok) {
      throw new Error(`Failed to fetch collections directory: ${dirResponse.status}`);
    }

    const files = await dirResponse.json();
    const collectionFiles = files.filter((f: { type: string; name: string }) =>
      f.type === 'file' && f.name.endsWith('.json')
    );

    // Fetch all collection files in parallel
    const collectionPromises = collectionFiles.map(async (file: { name: string }) => {
      const response = await fetch(
        `https://raw.githubusercontent.com/${username}/${REPO_NAME}/main/${COLLECTIONS_DIR}/${file.name}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) {
        console.warn(`Failed to fetch ${file.name}: ${response.status}`);
        return null;
      }

      try {
        const data: CollectionFile = await response.json();
        return data.collection;
      } catch {
        console.warn(`Failed to parse ${file.name}`);
        return null;
      }
    });

    const collectionsResults = await Promise.all(collectionPromises);
    const collections = collectionsResults.filter((c): c is Collection => c !== null);

    return NextResponse.json({
      user: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        html_url: user.html_url,
      },
      exists: true,
      collections,
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

    // Save each collection as a separate file
    const timestamp = new Date().toISOString();

    const updatePromises = collections.map(async (collection) => {
      const filename = `${COLLECTIONS_DIR}/${collection.id}.json`;

      // Get current file SHA (if exists)
      const fileResponse = await fetch(
        `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${filename}`,
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
      }

      // Prepare collection file
      const collectionFile: CollectionFile = {
        version: '1.0',
        collection,
      };

      const content = Buffer.from(
        JSON.stringify(collectionFile, null, 2)
      ).toString('base64');

      const updateBody: Record<string, unknown> = {
        message: `Update ${collection.id} - ${timestamp}`,
        content,
      };

      if (sha) {
        updateBody.sha = sha;
      }

      // Update the file
      const updateResponse = await fetch(
        `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${filename}`,
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
        throw new Error(errorData.message || `Failed to update ${collection.id}`);
      }

      return { success: true, id: collection.id };
    });

    const results = await Promise.all(updatePromises);

    return NextResponse.json({ success: true, updated: results.length });
  } catch (error) {
    console.error('GitHub collections PUT error:', error);

    if (error instanceof Error && error.message.includes('permission')) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this collection' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update collections' },
      { status: 500 }
    );
  }
}
