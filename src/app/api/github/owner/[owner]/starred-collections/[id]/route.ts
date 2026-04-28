/**
 * GET /api/github/owner/[owner]/starred-collections/[id]
 *
 * Returns a single starred collection by ID, owned by the given GitHub user
 * or organization. Public endpoint - no authentication required.
 *
 * Response: Collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import { getCollections } from '@/lib/starred-collections/s3-storage';

interface GitHubUserLookup {
  login: string;
  id: number;
  type: 'User' | 'Organization';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; id: string }> }
) {
  try {
    const { owner, id } = await params;
    const githubToken = await getGitHubToken();

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const userResponse = await fetch(`https://api.github.com/users/${owner}`, {
      headers,
    });

    if (!userResponse.ok) {
      if (userResponse.status === 404) {
        return NextResponse.json(
          { error: `User or organization "${owner}" not found` },
          { status: 404 }
        );
      }
      console.error(
        `[API /github/owner/${owner}/starred-collections/${id}] GitHub API error: ${userResponse.status}`
      );
      return NextResponse.json(
        { error: 'Failed to resolve GitHub user' },
        { status: 502 }
      );
    }

    const userData: GitHubUserLookup = await userResponse.json();

    const ownerType: 'user' | 'org' =
      userData.type === 'Organization' ? 'org' : 'user';
    const ownerId = ownerType === 'org' ? userData.login : String(userData.id);

    const data = await getCollections(ownerType, ownerId);
    const collection = data?.collections.find((c) => c.id === id);

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(collection);
  } catch (error) {
    console.error('[starred-collections by-owner/id] error:', error);
    return NextResponse.json(
      { error: 'Failed to load collection' },
      { status: 500 }
    );
  }
}
