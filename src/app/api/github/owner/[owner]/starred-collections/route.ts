/**
 * GET /api/github/owner/[owner]/starred-collections
 *
 * Returns starred collections owned by a specific GitHub user or organization.
 * Public endpoint - no authentication required. All starred collections are
 * publicly visible.
 *
 * Query Parameters:
 *   include_items (boolean, optional) - Include repos and users arrays. Default: true
 *
 * Response: { owner: {...}, collections: Collection[], version: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import { getCollections } from '@/lib/starred-collections/s3-storage';
import type { Collection } from '@/lib/starred-collections/types';

interface GitHubUserLookup {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  type: 'User' | 'Organization';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string }> }
) {
  try {
    const { owner } = await params;
    const githubToken = await getGitHubToken();

    const { searchParams } = new URL(request.url);
    const includeItems = searchParams.get('include_items') !== 'false';

    // Resolve login → GitHub user (need id and type to pick the S3 key)
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
        `[API /github/owner/${owner}/starred-collections] GitHub API error: ${userResponse.status}`
      );
      return NextResponse.json(
        { error: 'Failed to resolve GitHub user' },
        { status: 502 }
      );
    }

    const userData: GitHubUserLookup = await userResponse.json();

    // Pick storage key based on account type
    const ownerType: 'user' | 'org' =
      userData.type === 'Organization' ? 'org' : 'user';
    const ownerId = ownerType === 'org' ? userData.login : String(userData.id);

    const data = await getCollections(ownerType, ownerId);

    let collections: Collection[] = data?.collections ?? [];
    if (!includeItems) {
      collections = collections.map((c) => ({
        ...c,
        repos: [],
        users: [],
      }));
    }

    return NextResponse.json({
      owner: {
        login: userData.login,
        id: userData.id,
        avatar_url: userData.avatar_url,
        name: userData.name,
        type: userData.type,
      },
      collections,
      version: data?.version ?? 0,
    });
  } catch (error) {
    console.error('[starred-collections by-owner] error:', error);
    return NextResponse.json(
      { error: 'Failed to list collections' },
      { status: 500 }
    );
  }
}
