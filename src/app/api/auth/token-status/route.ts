/**
 * GET /api/auth/token-status
 *
 * Returns token expiry information so the client can proactively refresh.
 * Since tokens are in HTTP-only cookies, the client can't read expiry directly.
 */

import { NextResponse } from 'next/server';
import { getTokenExpiry, isAuthenticated } from '@/lib/auth/cookies';

export async function GET() {
  try {
    const authenticated = await isAuthenticated();

    if (!authenticated) {
      return NextResponse.json({
        authenticated: false,
        expiresAt: null,
        expiresIn: null,
      });
    }

    const expiresAt = await getTokenExpiry();
    const now = Date.now();
    const expiresIn = expiresAt ? Math.max(0, expiresAt - now) : null;

    return NextResponse.json({
      authenticated: true,
      expiresAt,
      expiresIn,
      // Include a "shouldRefresh" hint - true if within 5 minutes of expiry
      shouldRefresh: expiresIn !== null && expiresIn < 5 * 60 * 1000,
    });
  } catch (error) {
    console.error('Token status error:', error);
    return NextResponse.json(
      { error: 'Failed to get token status' },
      { status: 500 }
    );
  }
}
