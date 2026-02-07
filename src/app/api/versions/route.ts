/**
 * POST /api/versions
 *
 * Registers a new version-to-commit mapping for the version registry.
 * Maps customer version strings (semver, git SHA, build numbers) to git commit SHAs.
 *
 * Used by CI/CD pipelines to register deployments and enable contract-based
 * observability.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  registerVersion,
  validateRegistrationRequest,
} from '@/lib/version-registry/version-manager';
import type {
  VersionRegistrationRequest,
  VersionRegistrationResponse,
} from '@/lib/version-registry/types';

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
 * Register a new version
 *
 * Flow:
 * 1. Validate request body
 * 2. Extract customerId from repositoryUrl (owner/repo format)
 * 3. Store registration to S3
 * 4. (Future) Fetch schematic from GitHub
 * 5. Return success response with registration ID
 *
 * Request body:
 * {
 *   "serviceName": "payment-api",
 *   "version": "v1.2.3",
 *   "gitSHA": "abc123def456...",
 *   "repositoryUrl": "https://github.com/acme/backend-monorepo",
 *   "environment": "production",  // optional, defaults to "production"
 *   "gitRef": "refs/tags/v1.2.3", // optional
 *   "deployedBy": "github-actions", // optional
 *   "metadata": { ... }  // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "registrationId": "version-registry/acme/backend-monorepo/payment-api/v1.2.3/production.json",
 *   "schematicLoaded": false,
 *   "message": "Version registered successfully"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VersionRegistrationRequest;

    console.log('[Version Registry] Registration request:', {
      serviceName: body.serviceName,
      version: body.version,
      repositoryUrl: body.repositoryUrl,
      environment: body.environment || 'production',
    });

    // Validate request body
    const validationError = validateRegistrationRequest(body);
    if (validationError) {
      return addCorsHeaders(
        NextResponse.json(
          {
            success: false,
            registrationId: '',
            message: validationError,
          },
          { status: 400 }
        )
      );
    }

    // Register the version
    const result: VersionRegistrationResponse = await registerVersion(body);

    if (!result.success) {
      return addCorsHeaders(
        NextResponse.json(result, { status: 400 })
      );
    }

    console.log('[Version Registry] Registration successful:', {
      registrationId: result.registrationId,
      serviceName: body.serviceName,
      version: body.version,
    });

    return addCorsHeaders(
      NextResponse.json(result, {
        status: 201,
        headers: {
          'Cache-Control': 'no-cache', // Don't cache registration responses
        },
      })
    );
  } catch (error) {
    console.error('[Version Registry] Registration error:', error);

    return addCorsHeaders(
      NextResponse.json(
        {
          success: false,
          registrationId: '',
          message: 'Internal server error during registration',
        },
        { status: 500 }
      )
    );
  }
}
