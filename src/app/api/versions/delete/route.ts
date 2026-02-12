/**
 * DELETE /api/versions/delete
 *
 * Deletes a version registration from the version registry.
 * Only versions with no stored traces should be deleted.
 *
 * Query parameters:
 * - customerId: Repository in format "owner/repo"
 * - serviceName: Service name
 * - version: Version string
 * - environment: Environment (defaults to "production")
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteVersionRegistration } from '@/lib/version-registry/s3-storage';

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
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
 * Delete a version registration
 *
 * Flow:
 * 1. Extract parameters from query string
 * 2. Validate required fields
 * 3. Delete from S3
 * 4. Return success response
 *
 * Success response (200):
 * {
 *   "success": true,
 *   "message": "Version deleted successfully"
 * }
 *
 * Not found response (404):
 * {
 *   "success": false,
 *   "error": "Version not found"
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const serviceName = searchParams.get('serviceName');
    const version = searchParams.get('version');
    const environment = searchParams.get('environment') || 'production';

    console.log('[Version Delete] Request:', { customerId, serviceName, version, environment });

    // Validate required fields
    if (!customerId || !serviceName || !version) {
      return addCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Missing required fields: customerId, serviceName, version',
          },
          { status: 400 }
        )
      );
    }

    // Delete from S3
    const deleted = await deleteVersionRegistration({
      customerId,
      serviceName,
      version,
      environment,
    });

    if (!deleted) {
      return addCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Version not found',
          },
          { status: 404 }
        )
      );
    }

    console.log('[Version Delete] Success:', { customerId, serviceName, version });

    return addCorsHeaders(
      NextResponse.json(
        {
          success: true,
          message: 'Version deleted successfully',
        },
        { status: 200 }
      )
    );
  } catch (error) {
    console.error('[Version Delete] Error:', error);

    return addCorsHeaders(
      NextResponse.json(
        {
          success: false,
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    );
  }
}
