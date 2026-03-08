/**
 * GET /api/versions/lookup
 *
 * Looks up a version-to-commit mapping from the version registry.
 * Returns the git commit SHA and deployment information for a given version.
 *
 * Query parameters:
 * - customerId: Repository in format "owner/repo" (e.g., "acme/backend-monorepo")
 * - serviceName: Service name (e.g., "payment-api")
 * - version: Version string (e.g., "v1.2.3")
 * - environment: Environment (optional, defaults to "production")
 *
 * Example:
 * GET /api/versions/lookup?customerId=acme/backend-monorepo&serviceName=payment-api&version=v1.2.3
 *
 * @otel canvas: .principal-views/version-registry/version-registry.otel.canvas
 * @otel workflow: .principal-views/version-registry/lookup/lookup.workflow.json
 * @otel span: api.version-registry.lookup
 */

import { NextRequest, NextResponse } from 'next/server';
import { trace } from '@opentelemetry/api';
import { lookupVersion } from '@/lib/version-registry/version-manager';
import type {
  VersionLookupRequest,
  VersionLookupResponse,
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
 * Lookup a version mapping
 *
 * Flow:
 * 1. Extract query parameters
 * 2. Validate required parameters
 * 3. Query S3 for version registration
 * 4. Return registration data or 404 if not found
 *
 * Success response (200):
 * {
 *   "found": true,
 *   "registration": {
 *     "customerId": "acme/backend-monorepo",
 *     "serviceName": "payment-api",
 *     "version": "v1.2.3",
 *     "gitSHA": "abc123def456...",
 *     "repositoryUrl": "https://github.com/acme/backend-monorepo",
 *     "environment": "production",
 *     "deployedAt": "2026-02-06T10:00:00Z",
 *     ...
 *   }
 * }
 *
 * Not found response (404):
 * {
 *   "found": false,
 *   "error": "Version not found"
 * }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const span = tracer.startSpan('api.version-registry.lookup');

  try {
    const { searchParams } = new URL(request.url);

    const customerId = searchParams.get('customerId');
    const serviceName = searchParams.get('serviceName');
    const version = searchParams.get('version');
    const environment = searchParams.get('environment') || 'production';

    // Emit: version.lookup.started
    span.addEvent('version.lookup.started', {
      'customer.id': customerId || '',
      'service.name': serviceName || '',
      'version': version || '',
      'environment': environment,
    });

    // Validate required parameters
    if (!customerId || !serviceName || !version) {
      // Emit: version.lookup.error
      span.addEvent('version.lookup.error', {
        'error.type': 'ValidationError',
        'error.message': 'Missing required query parameters: customerId, serviceName, version',
        'error.stage': 'validation',
      });
      span.end();

      return addCorsHeaders(
        NextResponse.json(
          {
            found: false,
            error: 'Missing required query parameters: customerId, serviceName, version',
          },
          { status: 400 }
        )
      );
    }

    console.log('[Version Registry] Lookup request:', {
      customerId,
      serviceName,
      version,
      environment,
    });

    // Lookup the version
    const lookupRequest: VersionLookupRequest = {
      customerId,
      serviceName,
      version,
      environment,
    };

    const result: VersionLookupResponse = await lookupVersion(lookupRequest, span);

    if (!result.found) {
      console.log('[Version Registry] Version not found:', {
        customerId,
        serviceName,
        version,
        environment,
      });

      // Emit: version.lookup.not_found (if not already emitted by s3-storage)
      span.addEvent('version.lookup.not_found', {
        'customer.id': customerId,
        'service.name': serviceName,
        'version': version,
      });
      span.end();

      return addCorsHeaders(
        NextResponse.json(
          {
            found: false,
            error: result.error || 'Version not found',
          },
          { status: 404 }
        )
      );
    }

    console.log('[Version Registry] Lookup successful:', {
      customerId,
      serviceName,
      version,
      gitSHA: result.registration?.gitSHA,
    });

    // Emit: version.lookup.complete
    span.addEvent('version.lookup.complete', {
      'git.sha': result.registration?.gitSHA || '',
      'duration.ms': Date.now() - startTime,
    });
    span.end();

    return addCorsHeaders(
      NextResponse.json(result, {
        status: 200,
        headers: {
          // Cache successful lookups for 1 hour (versions are immutable)
          'Cache-Control': 'public, max-age=3600',
        },
      })
    );
  } catch (error) {
    console.error('[Version Registry] Lookup error:', error);

    // Emit: version.lookup.error
    span.addEvent('version.lookup.error', {
      'error.type': error instanceof Error ? error.name : 'UnknownError',
      'error.message': error instanceof Error ? error.message : String(error),
      'error.stage': 'unknown',
    });
    span.end();

    return addCorsHeaders(
      NextResponse.json(
        {
          found: false,
          error: 'Internal server error during lookup',
        },
        { status: 500 }
      )
    );
  }
}
