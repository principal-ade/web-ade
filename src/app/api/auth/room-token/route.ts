/**
 * POST /api/auth/room-token
 *
 * Generates a JWT token for WebSocket authentication with the traffic controller.
 * This endpoint exchanges the GitHub token (from HTTP-only cookie) for a room token.
 *
 * Uses the landing page's browser-specific room-token endpoint which handles
 * browser session authentication without requiring a persistent device ID.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

// Landing page auth server URL (handles browser auth)
const AUTH_SERVER_URL =
  process.env.LANDING_PAGE_URL || 'https://principal-ade.com';

export async function POST(request: Request) {
  try {
    // Get GitHub token from HTTP-only cookie
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { repository, branch } = body;

    if (!repository) {
      return NextResponse.json(
        { error: 'repository is required' },
        { status: 400 }
      );
    }

    // Call the landing page's browser room-token endpoint
    const response = await fetch(`${AUTH_SERVER_URL}/api/auth/browser/room-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repository,
        branch: branch || 'main',
        github_token: githubToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Room token error:', errorData);
      return NextResponse.json(
        { error: errorData.error || 'Failed to get room token' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return the JWT token that can be used for WebSocket auth
    return NextResponse.json({
      access_token: data.access_token,
      permissions: data.permissions,
      repository: data.repository,
      branch: data.branch,
    });
  } catch (error) {
    console.error('Room token error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get room token',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
