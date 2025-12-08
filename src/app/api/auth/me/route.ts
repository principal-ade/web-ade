/**
 * GET /api/auth/me
 *
 * Returns current authenticated user information.
 * Reads GitHub token from HTTP-only cookie and fetches user profile.
 * If token is invalid, attempts to sync from central token store.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/cookies';

/**
 * Sync token from auth server's central token store
 */
async function syncTokenFromServer(
  githubUserId: number,
  currentToken: string
): Promise<string | null> {
  try {
    const authServerUrl = process.env.AUTH_SERVER_URL;
    if (!authServerUrl) {
      console.log('[Auth/me] AUTH_SERVER_URL not configured, skipping sync');
      return null;
    }

    const url = new URL(`${authServerUrl}/api/auth/token/current`);
    url.searchParams.set('github_user_id', String(githubUserId));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log('[Auth/me] Failed to sync token from server:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.github_token && data.github_token !== currentToken) {
      console.log('[Auth/me] Got newer token from server');
      return data.github_token;
    }

    return null;
  } catch (error) {
    console.error('[Auth/me] Error syncing token:', error);
    return null;
  }
}

export async function GET() {
  try {
    // Get GitHub token from HTTP-only cookie
    let githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', isAuthenticated: false },
        { status: 401 }
      );
    }

    // Fetch user profile from GitHub API
    let response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    // If token is invalid, try to sync from central token store
    if (!response.ok && response.status === 401) {
      console.log('[Auth/me] Token invalid, attempting to sync from server...');

      // Get stored GitHub user ID to fetch the new token
      const storedUserId = await getGitHubUserId();
      if (storedUserId) {
        // Try to fetch the current valid token from the server
        const syncedToken = await syncTokenFromServer(storedUserId, githubToken);
        if (syncedToken) {
          console.log('[Auth/me] Successfully synced new token from server');

          // Update the cookie with the new token
          const cookieStore = await cookies();
          cookieStore.set('github_token', syncedToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60, // 1 hour
          });

          // Retry the GitHub API call with the new token
          response = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${syncedToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          if (response.ok) {
            githubToken = syncedToken;
            // Continue to userData parsing below
          }
        }
      }

      // If we still don't have a valid response, return 401
      if (!response.ok) {
        console.error('GitHub API error after sync attempt:', response.status, response.statusText);
        return NextResponse.json(
          { error: 'Invalid token', isAuthenticated: false, needsSync: true },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      console.error('GitHub API error:', response.status, response.statusText);
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = await response.json();

    // Now that we have the user ID, sync from server to ensure we have the latest token
    const syncedToken = await syncTokenFromServer(userData.id, githubToken);
    if (syncedToken) {
      // Update the cookie with the new token
      const cookieStore = await cookies();
      cookieStore.set('github_token', syncedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60, // 1 hour
      });
      githubToken = syncedToken;
    }

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
