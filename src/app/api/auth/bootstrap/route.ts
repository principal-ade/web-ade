/**
 * POST /api/auth/bootstrap
 *
 * Cold-start session recovery. When the short-lived access cookies have expired
 * (>1h idle) but the 30-day refresh_token survives, rebuild the session WITHOUT
 * a full OAuth re-login:
 *
 *   1. Redeem refresh_token at the auth-server /workos/refresh (the surviving
 *      SECRET) for a fresh, JWKS-verifiable WorkOS access token.
 *   2. Present that WorkOS token to the hardened /token/current to recover the
 *      central GitHub token, then restore the github_token cookie so
 *      /api/auth/me succeeds.
 *
 * The GitHub token is only returned after the refresh_token proves identity —
 * github_user_id alone is a public identifier and is never sufficient. See
 * docs/auth-session-expiry-investigation.md (§4–§5) and the auth-server fix in
 * docs/security/token-current-disclosure.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getRefreshToken,
  getGitHubUserId,
  refreshAuthCookies,
  RefreshTokenData,
} from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  try {
    // The surviving secret. No refresh token → genuine re-login required.
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token available' },
        { status: 401 }
      );
    }

    // Public identifier (30-day cookie). Needed to address the central store,
    // but it never authorizes the lookup on its own.
    const githubUserId = await getGitHubUserId();
    if (!githubUserId) {
      return NextResponse.json(
        { error: 'No github_user_id available' },
        { status: 401 }
      );
    }

    // device_id is required for the WorkOS-token path on /token/current. It is
    // client-only (localStorage), so the client sends it in the body.
    let deviceId: string | undefined;
    try {
      const body = await request.json();
      deviceId = body?.device_id;
    } catch {
      // No / invalid body — handled below.
    }
    if (!deviceId) {
      return NextResponse.json(
        { error: 'device_id is required' },
        { status: 400 }
      );
    }

    const authServerUrl = process.env.AUTH_SERVER_URL;
    if (!authServerUrl) {
      throw new Error('AUTH_SERVER_URL not configured');
    }

    // 1. Redeem the refresh token for a fresh WorkOS access token. This also
    //    (re)writes the device session the hardened /token/current checks.
    const refreshResponse = await fetch(`${authServerUrl}/api/auth/workos/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        device_id: deviceId,
        github_user_id: String(githubUserId),
      }),
    });

    if (!refreshResponse.ok) {
      // Refresh token expired/invalid → genuine re-login required.
      return NextResponse.json(
        { error: 'Refresh token expired or invalid' },
        { status: 401 }
      );
    }

    const refreshData = await refreshResponse.json();
    if (!refreshData.workos_access_token || !refreshData.refresh_token) {
      throw new Error('Invalid refresh response from auth server');
    }

    // Persist the new WorkOS + refresh tokens (github_token is still missing).
    await refreshAuthCookies(refreshData as RefreshTokenData);

    // 2. Exchange the verified WorkOS token for the central GitHub token.
    const tokenUrl = new URL(`${authServerUrl}/api/auth/token/current`);
    tokenUrl.searchParams.set('github_user_id', String(githubUserId));
    tokenUrl.searchParams.set('device_id', deviceId);

    const tokenResponse = await fetch(tokenUrl.toString(), {
      headers: {
        Authorization: `Bearer ${refreshData.workos_access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to restore GitHub token' },
        { status: 401 }
      );
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.github_token) {
      return NextResponse.json(
        { error: 'No GitHub token returned' },
        { status: 401 }
      );
    }

    // Restore the github_token cookie so /api/auth/me succeeds on the retry.
    const cookieStore = await cookies();
    const maxAge = refreshData.expires_in || 60 * 60;
    cookieStore.set('github_token', tokenData.github_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Bootstrap error:', error);
    return NextResponse.json(
      {
        error: 'Failed to bootstrap session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
