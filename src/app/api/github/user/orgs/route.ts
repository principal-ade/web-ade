/**
 * GET /api/github/user/orgs
 *
 * Returns the authenticated user's organizations (lightweight, no repos).
 * Reads GitHub token from HTTP-only cookie.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

interface GitHubOrg {
  login: string;
  id: number;
  avatar_url: string;
  description: string | null;
}

export async function GET() {
  try {
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', isAuthenticated: false },
        { status: 401 }
      );
    }

    const headers = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };

    const orgsResponse = await fetch('https://api.github.com/user/orgs', { headers });

    if (!orgsResponse.ok) {
      if (orgsResponse.status === 401) {
        return NextResponse.json(
          { error: 'Invalid token', isAuthenticated: false },
          { status: 401 }
        );
      }
      throw new Error(`GitHub API error: ${orgsResponse.status}`);
    }

    const orgs: GitHubOrg[] = await orgsResponse.json();

    return NextResponse.json({
      isAuthenticated: true,
      organizations: orgs.map((org) => ({
        id: org.id,
        login: org.login,
        avatar_url: org.avatar_url,
        description: org.description,
      })),
    });
  } catch (error) {
    console.error('GitHub orgs error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch organizations',
        message: error instanceof Error ? error.message : 'Unknown error',
        isAuthenticated: true,
      },
      { status: 500 }
    );
  }
}
