/**
 * POST /api/versions
 *
 * Registers a new version-to-commit mapping for the version registry.
 * Maps customer version strings (semver, git SHA, build numbers) to git commit SHAs.
 *
 * Used by CI/CD pipelines to register deployments and enable contract-based
 * observability.
 *
 * @otel canvas: .principal-views/version-registry/version-registry.otel.canvas
 * @otel workflow: .principal-views/version-registry/registration/registration.workflow.json
 * @otel span: api.version-registry.register
 */

import { NextRequest, NextResponse } from 'next/server';
import { trace } from '@opentelemetry/api';
import {
  registerVersion,
  validateRegistrationRequest,
} from '@/lib/version-registry/version-manager';
import type {
  VersionRegistrationRequest,
  VersionRegistrationResponse,
} from '@/lib/version-registry/types';

// Get tracer for version registry
const tracer = trace.getTracer('version-registry', '1.0.0');

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
  const startTime = Date.now();
  const span = tracer.startSpan('api.version-registry.register');

  try {
    const body = (await request.json()) as VersionRegistrationRequest;

    // Emit: version.registration.started
    span.addEvent('version.registration.started', {
      'service.name': body.serviceName || '',
      'version': body.version || '',
      'repository.url': body.repositoryUrl || '',
      'environment': body.environment || 'production',
      'git.sha': body.gitSHA || '',
    });

    console.log('[Version Registry] Registration request:', {
      serviceName: body.serviceName,
      version: body.version,
      repositoryUrl: body.repositoryUrl,
      environment: body.environment || 'production',
    });

    // Validate request body
    const validationError = validateRegistrationRequest(body);
    if (validationError) {
      // Emit: version.registration.error
      span.addEvent('version.registration.error', {
        'error.type': 'ValidationError',
        'error.message': validationError,
        'error.stage': 'validation',
        'service.name': body.serviceName || '',
        'version': body.version || '',
      });
      span.end();

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

    // Extract GitHub token from Authorization header (for GitHub Actions / CI)
    const authHeader = request.headers.get('authorization');
    const githubToken = authHeader?.replace(/^Bearer\s+/i, '');

    // Register the version (pass span for instrumentation, githubToken for schematic fetching)
    const result: VersionRegistrationResponse = await registerVersion(body, undefined, githubToken, span);

    if (!result.success) {
      // Emit: version.registration.error
      span.addEvent('version.registration.error', {
        'error.type': 'RegistrationError',
        'error.message': result.message || 'Registration failed',
        'error.stage': 'registration',
        'service.name': body.serviceName,
        'version': body.version,
      });
      span.end();

      return addCorsHeaders(
        NextResponse.json(result, { status: 400 })
      );
    }

    console.log('[Version Registry] Registration successful:', {
      registrationId: result.registrationId,
      serviceName: body.serviceName,
      version: body.version,
    });

    // Emit: version.registration.complete or version.registration.complete-no-schematic
    if (result.schematicLoaded) {
      span.addEvent('version.registration.complete', {
        'registration.id': result.registrationId,
        'schematic.id': result.schematicId || '',
        'duration.ms': Date.now() - startTime,
      });
    } else {
      span.addEvent('version.registration.complete-no-schematic', {
        'registration.id': result.registrationId,
        'duration.ms': Date.now() - startTime,
      });
    }
    span.end();

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

    // Emit: version.registration.error
    span.addEvent('version.registration.error', {
      'error.type': error instanceof Error ? error.name : 'UnknownError',
      'error.message': error instanceof Error ? error.message : String(error),
      'error.stage': 'unknown',
    });
    span.end();

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
