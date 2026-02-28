/**
 * GET /api/auth/token-status
 *
 * Returns token expiry information so the client can proactively refresh.
 * Since tokens are in HTTP-only cookies, the client can't read expiry directly.
 */

import { NextResponse } from 'next/server';
import { getTokenExpiry, isAuthenticated } from '@/lib/auth/cookies';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('token-status');

export async function GET() {
  const span = tracer.startSpan('token.status.check');

  // Emit started event
  span.addEvent('token.check.started', {
    'request.timestamp': Date.now(),
  });

  try {
    const authenticated = await isAuthenticated();

    if (!authenticated) {
      // Emit unauthenticated event
      span.addEvent('token.check.unauthenticated', {
        'authenticated': false,
      });
      span.end();

      return NextResponse.json({
        authenticated: false,
        expiresAt: null,
        expiresIn: null,
      });
    }

    const expiresAt = await getTokenExpiry();
    const now = Date.now();
    const expiresIn = expiresAt ? Math.max(0, expiresAt - now) : null;
    const shouldRefresh = expiresIn !== null && expiresIn < 5 * 60 * 1000;

    // Emit authenticated event (different event if expiring soon)
    const eventName = shouldRefresh
      ? 'token.check.authenticated-expiring'
      : 'token.check.authenticated';
    span.addEvent(eventName, {
      'authenticated': true,
      'expiresAt': expiresAt || 0,
      'expiresIn': expiresIn || 0,
      'shouldRefresh': shouldRefresh,
    });
    span.end();

    return NextResponse.json({
      authenticated: true,
      expiresAt,
      expiresIn,
      // Include a "shouldRefresh" hint - true if within 5 minutes of expiry
      shouldRefresh,
    });
  } catch (error) {
    console.error('Token status error:', error);

    // Emit error event
    span.addEvent('token.check.error', {
      'error.type': error instanceof Error ? error.name : 'Unknown',
      'error.message': error instanceof Error ? error.message : 'Unknown error',
    });
    span.end();

    return NextResponse.json(
      { error: 'Failed to get token status' },
      { status: 500 }
    );
  }
}
