/**
 * GET /api/versions/latest
 *
 * Returns the latest version registration for a repository.
 * Optionally filters by serviceName and/or environment.
 *
 * Query parameters:
 * - customerId: Repository in format "owner/repo" (required)
 * - serviceName: Filter by service name (optional)
 * - environment: Filter by environment (optional)
 *
 * Example:
 * GET /api/versions/latest?customerId=acme/backend-monorepo
 * GET /api/versions/latest?customerId=acme/backend-monorepo&serviceName=payment-api
 * GET /api/versions/latest?customerId=acme/backend-monorepo&environment=production
 */

import { NextRequest, NextResponse } from 'next/server';
import { listRepoRegistrations } from '@/lib/version-registry/s3-storage';
import type { VersionLatestResponse } from '@/lib/version-registry/types';

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
 * Get the latest version registration for a repository
 *
 * Flow:
 * 1. Extract customerId from query parameters
 * 2. Optionally extract serviceName and environment filters
 * 3. Query S3 for all registrations under version-registry/{owner}/{repo}/
 * 4. Filter by serviceName/environment if specified
 * 5. Sort by deployedAt descending
 * 6. Return the most recent registration
 *
 * Success response (200):
 * {
 *   "success": true,
 *   "registration": {
 *     "customerId": "acme/backend-monorepo",
 *     "serviceName": "payment-api",
 *     "version": "v1.2.3",
 *     "gitSHA": "abc123def456...",
 *     "environment": "production",
 *     "deployedAt": "2026-02-07T03:51:30.197Z",
 *     ...
 *   }
 * }
 *
 * No registrations found (200):
 * {
 *   "success": true,
 *   "registration": null
 * }
 *
 * Error response (400/500):
 * {
 *   "success": false,
 *   "registration": null,
 *   "error": "Error message"
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const customerId = searchParams.get('customerId');
    const serviceName = searchParams.get('serviceName');
    const environment = searchParams.get('environment');

    // Validate required parameter
    if (!customerId) {
      return addCorsHeaders(
        NextResponse.json(
          {
            success: false,
            registration: null,
            error: 'Missing required query parameter: customerId',
          } satisfies VersionLatestResponse,
          { status: 400 }
        )
      );
    }

    console.log('[Version Registry] Latest request:', {
      customerId,
      serviceName,
      environment,
    });

    // List all registrations for this repository
    let registrations = await listRepoRegistrations(customerId);

    // Apply optional filters
    if (serviceName) {
      registrations = registrations.filter((r) => r.serviceName === serviceName);
    }
    if (environment) {
      registrations = registrations.filter((r) => r.environment === environment);
    }

    // Sort by deployedAt descending to get the latest
    registrations.sort((a, b) => {
      const dateA = new Date(a.deployedAt).getTime();
      const dateB = new Date(b.deployedAt).getTime();
      return dateB - dateA;
    });

    const latest = registrations[0] || null;

    console.log('[Version Registry] Latest result:', {
      customerId,
      serviceName,
      environment,
      found: !!latest,
      version: latest?.version,
    });

    const response: VersionLatestResponse = {
      success: true,
      registration: latest,
    };

    return addCorsHeaders(
      NextResponse.json(response, {
        status: 200,
        headers: {
          // Short cache - latest can change with new deployments
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        },
      })
    );
  } catch (error) {
    console.error('[Version Registry] Latest error:', error);

    return addCorsHeaders(
      NextResponse.json(
        {
          success: false,
          registration: null,
          error: 'Internal server error during latest lookup',
        } satisfies VersionLatestResponse,
        { status: 500 }
      )
    );
  }
}
