/**
 * POST /api/auth/refresh
 *
 * Refreshes expired access tokens using the refresh token.
 * Reads refresh_token from HTTP-only cookie and exchanges for new tokens.
 */

import { NextResponse } from 'next/server';
import { getRefreshToken, setAuthCookies, TokenData } from '@/lib/auth/cookies';

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

    // Call landing-page to refresh tokens
    const landingPageUrl = process.env.LANDING_PAGE_URL;
    if (!landingPageUrl) {
      throw new Error('LANDING_PAGE_URL not configured');
    }

    const response = await fetch(`${landingPageUrl}/api/auth/workos/refresh`, {
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
    if (
      !data.github_access_token ||
      !data.workos_access_token ||
      !data.refresh_token
    ) {
      throw new Error('Invalid token response from landing-page');
    }

    // Update HTTP-only cookies with new tokens
    await setAuthCookies(data as TokenData);

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
