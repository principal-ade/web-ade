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
import { decodeState } from '@/lib/auth/pkce';
import { trace } from '@opentelemetry/api';

// Get tracer for authentication flow
const tracer = trace.getTracer('auth-callback', '1.0.0');

/**
 * Aggressively validates and sanitizes redirect values to prevent [object Object] bug
 * Returns a valid path string or undefined
 */
function sanitizeRedirect(value: unknown, source: string): string | undefined {
  // Reject anything that's not a string
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) {
      console.warn(`[REDIRECT BUG] Non-string redirect from ${source}:`, {
        type: typeof value,
        value,
        stringified: String(value),
      });
    }
    return undefined;
  }

  // Reject empty strings
  if (!value || value.trim() === '') {
    return undefined;
  }

  // Reject if it looks like stringified object
  if (value.includes('[object') || value.includes('Object]')) {
    console.error(`[REDIRECT BUG] Detected stringified object from ${source}:`, value);
    return undefined;
  }

  return value;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const span = tracer.startSpan('auth.callback');

  try {
    const searchParams = request.nextUrl.searchParams;
    const state = searchParams.get('state');
    const code = searchParams.get('code');
    const authError = searchParams.get('auth_error');

    // Check for workos_session cookie
    const workosSession = request.cookies.get('workos_session');

    // Emit: auth.callback.started
    span.addEvent('auth.callback.started', {
      'request.has_state': !!state,
      'request.has_code': !!code,
      'request.has_workos_cookie': !!workosSession,
      'request.has_auth_error': !!authError,
    });

    // Debug: Log all parameters and cookies received
    console.log('Callback received:', {
      state,
      code,
      authError,
      allParams: Object.fromEntries(searchParams.entries()),
      cookieNames: request.cookies.getAll().map(c => c.name),
      url: request.url,
      fullUrl: request.nextUrl.toString(),
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
    });

    // Check if landing page handled auth and set cookie (already captured above)
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

        // Emit: auth.tokens.received (WorkOS cookie flow)
        span.addEvent('auth.tokens.received', {
          'tokens.source': 'workos_cookie',
          'tokens.has_github_token': !!tokenData.github_access_token,
          'tokens.has_workos_token': !!tokenData.workos_access_token,
          'tokens.has_refresh_token': !!tokenData.refresh_token,
          'user.id': tokenData.user?.id,
        });

        await setAuthCookies(tokenData);

        // Emit: auth.cookies.set
        span.addEvent('auth.cookies.set', {
          'cookies.count': 3, // github_access_token, workos_access_token, refresh_token
        });

        // Determine where to send the user after landing-page auth
        const appUrl = 'https://app.principal-ade.com';

        // Try to decode state parameter for redirect (primary source)
        let redirectPath = '/';
        try {
          const returnedState = request.nextUrl.searchParams.get('state');
          if (returnedState) {
            const decoded = decodeState(returnedState);
            if (decoded.redirect) {
              redirectPath = sanitizeRedirect(decoded.redirect, 'state_parameter') || '/';
            }
          }
        } catch (e) {
          console.error('Failed to decode state from workos callback:', e);
        }

        // Fallback: check workos_session or query params (legacy support)
        if (redirectPath === '/') {
          const redirectFromQuery = sanitizeRedirect(
            request.nextUrl.searchParams.get('redirect') || request.nextUrl.searchParams.get('redirect_path'),
            'query_params'
          );
          const redirectFromWorkosSession = sanitizeRedirect(
            sessionData.redirect_path || sessionData.redirectPath || sessionData.redirect_to || sessionData.redirectTo,
            'workos_session'
          );
          redirectPath = redirectFromQuery || redirectFromWorkosSession || '/';
        }
        const normalizedRedirectPath = redirectPath.startsWith('/')
          ? redirectPath
          : `/${redirectPath}`;

        console.log('Workos_session redirect resolution:', {
          fromState: redirectPath !== '/' ? 'decoded from state' : 'not in state',
          final: normalizedRedirectPath,
        });

        // Emit: auth.callback.complete (WorkOS flow)
        const redirectSource = redirectPath !== '/' ? 'state' : 'default';
        span.addEvent('auth.callback.complete', {
          'redirect.path': normalizedRedirectPath,
          'redirect.source': redirectSource,
          'duration.ms': Date.now() - startTime,
        });

        // Clear the landing page cookie and redirect to intended destination
        const response = NextResponse.redirect(new URL(normalizedRedirectPath, appUrl));
        response.cookies.delete('workos_session');

        span.end();
        console.log('Successfully authenticated via workos_session cookie, redirecting to:', normalizedRedirectPath);
        return response;
      } catch (e) {
        console.error('Failed to parse workos_session cookie:', e);
        // Emit error but continue to other auth flows (not fatal)
        span.addEvent('auth.callback.error', {
          'error.type': 'parse',
          'error.message': e instanceof Error ? e.message : String(e),
          'error.stage': 'workos_cookie_parse',
        });
        // Continue to other auth flows
      }
    }

    // Handle auth errors from landing page
    if (authError) {
      const errorMessage = searchParams.get('error_message') || 'Authentication failed';
      console.error('Auth error from landing page:', authError, errorMessage);

      span.addEvent('auth.callback.error', {
        'error.type': 'validation',
        'error.message': errorMessage,
        'error.stage': 'landing_page_auth',
      });
      span.end();

      return NextResponse.redirect(new URL(`/?error=${authError}`, request.url));
    }

    if (!state) {
      span.addEvent('auth.callback.error', {
        'error.type': 'validation',
        'error.message': 'Missing state parameter',
        'error.stage': 'state_parameter',
        'error.status_code': 400,
      });
      span.end();

      return NextResponse.json(
        {
          error: 'Missing state parameter',
          received: Object.fromEntries(searchParams.entries()),
        },
        { status: 400 }
      );
    }

    // Decode state parameter to extract CSRF and redirect
    let decodedState: { csrf: string; redirect?: string };
    try {
      decodedState = decodeState(state);
      console.log('Decoded state:', decodedState);
    } catch {
      span.addEvent('auth.callback.error', {
        'error.type': 'validation',
        'error.message': 'Invalid state parameter format',
        'error.stage': 'state_decode',
        'error.status_code': 400,
      });
      span.end();

      return NextResponse.json(
        { error: 'Invalid state parameter format' },
        { status: 400 }
      );
    }

    // Retrieve and validate session using CSRF token
    const sessionData = await getAndValidateSession(decodedState.csrf);

    if (!sessionData) {
      span.addEvent('auth.callback.error', {
        'error.type': 'validation',
        'error.message': 'Invalid or expired session',
        'error.stage': 'session_validation',
        'error.status_code': 400,
      });
      span.end();

      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 400 }
      );
    }

    // Emit: auth.state.validated (PKCE flow)
    span.addEvent('auth.state.validated', {
      'state.csrf': decodedState.csrf,
      'state.has_redirect': !!decodedState.redirect,
      'flow.type': 'pkce',
    });

    const { codeVerifier } = sessionData;
    const redirectTo = decodedState.redirect; // Get redirect from state parameter

    // Exchange PKCE verifier for tokens
    const authServerUrl = process.env.AUTH_SERVER_URL;
    if (!authServerUrl) {
      throw new Error('AUTH_SERVER_URL not configured');
    }

    const response = await fetch(`${authServerUrl}/api/auth/workos/token`, {
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

    // Emit: auth.tokens.received (PKCE flow)
    span.addEvent('auth.tokens.received', {
      'tokens.source': 'pkce_exchange',
      'tokens.has_github_token': !!data.github_access_token,
      'tokens.has_workos_token': !!data.workos_access_token,
      'tokens.has_refresh_token': !!data.refresh_token,
      'user.id': data.user?.id || 'unknown',
    });

    // Set HTTP-only cookies with tokens
    await setAuthCookies(data as TokenData);

    // Emit: auth.cookies.set
    span.addEvent('auth.cookies.set', {
      'cookies.count': 3, // github_access_token, workos_access_token, refresh_token
    });

    // Clear temporary session
    await clearAuthSession();

    // Redirect to original page or home
    const appUrl = 'https://app.principal-ade.com';
    // Aggressively validate redirect (prevents [object Object] bug)
    const finalRedirect = sanitizeRedirect(redirectTo, 'pkce_session') || '/';
    const redirectSource = redirectTo ? 'state' : 'default';
    console.log('PKCE flow redirect:', { redirectTo, finalRedirect });

    // Emit: auth.callback.complete (PKCE flow)
    span.addEvent('auth.callback.complete', {
      'redirect.path': finalRedirect,
      'redirect.source': redirectSource,
      'duration.ms': Date.now() - startTime,
    });

    span.end();
    return NextResponse.redirect(new URL(finalRedirect, appUrl));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTokenExchangeError = errorMessage.includes('Token exchange failed');

    console.error('Callback error:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
    });

    // Emit: auth.callback.error
    span.addEvent('auth.callback.error', {
      'error.type': isTokenExchangeError ? 'token_exchange' : 'unknown',
      'error.message': errorMessage,
      'error.stage': isTokenExchangeError ? 'token_exchange' : 'unknown',
    });
    span.end();

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
