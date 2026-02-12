/**
 * GET /api/otel/services/{serviceName}/versions/live
 *
 * Proxies requests to the OTEL Collection Server to get live versions for a service.
 * Returns versions that have sent traces within the last 5 minutes.
 *
 * Path parameters:
 * - serviceName: Service name (e.g., "web-ade")
 *
 * Example:
 * GET /api/otel/services/web-ade/versions/live
 */

import { NextRequest, NextResponse } from 'next/server';

const OTEL_API_BASE = process.env.OTEL_API_BASE || 'https://5hmsn3wzue.us-east-1.awsapprunner.com';

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 200 }));
}

/**
 * Get live versions for a service from OTEL collector
 *
 * Flow:
 * 1. Extract service name from path
 * 2. Proxy request to OTEL collector
 * 3. Add authentication if configured
 * 4. Return live version strings
 *
 * Success response (200):
 * {
 *   "serviceName": "web-ade",
 *   "liveVersions": ["v1.2.3", "v1.2.4"],
 *   "count": 2
 * }
 *
 * Empty response (200):
 * {
 *   "serviceName": "web-ade",
 *   "liveVersions": [],
 *   "count": 0
 * }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceName: string }> }
) {
  try {
    const { serviceName } = await params;

    console.log('[OTEL Live Versions] Request for:', serviceName);

    // Build headers with optional Bearer token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication if OTEL_BEARER_TOKEN is configured
    const bearerToken = process.env.OTEL_BEARER_TOKEN;
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    // Proxy request to OTEL collector
    const otelUrl = `${OTEL_API_BASE}/services/${encodeURIComponent(serviceName)}/versions/live`;
    const response = await fetch(otelUrl, { headers });

    if (!response.ok) {
      throw new Error(`OTEL API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log('[OTEL Live Versions] Success:', {
      serviceName: data.serviceName,
      count: data.count,
      liveVersions: data.liveVersions,
    });

    return addCorsHeaders(
      NextResponse.json(data, {
        status: 200,
        headers: {
          // Cache for 1 minute (versions can change frequently)
          'Cache-Control': 'public, max-age=60',
        },
      })
    );
  } catch (error) {
    console.error('[OTEL Live Versions] Error:', error);

    return addCorsHeaders(
      NextResponse.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    );
  }
}
