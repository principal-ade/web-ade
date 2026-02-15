/**
 * POST /api/traces/enrich
 *
 * Server-side workflow matching endpoint that enriches OTEL traces with workflow scenario matches.
 * Uses the enhanced scenario matching from @principal-ai/principal-view-core v0.23.5+
 *
 * Request body:
 * {
 *   traces: TraceInfo[],           // Array of traces to enrich
 *   repositoryUrl: string,         // Repository URL for version lookup
 *   commitSha: string              // Commit SHA for version lookup
 * }
 *
 * Response:
 * {
 *   traces: EnrichedTraceInfo[],   // Traces with matchedWorkflows populated
 *   schematicFetched: boolean,     // Whether schematic was found
 *   workflowCount: number           // Number of workflows evaluated
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  selectScenario,
  type OtelEvent,
  type WorkflowMatch,
} from '@principal-ai/principal-view-core';
import type {
  CanvasDiscoveryResultWithContent,
  DiscoveredWorkflowWithContent,
} from '@principal-ai/principal-view-core';
import type { TraceInfo } from '@industry-theme/principal-view-panels';

interface EnrichRequest {
  traces: TraceInfo[];
  repositoryUrl: string;
  commitSha: string;
}

interface EnrichResponse {
  traces: TraceInfo[];
  schematicFetched: boolean;
  workflowCount: number;
}

/**
 * Fetch schematic from version registry
 */
async function fetchSchematic(
  repositoryUrl: string,
  commitSha: string,
  baseUrl: string
): Promise<CanvasDiscoveryResultWithContent | null> {
  try {
    const url = new URL('/api/versions/schematic', baseUrl);
    url.searchParams.set('repositoryUrl', repositoryUrl);
    url.searchParams.set('commitSha', commitSha);

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[Enrich API] No schematic found for:', {
          repositoryUrl,
          commitSha,
        });
        return null;
      }
      throw new Error(`Failed to fetch schematic: ${response.statusText}`);
    }

    const schematic = await response.json();
    return schematic as CanvasDiscoveryResultWithContent;
  } catch (error) {
    console.error('[Enrich API] Error fetching schematic:', error);
    return null;
  }
}

/**
 * Convert trace spans to OTEL events for scenario matching
 */
function traceToOtelEvents(trace: TraceInfo): OtelEvent[] {
  const events: OtelEvent[] = [];

  for (const span of trace.spans) {
    // Add span as event (attributes not needed for matching)
    events.push({
      name: span.name,
      timestamp: span.startTimeUnixNano,
      type: 'span',
      spanId: span.spanId,
      traceId: span.traceId,
      parentSpanId: span.parentSpanId,
    });

    // Add span events as OTEL events
    if (span.events) {
      for (const spanEvent of span.events) {
        events.push({
          name: spanEvent.name,
          timestamp: spanEvent.timeUnixNano,
          type: 'log',
          spanId: span.spanId,
          traceId: span.traceId,
          body: spanEvent.name,
        });
      }
    }
  }

  return events;
}

/**
 * Match trace against a single workflow using enhanced matching
 */
function matchTraceToWorkflow(
  trace: TraceInfo,
  workflow: DiscoveredWorkflowWithContent
): WorkflowMatch[] {
  const events = traceToOtelEvents(trace);

  // Use enhanced selectScenario from core library
  const matchResult = selectScenario(workflow.content, events);

  const matches: WorkflowMatch[] = [];

  // Add all full matches
  for (const fullMatch of matchResult.fullMatches) {
    matches.push({
      storyboardId: workflow.content.canvas,
      storyboardName: workflow.name || 'Unknown Workflow',
      workflowId: workflow.id,
      workflowName: workflow.name,
      scenarioId: fullMatch.scenario.id,
      scenarioName: fullMatch.scenario.description || fullMatch.scenario.id,
      matchedEventCount: fullMatch.matchedEventCount,
      matchedEventNames: fullMatch.matchedEventNames,
      matchPercentage: fullMatch.matchPercentage,
      isFullMatch: fullMatch.isFullMatch,
      missingEventNames: fullMatch.missingEventNames,
    });
  }

  // If no full matches, include top partial match
  if (matchResult.fullMatches.length === 0 && matchResult.recommendedScenario) {
    const partialMatch = matchResult.recommendedScenario;
    matches.push({
      storyboardId: workflow.content.canvas,
      storyboardName: workflow.name || 'Unknown Workflow',
      workflowId: workflow.id,
      workflowName: workflow.name,
      scenarioId: partialMatch.scenario.id,
      scenarioName: partialMatch.scenario.description || partialMatch.scenario.id,
      matchedEventCount: partialMatch.matchedEventCount,
      matchedEventNames: partialMatch.matchedEventNames,
      matchPercentage: partialMatch.matchPercentage,
      isFullMatch: partialMatch.isFullMatch,
      missingEventNames: partialMatch.missingEventNames,
    });
  }

  return matches;
}

/**
 * Enrich traces with workflow matching data
 */
async function enrichTraces(
  traces: TraceInfo[],
  repositoryUrl: string,
  commitSha: string,
  baseUrl: string
): Promise<EnrichResponse> {
  console.log('[Enrich API] Starting enrichment:', {
    traceCount: traces.length,
    repositoryUrl,
    commitSha,
  });

  // Fetch schematic for the version
  const schematic = await fetchSchematic(repositoryUrl, commitSha, baseUrl);

  if (!schematic || !schematic.storyboards || schematic.storyboards.length === 0) {
    console.log('[Enrich API] No schematic found, returning traces as-is');
    return {
      traces,
      schematicFetched: false,
      workflowCount: 0,
    };
  }

  // Extract workflows from storyboards (filter for workflows with content)
  const workflows = schematic.storyboards
    .flatMap((sb) => sb.workflows || [])
    .filter((w): w is DiscoveredWorkflowWithContent => 'content' in w);

  if (workflows.length === 0) {
    console.log('[Enrich API] No workflows found in schematic');
    return {
      traces,
      schematicFetched: true,
      workflowCount: 0,
    };
  }

  console.log('[Enrich API] Matching traces against workflows:', {
    workflowCount: workflows.length,
    workflows: workflows.map((w) => w.name || w.id),
  });

  // Enrich each trace
  const enrichedTraces = traces.map((trace) => {
    const allMatches: WorkflowMatch[] = [];

    for (const workflow of workflows) {
      const workflowMatches = matchTraceToWorkflow(trace, workflow);
      allMatches.push(...workflowMatches);
    }

    if (allMatches.length > 0) {
      console.log('[Enrich API] Matched trace:', {
        traceId: trace.traceId.substring(0, 8),
        matchCount: allMatches.length,
        workflows: allMatches.map((m) => `${m.workflowName}/${m.scenarioId} (${m.matchPercentage}%)`),
      });
    }

    return {
      ...trace,
      matchedWorkflows: allMatches.length > 0 ? allMatches : trace.matchedWorkflows,
    };
  });

  return {
    traces: enrichedTraces,
    schematicFetched: true,
    workflowCount: workflows.length,
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

    // Get base URL from request
    const baseUrl = new URL(request.url).origin;

    // Enrich traces
    const result = await enrichTraces(traces, repositoryUrl, commitSha, baseUrl);

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
