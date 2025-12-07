/**
 * POST /api/auth/refresh
 *
 * Refreshes expired access tokens using the refresh token.
 * Reads refresh_token from HTTP-only cookie and exchanges for new tokens.
 *
 * Note: The auth server only returns WorkOS tokens on refresh - the GitHub
 * token is preserved locally as it doesn't change during refresh.
 */

import { NextResponse } from 'next/server';
import { getRefreshToken, refreshAuthCookies, RefreshTokenData } from '@/lib/auth/cookies';

export async function POST() {
  try {
    // Get refresh token from HTTP-only cookie
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token available' },
        { status: 401 }
      );
    }

    // Call auth server to refresh tokens
    const authServerUrl = process.env.AUTH_SERVER_URL;
    if (!authServerUrl) {
      throw new Error('AUTH_SERVER_URL not configured');
    }

    const response = await fetch(`${authServerUrl}/api/auth/workos/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token refresh error:', error);

      // If refresh token is invalid/expired, return 401
      if (response.status === 400 || response.status === 401) {
        return NextResponse.json(
          { error: 'Refresh token expired or invalid' },
          { status: 401 }
        );
      }

      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    // Validate response data
    // Note: github_access_token is NOT returned on refresh - the client
    // already has the GitHub token stored locally and it doesn't change
    if (!data.workos_access_token || !data.refresh_token) {
      throw new Error('Invalid token response from auth server');
    }

    // Update HTTP-only cookies with new WorkOS tokens
    // GitHub token is preserved (its expiry is extended but value unchanged)
    await refreshAuthCookies(data as RefreshTokenData);

    return NextResponse.json({
      success: true,
      message: 'Tokens refreshed successfully',
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      {
        error: 'Failed to refresh tokens',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
