/**
 * GET /api/otel/traces/{serviceName}/versions/{version}
 *
 * Fetches traces for a specific service version from the OTEL Collection Server.
 * Returns traces in OTLP JSON format.
 *
 * Path parameters:
 * - serviceName: Service name (e.g., "web-ade")
 * - version: Version string (e.g., "v1.2.3")
 *
 * Query parameters:
 * - limit: Maximum number of traces to return (optional, defaults to all)
 *
 * Example:
 * GET /api/otel/traces/web-ade/versions/v1.2.3?limit=10
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
 * Get traces for a specific version from OTEL collector
 *
 * Flow:
 * 1. Extract service name, version, and optional limit from request
 * 2. Proxy request to OTEL collector with authentication
 * 3. Return traces in OTLP format
 *
 * Success response (200):
 * {
 *   "service": "web-ade",
 *   "version": "v1.2.3",
 *   "count": 10,
 *   "traces": [...]
 * }
 *
 * Empty response (200):
 * {
 *   "service": "web-ade",
 *   "version": "v1.2.3",
 *   "count": 0,
 *   "traces": []
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceName: string; version: string }> }
) {
  try {
    const { serviceName, version } = await params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');

    console.log('[OTEL Version Traces] Request for:', { serviceName, version, limit });

    // Build headers with optional Bearer token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication if OTEL_BEARER_TOKEN is configured
    const bearerToken = process.env.OTEL_BEARER_TOKEN;
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    // Build OTEL URL with optional limit parameter
    const otelUrl = new URL(
      `${OTEL_API_BASE}/traces/${encodeURIComponent(serviceName)}/versions/${encodeURIComponent(version)}`
    );
    if (limit) {
      otelUrl.searchParams.set('limit', limit);
    }

    const response = await fetch(otelUrl.toString(), { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[OTEL Version Traces] No traces found for version:', { serviceName, version });
        return addCorsHeaders(
          NextResponse.json(
            {
              service: serviceName,
              version,
              count: 0,
              traces: [],
            },
            { status: 200 }
          )
        );
      }

      if (response.status === 501) {
        console.error('[OTEL Version Traces] File output not configured on OTEL server');
        return addCorsHeaders(
          NextResponse.json(
            {
              error: 'Trace retrieval not available',
              message: 'OTEL server is not configured with file output',
            },
            { status: 501 }
          )
        );
      }

      throw new Error(`OTEL API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log('[OTEL Version Traces] Success:', {
      serviceName: data.service,
      version: data.version,
      count: data.count,
    });

    return addCorsHeaders(
      NextResponse.json(data, {
        status: 200,
        headers: {
          // Cache for 30 seconds (traces change frequently)
          'Cache-Control': 'public, max-age=30',
        },
      })
    );
  } catch (error) {
    console.error('[OTEL Version Traces] Error:', error);

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
