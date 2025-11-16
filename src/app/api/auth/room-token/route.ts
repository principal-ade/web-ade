/**
 * POST /api/auth/room-token
 *
 * Generates a JWT token for WebSocket authentication with the traffic controller.
 * This endpoint exchanges the GitHub token (from HTTP-only cookie) for a room token.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

const MESSAGING_SERVER_URL =
  process.env.MESSAGING_SERVER_URL ||
  'https://repository-traffic-controller-production.rj36caac972nm.us-east-1.cs.amazonlightsail.com';

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

    // Call the messaging server's room-token endpoint
    const response = await fetch(`${MESSAGING_SERVER_URL}/api/auth/room-token`, {
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
