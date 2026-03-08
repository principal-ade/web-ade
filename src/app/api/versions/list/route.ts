/**
 * GET /api/versions/list
 *
 * Lists all version registrations for a repository.
 * Returns all services, versions, and environments registered for the given repo.
 *
 * Query parameters:
 * - customerId: Repository in format "owner/repo" (e.g., "acme/backend-monorepo")
 *
 * Example:
 * GET /api/versions/list?customerId=acme/backend-monorepo
 *
 * @otel canvas: .principal-views/version-registry/version-registry.otel.canvas
 * @otel workflow: .principal-views/version-registry/list/list.workflow.json
 * @otel span: api.version-registry.list
 */

import { NextRequest, NextResponse } from 'next/server';
import { trace } from '@opentelemetry/api';
import { listRepoRegistrations } from '@/lib/version-registry/s3-storage';
import type {
  VersionListResponse,
} from '@/lib/version-registry/types';

// Get tracer for version registry
const tracer = trace.getTracer('version-registry', '1.0.0');

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 200 }));
}

/**
 * List all version registrations for a repository
 *
 * Flow:
 * 1. Extract customerId from query parameters
 * 2. Validate required parameter
 * 3. Query S3 for all registrations under version-registry/{owner}/{repo}/
 * 4. Return array of all registrations
 *
 * Success response (200):
 * {
 *   "success": true,
 *   "registrations": [
 *     {
 *       "customerId": "acme/backend-monorepo",
 *       "serviceName": "payment-api",
 *       "version": "v1.2.3",
 *       "gitSHA": "abc123def456...",
 *       "environment": "production",
 *       ...
 *     },
 *     ...
 *   ],
 *   "count": 5
 * }
 *
 * Error response (400/500):
 * {
 *   "success": false,
 *   "registrations": [],
 *   "count": 0,
 *   "error": "Error message"
 * }
 */
export async function GET(request: NextRequest) {
  const span = tracer.startSpan('api.version-registry.list');

  try {
    const { searchParams } = new URL(request.url);

    const customerId = searchParams.get('customerId');

    // Emit: version.list.started
    span.addEvent('version.list.started', {
      'customer.id': customerId || '',
    });

    // Validate required parameter
    if (!customerId) {
      // Emit: version.list.error
      span.addEvent('version.list.error', {
        'error.type': 'ValidationError',
        'error.message': 'Missing required query parameter: customerId',
        'error.stage': 'validation',
      });
      span.end();

      return addCorsHeaders(
        NextResponse.json(
          {
            success: false,
            registrations: [],
            count: 0,
            error: 'Missing required query parameter: customerId',
          } satisfies VersionListResponse,
          { status: 400 }
        )
      );
    }

    console.log('[Version Registry] List request:', { customerId });

    // List all registrations for this repository
    const registrations = await listRepoRegistrations(customerId, span);

    console.log('[Version Registry] List successful:', {
      customerId,
      count: registrations.length,
    });

    const response: VersionListResponse = {
      success: true,
      registrations,
      count: registrations.length,
    };

    // Emit: version.list.complete
    span.addEvent('version.list.complete', {
      'customer.id': customerId,
      'registration.count': registrations.length,
    });
    span.end();

    return addCorsHeaders(
      NextResponse.json(response, {
        status: 200,
        headers: {
          // No caching - versions can be added/deleted frequently
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    );
  } catch (error) {
    console.error('[Version Registry] List error:', error);

    // Emit: version.list.error
    span.addEvent('version.list.error', {
      'error.type': error instanceof Error ? error.name : 'UnknownError',
      'error.message': error instanceof Error ? error.message : String(error),
      'error.stage': 'storage',
    });
    span.end();

    return addCorsHeaders(
      NextResponse.json(
        {
          success: false,
          registrations: [],
          count: 0,
          error: 'Internal server error during list operation',
        } satisfies VersionListResponse,
        { status: 500 }
      )
    );
  }
}
