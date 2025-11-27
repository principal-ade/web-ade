/**
 * GET /api/auth/callback
 *
 * OAuth callback handler:
 * 1. Retrieves code_verifier from server session
 * 2. Validates state parameter (CSRF protection)
 * 3. Exchanges PKCE verifier for tokens (server-to-server with landing-page)
 * 4. Sets HTTP-only cookies with tokens
 * 5. Redirects to dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAndValidateSession, clearAuthSession } from '@/lib/auth/session';
import { setAuthCookies, TokenData } from '@/lib/auth/cookies';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const state = searchParams.get('state');
    const code = searchParams.get('code');
    const authError = searchParams.get('auth_error');

    // Debug: Log all parameters and cookies received
    console.log('Callback received:', {
      state,
      code,
      authError,
      allParams: Object.fromEntries(searchParams.entries()),
      cookieNames: request.cookies.getAll().map(c => c.name),
      url: request.url,
    });

    // Check if landing page handled auth and set cookie
    const workosSession = request.cookies.get('workos_session');
    if (workosSession) {
      console.log('Found workos_session cookie from landing page');

      try {
        const sessionData = JSON.parse(workosSession.value);

        // Set our own auth cookies with the data from landing page
        const tokenData: TokenData = {
          github_access_token: sessionData.github_access_token || sessionData.access_token,
          workos_access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
          user: {
            id: sessionData.id,
            email: sessionData.email,
            login: sessionData.login,
            name: sessionData.name,
            avatar_url: sessionData.avatar_url,
          },
        };

        await setAuthCookies(tokenData);

        // Determine where to send the user after landing-page auth
        const appUrl = 'https://app.principal-ade.com';
        const redirectPathFromQuery =
          request.nextUrl.searchParams.get('redirect') ||
          request.nextUrl.searchParams.get('redirect_path');
        const redirectPathFromSession =
          sessionData.redirect_path ||
          sessionData.redirectPath ||
          sessionData.redirect_to ||
          sessionData.redirectTo;
        const redirectPath = redirectPathFromQuery || redirectPathFromSession || '/';
        const normalizedRedirectPath = redirectPath.startsWith('/')
          ? redirectPath
          : `/${redirectPath}`;

        // Clear the landing page cookie and redirect to intended destination
        const response = NextResponse.redirect(new URL(normalizedRedirectPath, appUrl));
        response.cookies.delete('workos_session');

        console.log('Successfully authenticated via workos_session cookie');
        return response;
      } catch (e) {
        console.error('Failed to parse workos_session cookie:', e);
        // Continue to other auth flows
      }
    }

    // Handle auth errors from landing page
    if (authError) {
      const errorMessage = searchParams.get('error_message') || 'Authentication failed';
      console.error('Auth error from landing page:', authError, errorMessage);
      return NextResponse.redirect(new URL(`/?error=${authError}`, request.url));
    }

    if (!state) {
      return NextResponse.json(
        {
          error: 'Missing state parameter',
          received: Object.fromEntries(searchParams.entries()),
        },
        { status: 400 }
      );
    }

    // Retrieve and validate session
    const sessionData = await getAndValidateSession(state);

    if (!sessionData) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 400 }
      );
    }

    const { codeVerifier, redirectTo } = sessionData;

    // Exchange PKCE verifier for tokens
    const landingPageUrl = process.env.LANDING_PAGE_URL;
    if (!landingPageUrl) {
      throw new Error('LANDING_PAGE_URL not configured');
    }

    const response = await fetch(`${landingPageUrl}/api/auth/workos/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange error:', error);
      throw new Error(`Token exchange failed: ${response.status}`);
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

    // Set HTTP-only cookies with tokens
    await setAuthCookies(data as TokenData);

    // Clear temporary session
    await clearAuthSession();

    // Redirect to original page or home
    const appUrl = 'https://app.principal-ade.com';
    const finalRedirect = redirectTo || '/';
    return NextResponse.redirect(new URL(finalRedirect, appUrl));
  } catch (error) {
    console.error('Callback error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
    });

    // Clear session on error
    try {
      await clearAuthSession();
    } catch (e) {
      console.error('Failed to clear session:', e);
    }

    // Redirect to home with error
    const appUrl = 'https://app.principal-ade.com';
    const errorUrl = new URL('/?error=auth_failed', appUrl);

    // Add error message for debugging (only in dev)
    if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
      errorUrl.searchParams.set('message', error.message);
    }

    return NextResponse.redirect(errorUrl);
  }
}
