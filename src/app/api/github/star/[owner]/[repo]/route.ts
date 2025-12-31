/**
 * Star/Unstar Repository API
 *
 * GET /api/github/star/[owner]/[repo] - Check if repo is starred
 * PUT /api/github/star/[owner]/[repo] - Star the repo
 * DELETE /api/github/star/[owner]/[repo] - Unstar the repo
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

interface RouteParams {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

/**
 * Check if the authenticated user has starred the repository
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', starred: false },
        { status: 401 }
      );
    }

    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    // 204 = starred, 404 = not starred
    return NextResponse.json({ starred: response.status === 204 });
  } catch (error) {
    console.error('Error checking star status:', error);
    return NextResponse.json(
      { error: 'Failed to check star status', starred: false },
      { status: 500 }
    );
  }
}

/**
 * Star the repository
 */
export async function PUT(_request: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Length': '0',
        },
      }
    );

    if (response.status === 204) {
      return NextResponse.json({ starred: true, success: true });
    }

    return NextResponse.json(
      { error: 'Failed to star repository', starred: false },
      { status: response.status }
    );
  } catch (error) {
    console.error('Error starring repository:', error);
    return NextResponse.json(
      { error: 'Failed to star repository' },
      { status: 500 }
    );
  }
}

/**
 * Unstar the repository
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 204) {
      return NextResponse.json({ starred: false, success: true });
    }

    return NextResponse.json(
      { error: 'Failed to unstar repository', starred: true },
      { status: response.status }
    );
  } catch (error) {
    console.error('Error unstarring repository:', error);
    return NextResponse.json(
      { error: 'Failed to unstar repository' },
      { status: 500 }
    );
  }
}
