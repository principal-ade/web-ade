/**
 * GET/POST /api/auth/login
 *
 * Initiates OAuth flow by:
 * 1. Generating PKCE challenge and state
 * 2. Storing verifier in server session
 * 3. Calling landing-page to get OAuth URL
 * 4. Redirecting user to OAuth provider
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePKCE, generateState, decodeState } from '@/lib/auth/pkce';
import { setAuthSession } from '@/lib/auth/session';

async function handleLogin(request: NextRequest) {
  try {
    // Get redirect URL from query params
    const redirectTo = request.nextUrl.searchParams.get('redirect') || undefined;

    // Generate PKCE challenge and state (state now contains CSRF + redirect)
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const state = generateState(redirectTo); // Encode redirect in state parameter
    const { csrf } = decodeState(state); // Extract CSRF for session storage

    // Store verifier and CSRF token in server session (5 min TTL)
    // No need to store redirect separately - it's in the state parameter
    await setAuthSession(codeVerifier, csrf);

    // Call auth server to initiate OAuth
    const authServerUrl = process.env.AUTH_SERVER_URL;
    if (!authServerUrl) {
      throw new Error('AUTH_SERVER_URL not configured');
    }

    const appUrl = 'https://app.principal-ade.com';
    // No need to add redirect to return_url - it's encoded in the state parameter
    const returnUrl = `${appUrl}/api/auth/callback`;

    console.log('Calling auth server:', {
      url: `${authServerUrl}/api/auth/workos/start`,
      state,
      returnUrl,
      redirectTo,
      stateContainsRedirect: !!redirectTo,
    });

    const response = await fetch(`${authServerUrl}/api/auth/workos/start`, {
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

export async function GET(request: NextRequest) {
  return handleLogin(request);
}

export async function POST(request: NextRequest) {
  return handleLogin(request);
}
