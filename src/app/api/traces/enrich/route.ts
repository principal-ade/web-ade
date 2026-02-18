/**
 * POST /api/traces/enrich
 *
 * @deprecated This endpoint is largely redundant now that traces are converted to RegisteredTrace
 * on the otel-collection-server with registry matching already performed. RegisteredTrace includes
 * matchInfo with server-side registry matching results.
 *
 * Server-side workflow matching endpoint that enriches OTEL traces with workflow scenario matches.
 * Uses the enhanced scenario matching from @principal-ai/principal-view-core v0.23.5+
 *
 * Request body:
 * {
 *   traces: RegisteredTrace[],     // Array of traces to enrich
 *   repositoryUrl: string,          // Repository URL for version lookup
 *   commitSha: string               // Commit SHA for version lookup
 * }
 *
 * Response:
 * {
 *   traces: RegisteredTrace[],      // Traces (already enriched from server)
 *   schematicFetched: boolean,      // Whether schematic was found
 *   workflowCount: number            // Number of workflows evaluated
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { RegisteredTrace } from '@principal-ai/principal-view-core';

interface EnrichRequest {
  traces: RegisteredTrace[];
  repositoryUrl: string;
  commitSha: string;
}

interface EnrichResponse {
  traces: RegisteredTrace[];
  schematicFetched: boolean;
  workflowCount: number;
}

/**
 * Enrich traces with workflow matching data
 */
async function enrichTraces(
  traces: RegisteredTrace[],
  repositoryUrl: string,
  commitSha: string
): Promise<EnrichResponse> {
  console.log('[Enrich API] Skipping enrichment - RegisteredTrace already includes matching info:', {
    traceCount: traces.length,
    repositoryUrl,
    commitSha,
    sampleStatus: traces[0]?.registryStatus,
    sampleMatchInfo: traces[0]?.matchInfo,
  });

  // RegisteredTrace already includes server-side matching via matchInfo
  // No additional enrichment needed
  return {
    traces,
    schematicFetched: false,
    workflowCount: 0,
  };
}

/**
 * POST handler for trace enrichment
 */
export async function POST(request: NextRequest) {
  try {
    const body: EnrichRequest = await request.json();

    const { traces, repositoryUrl, commitSha } = body;

    if (!traces || !Array.isArray(traces)) {
      return NextResponse.json(
        { error: 'Invalid request: traces must be an array' },
        { status: 400 }
      );
    }

    if (!repositoryUrl || !commitSha) {
      return NextResponse.json(
        { error: 'Invalid request: repositoryUrl and commitSha are required' },
        { status: 400 }
      );
    }

    // Enrich traces
    const result = await enrichTraces(traces, repositoryUrl, commitSha);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('[Enrich API] Error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
