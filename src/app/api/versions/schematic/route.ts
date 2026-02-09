/**
 * GET /api/versions/schematic
 *
 * Retrieves a schematic (CanvasDiscoveryResult) from the version registry.
 * Schematics contain all canvases, workflows, and test traces for a specific
 * service version at a particular commit.
 *
 * Query parameters:
 * - repositoryUrl: GitHub repository URL (e.g., "https://github.com/owner/repo")
 * - commitSha: Full or short git commit SHA
 *
 * Returns:
 * - 200: Schematic found, returns CanvasDiscoveryResult JSON
 * - 404: Schematic not found for the specified repository/commit
 * - 400: Missing or invalid query parameters
 * - 500: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchematic } from '@/lib/version-registry/s3-storage';

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
 * Retrieve a schematic from the version registry
 *
 * Flow:
 * 1. Validate query parameters (repositoryUrl, commitSha)
 * 2. Fetch schematic from S3 storage
 * 3. Return schematic JSON or 404 if not found
 *
 * Example:
 * GET /api/versions/schematic?repositoryUrl=https://github.com/acme/backend&commitSha=abc123
 *
 * Response (CanvasDiscoveryResult):
 * {
 *   "canvases": [...],
 *   "storyboards": [
 *     {
 *       "id": "checkout-flow",
 *       "name": "Checkout Flow",
 *       "canvas": {...},
 *       "workflows": [...]
 *     }
 *   ],
 *   "testTraces": [...]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repositoryUrl = searchParams.get('repositoryUrl');
    const commitSha = searchParams.get('commitSha');

    // Validate required parameters
    if (!repositoryUrl) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: 'Missing required parameter: repositoryUrl',
            message: 'Repository URL must be provided (e.g., https://github.com/owner/repo)',
          },
          { status: 400 }
        )
      );
    }

    if (!commitSha) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: 'Missing required parameter: commitSha',
            message: 'Commit SHA must be provided (full or short SHA)',
          },
          { status: 400 }
        )
      );
    }

    console.log('[Schematic API] Fetching schematic:', {
      repositoryUrl,
      commitSha,
    });

    // Fetch schematic from S3
    const schematic = await getSchematic(repositoryUrl, commitSha);

    if (!schematic) {
      console.log('[Schematic API] Schematic not found:', {
        repositoryUrl,
        commitSha,
      });

      return addCorsHeaders(
        NextResponse.json(
          {
            error: 'Schematic not found',
            message: `No schematic found for repository ${repositoryUrl} at commit ${commitSha}`,
            repositoryUrl,
            commitSha,
          },
          { status: 404 }
        )
      );
    }

    // Log schematic info (schematic is typed as unknown from storage)
    const schematicData = schematic as {
      canvases?: unknown[];
      storyboards?: Array<{ workflows?: unknown[] }>;
    } | null;
    const workflowCount = schematicData?.storyboards?.reduce(
      (sum, sb) => sum + (sb.workflows?.length || 0),
      0
    ) || 0;
    console.log('[Schematic API] Schematic found:', {
      repositoryUrl,
      commitSha,
      canvasCount: schematicData?.canvases?.length || 0,
      storyboardCount: schematicData?.storyboards?.length || 0,
      workflowCount,
    });

    // Return the schematic with caching headers
    return addCorsHeaders(
      NextResponse.json(schematic, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600, immutable', // Cache for 1 hour - schematics are immutable by commit
        },
      })
    );
  } catch (error) {
    console.error('[Schematic API] Error fetching schematic:', error);

    return addCorsHeaders(
      NextResponse.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
        { status: 500 }
      )
    );
  }
}
