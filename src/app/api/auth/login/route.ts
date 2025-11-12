/**
 * GET/POST /api/auth/login
 *
 * Initiates OAuth flow by:
 * 1. Generating PKCE challenge and state
 * 2. Storing verifier in server session
 * 3. Calling landing-page to get OAuth URL
 * 4. Redirecting user to OAuth provider
 */

import { NextResponse } from 'next/server';
import { generatePKCE, generateState } from '@/lib/auth/pkce';
import { setAuthSession } from '@/lib/auth/session';

async function handleLogin() {
  try {
    // Generate PKCE challenge and state
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const state = generateState();

    // Store verifier and state in server session (5 min TTL)
    await setAuthSession(codeVerifier, state);

    // Call landing-page to initiate OAuth
    const landingPageUrl = process.env.LANDING_PAGE_URL;
    if (!landingPageUrl) {
      throw new Error('LANDING_PAGE_URL not configured');
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const returnUrl = `${appUrl}/api/auth/callback`;

    console.log('Calling landing page:', {
      url: `${landingPageUrl}/api/auth/workos/start`,
      state,
      returnUrl,
    });

    const response = await fetch(`${landingPageUrl}/api/auth/workos/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code_challenge: codeChallenge,
        state,
        return_url: returnUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Landing page error:', error);
      throw new Error(`Landing page returned ${response.status}: ${error}`);
    }

    const data = await response.json();

    console.log('Landing page response:', data);

    if (!data.auth_url) {
      throw new Error('No auth_url returned from landing-page');
    }

    console.log('Redirecting to OAuth URL:', data.auth_url);

    // Redirect user to OAuth provider
    return NextResponse.redirect(data.auth_url);
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      {
        error: 'Failed to initiate login',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return handleLogin();
}

export async function POST() {
  return handleLogin();
}
