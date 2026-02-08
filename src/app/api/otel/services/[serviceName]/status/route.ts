/**
 * GET /api/otel/services/{serviceName}/status
 *
 * Proxies requests to the OTEL Collection Server to get service status.
 * Returns whether a service is actively sending traces.
 *
 * Path parameters:
 * - serviceName: Service name (e.g., "web-ade")
 *
 * Example:
 * GET /api/otel/services/web-ade/status
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
 * Get service status from OTEL collector
 *
 * Flow:
 * 1. Extract service name from path
 * 2. Proxy request to OTEL collector
 * 3. Add authentication if configured
 * 4. Return service status or 404 if not found
 *
 * Success response (200):
 * {
 *   "serviceName": "web-ade",
 *   "firstSeen": "2025-02-07T10:30:00.000Z",
 *   "lastSeen": "2025-02-07T10:35:00.000Z",
 *   "totalTraces": 10,
 *   "isAlive": true
 * }
 *
 * Not found response (404):
 * {
 *   "error": "Service not found",
 *   "message": "No traces received from service: my-service"
 * }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceName: string }> }
) {
  try {
    const { serviceName } = await params;

    console.log('[OTEL Service Status] Request for:', serviceName);

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
    const otelUrl = `${OTEL_API_BASE}/services/${encodeURIComponent(serviceName)}/status`;
    const response = await fetch(otelUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[OTEL Service Status] Service not found:', serviceName);
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

      throw new Error(`OTEL API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log('[OTEL Service Status] Success:', {
      serviceName: data.serviceName,
      isAlive: data.isAlive,
      lastSeen: data.lastSeen,
    });

    return addCorsHeaders(
      NextResponse.json(data, {
        status: 200,
        headers: {
          // Cache for 1 minute (status can change frequently)
          'Cache-Control': 'public, max-age=60',
        },
      })
    );
  } catch (error) {
    console.error('[OTEL Service Status] Error:', error);

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
