/**
 * GET /api/auth/me
 *
 * Returns current authenticated user information.
 * Reads the GitHub token from an HTTP-only cookie and fetches the GitHub
 * profile. If the token is invalid, responds with `needsSync` so the client can
 * re-establish it from its WorkOS session via /api/auth/bootstrap.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import { trace } from '@opentelemetry/api';

export async function GET() {
  // Get the active span (created by Next.js auto-instrumentation)
  const span = trace.getActiveSpan();

  try {
    // Get GitHub token from HTTP-only cookie
    const githubToken = await getGitHubToken();

    span?.addEvent('auth.me.get_token', {
      has_token: !!githubToken,
    });

    if (!githubToken) {
      span?.addEvent('auth.me.unauthenticated', {
        reason: 'no_token',
      });

      return NextResponse.json({ isAuthenticated: false, user: null });
    }

    // Fetch user profile from GitHub API
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    span?.addEvent('auth.me.fetch_github', {
      'response.status': response.status,
    });

    // Invalid/expired GitHub token: signal the client to re-establish it from
    // its WorkOS session via /api/auth/bootstrap. We no longer sync the token
    // from token/current here — that endpoint requires a verified WorkOS
    // credential, which this browser route does not hold.
    if (response.status === 401) {
      span?.addEvent('auth.me.unauthenticated', {
        reason: 'invalid_token',
      });

      return NextResponse.json({ isAuthenticated: false, user: null, needsSync: true });
    }

    if (!response.ok) {
      console.error('GitHub API error:', response.status, response.statusText);
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = await response.json();

    // Return user data (no tokens!)
    span?.addEvent('auth.me.success', {
      'user.login': userData.login,
      'user.id': userData.id,
    });

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

    span?.addEvent('auth.me.error', {
      'error.type': error instanceof Error ? error.name : 'Unknown',
      'error.message': error instanceof Error ? error.message : 'Unknown error',
    });

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
