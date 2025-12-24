/**
 * GET /api/github/collections/[username]
 *
 * Fetches a user's public collections from their web-ade-collections repo.
 * No authentication required since the repo is public.
 */

import { NextRequest, NextResponse } from 'next/server';

const REPO_NAME = 'web-ade-collections';
const COLLECTIONS_FILE = 'collections.json';

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

    // Fetch user info and collections in parallel
    const [userResponse, collectionsResponse] = await Promise.all([
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
