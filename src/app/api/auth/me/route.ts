/**
 * GET /api/auth/me
 *
 * Returns current authenticated user information.
 * Reads GitHub token from HTTP-only cookie and fetches user profile.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

export async function GET() {
  try {
    // Get GitHub token from HTTP-only cookie
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', isAuthenticated: false },
        { status: 401 }
      );
    }

    // Fetch user profile from GitHub API
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.error('GitHub API error:', response.status, response.statusText);

      // If token is invalid, return 401
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid token', isAuthenticated: false },
          { status: 401 }
        );
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = await response.json();

    // Return user data (no tokens!)
    return NextResponse.json({
      isAuthenticated: true,
      user: {
        login: userData.login,
        email: userData.email,
        name: userData.name,
        id: userData.id,
        avatar_url: userData.avatar_url,
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch user',
        message: error instanceof Error ? error.message : 'Unknown error',
        isAuthenticated: false,
      },
      { status: 500 }
    );
  }
}
