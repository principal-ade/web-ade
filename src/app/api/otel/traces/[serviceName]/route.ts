/**
 * GET /api/otel/traces/{serviceName}
 *
 * Fetches traces for a specific service from the OTEL Collection Server.
 * Returns traces in OTLP JSON format.
 *
 * Path parameters:
 * - serviceName: Service name (e.g., "web-ade")
 *
 * Query parameters:
 * - limit: Maximum number of traces to return (optional, defaults to all)
 *
 * Example:
 * GET /api/otel/traces/web-ade?limit=10
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
 * Get traces from OTEL collector
 *
 * Flow:
 * 1. Extract service name from path and limit from query
 * 2. Proxy request to OTEL collector with authentication
 * 3. Return traces in OTLP format
 *
 * Success response (200):
 * {
 *   "service": "web-ade",
 *   "count": 10,
 *   "traces": [...]
 * }
 *
 * Error responses:
 * - 404: Service not found (no traces for this service)
 * - 401: Unauthorized (missing/invalid Bearer token)
 * - 501: Not implemented (file output not configured on server)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceName: string }> }
) {
  try {
    const { serviceName } = await params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');

    console.log('[OTEL Traces] Request for:', serviceName, 'limit:', limit || 'all');

    // Build headers with Bearer token (required for /traces endpoint)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const bearerToken = process.env.OTEL_BEARER_TOKEN;
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    } else {
      console.warn('[OTEL Traces] No OTEL_BEARER_TOKEN configured - request may fail');
    }

    // Build OTEL URL with optional limit parameter
    const otelUrl = new URL(`${OTEL_API_BASE}/traces/${encodeURIComponent(serviceName)}`);
    if (limit) {
      otelUrl.searchParams.set('limit', limit);
    }

    // Proxy request to OTEL collector
    const response = await fetch(otelUrl.toString(), { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[OTEL Traces] Service not found:', serviceName);
        return addCorsHeaders(
          NextResponse.json(
            {
              error: 'Service not found',
              message: `No traces received from service: ${serviceName}`,
            },
            { status: 404 }
          )
        );
      }

      if (response.status === 401) {
        console.error('[OTEL Traces] Unauthorized - check OTEL_BEARER_TOKEN');
        return addCorsHeaders(
          NextResponse.json(
            {
              error: 'Unauthorized',
              message: 'Invalid or missing authentication token',
            },
            { status: 401 }
          )
        );
      }

      if (response.status === 501) {
        console.error('[OTEL Traces] File output not configured on OTEL server');
        return addCorsHeaders(
          NextResponse.json(
            {
              error: 'Not implemented',
              message: 'Trace retrieval not available - server not configured with file output',
            },
            { status: 501 }
          )
        );
      }

      throw new Error(`OTEL API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log('[OTEL Traces] Success:', {
      service: data.service,
      count: data.count,
    });

    return addCorsHeaders(
      NextResponse.json(data, {
        status: 200,
        headers: {
          // Cache for 30 seconds (traces update frequently)
          'Cache-Control': 'public, max-age=30',
        },
      })
    );
  } catch (error) {
    console.error('[OTEL Traces] Error:', error);

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
