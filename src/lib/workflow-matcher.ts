/**
 * Workflow Matching Utility
 *
 * Matches OTEL traces against versioned workflows from the version registry.
 * Fetches schematics for the trace's service version and matches trace events
 * against workflow scenario conditions.
 */

import type { TraceInfo } from '@industry-theme/principal-view-panels';

// Workflow types (extracted from CanvasDiscoveryResult structure)
interface WorkflowScenario {
  id: string;
  priority?: number;
  condition?: {
    requires?: string[];
    assertions?: Record<string, unknown>;
    default?: boolean;
  };
  template?: {
    summary?: string;
    events?: Record<string, string>;
  };
}

interface WorkflowData {
  id?: string;
  name?: string;
  canvasPath?: string;
  scenarios?: WorkflowScenario[];
  // Scenarios may be in content field (DiscoveredWorkflowWithContent)
  content?: {
    canvas?: string;
    scenarios?: WorkflowScenario[];
    [key: string]: unknown;
  };
}

// Storyboard type from CanvasDiscoveryResult
interface Storyboard {
  id: string;
  name: string;
  path: string;
  canvas: {
    path: string;
    [key: string]: unknown;
  };
  workflows: WorkflowData[];
}

// Schematic type (CanvasDiscoveryResult structure)
interface Schematic {
  canvases?: unknown[];
  storyboards?: Storyboard[];
  testTraces?: unknown[];
  errors?: Array<{ path: string; error: string }>;
  warnings?: Array<{ path: string; message: string; type: string }>;
  [key: string]: unknown;
}

/**
 * Fetch schematic from version registry for a specific version
 */
async function fetchSchematic(
  repositoryUrl: string,
  commitSha: string
): Promise<Schematic | null> {
  try {
    const url = new URL('/api/versions/schematic', window.location.origin);
    url.searchParams.set('repositoryUrl', repositoryUrl);
    url.searchParams.set('commitSha', commitSha);

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[WorkflowMatcher] No schematic found for:', {
          repositoryUrl,
          commitSha,
        });
        return null;
      }
      throw new Error(`Failed to fetch schematic: ${response.statusText}`);
    }

    const schematic = await response.json();
    return schematic as Schematic;
  } catch (error) {
    console.error('[WorkflowMatcher] Error fetching schematic:', error);
    return null;
  }
}

/**
 * Match a trace against workflow scenarios
 *
 * For now, this is a simple implementation that:
 * 1. Finds workflows in the schematic
 * 2. Matches trace events against scenario required events
 * 3. Returns the first matching workflow/scenario
 *
 * TODO: Implement full scenario condition matching (assertions, etc.)
 */
function matchTraceAgainstWorkflows(
  trace: TraceInfo,
  workflows: WorkflowData[]
): TraceInfo['matchedWorkflow'] {
  // Get all events from trace spans
  const traceEventNames = new Set<string>();
  for (const span of trace.spans) {
    if (span.events) {
      for (const event of span.events) {
        traceEventNames.add(event.name);
      }
    }
  }

  console.log('[WorkflowMatcher] Matching trace:', {
    traceId: trace.traceId.substring(0, 8),
    rootSpan: trace.rootSpan?.name,
    eventNames: Array.from(traceEventNames),
    workflowCount: workflows.length,
  });

  // Try to match against each workflow
  for (const workflow of workflows) {
    // Scenarios may be at top level or in content field
    const scenarios = workflow.scenarios || workflow.content?.scenarios;

    if (!scenarios || scenarios.length === 0) {
      continue;
    }

    // Try each scenario in priority order
    const sortedScenarios = [...scenarios].sort(
      (a, b) => (a.priority || 999) - (b.priority || 999)
    );

    for (const scenario of sortedScenarios) {
      // Check if all required events are present
      const requiredEvents = scenario.condition?.requires || [];
      const allRequiredPresent = requiredEvents.every((eventName) =>
        traceEventNames.has(eventName)
      );

      console.log('[WorkflowMatcher] Checking scenario:', {
        workflow: workflow.name,
        scenarioId: scenario.id,
        requiredEvents,
        traceEvents: Array.from(traceEventNames),
        matched: allRequiredPresent,
      });

      if (allRequiredPresent) {
        // Found a match!
        console.log('[WorkflowMatcher] ✓ Match found!');
        return {
          storyboardId: workflow.canvasPath || '',
          storyboardName: workflow.name || 'Unknown Workflow',
          workflowId: workflow.id,
          workflowName: workflow.name,
          scenarioId: scenario.id,
          scenarioName: scenario.id, // TODO: get scenario name from template
        };
      }
    }
  }

  return undefined;
}

/**
 * Enrich traces with workflow matching from version registry
 *
 * For each trace:
 * 1. Check if it has version info (repositoryUrl, commitSha)
 * 2. Fetch schematic for that version from version registry
 * 3. Match trace against workflows in schematic
 * 4. Add matchedWorkflow info to trace
 *
 * Traces without version info are returned unchanged.
 * Caches schematics to avoid redundant fetches.
 */
export async function enrichTracesWithWorkflowMatching(
  traces: TraceInfo[]
): Promise<TraceInfo[]> {
  if (traces.length === 0) {
    return traces;
  }

  console.log('[WorkflowMatcher] Starting enrichment:', {
    totalTraces: traces.length,
    sampleTrace: traces[0] ? {
      traceId: traces[0].traceId.substring(0, 8),
      serviceName: traces[0].serviceName,
      serviceVersion: traces[0].serviceVersion,
      repositoryUrl: traces[0].repositoryUrl,
      commitSha: traces[0].commitSha,
    } : null,
  });

  // Group traces by version (repositoryUrl + commitSha)
  const tracesByVersion = new Map<string, TraceInfo[]>();
  const tracesWithoutVersion: TraceInfo[] = [];

  for (const trace of traces) {
    if (trace.repositoryUrl && trace.commitSha) {
      const versionKey = `${trace.repositoryUrl}@${trace.commitSha}`;
      if (!tracesByVersion.has(versionKey)) {
        tracesByVersion.set(versionKey, []);
      }
      tracesByVersion.get(versionKey)!.push(trace);
    } else {
      // Trace doesn't have version info - keep as is
      tracesWithoutVersion.push(trace);
    }
  }

  console.log('[WorkflowMatcher] Grouped traces:', {
    withVersion: tracesByVersion.size,
    withoutVersion: tracesWithoutVersion.length,
    versions: Array.from(tracesByVersion.keys()),
  });

  // Fetch schematics and match traces for each version
  const enrichedTraces: TraceInfo[] = [...tracesWithoutVersion];

  for (const [versionKey, versionTraces] of tracesByVersion) {
    const parts = versionKey.split('@');
    const repositoryUrl = parts[0];
    const commitSha = parts[1];

    // Safety check - should never happen given how we build versionKey
    if (!repositoryUrl || !commitSha) {
      console.warn('[WorkflowMatcher] Invalid version key:', versionKey);
      enrichedTraces.push(...versionTraces);
      continue;
    }

    console.log('[WorkflowMatcher] Fetching schematic for version:', {
      repositoryUrl,
      commitSha,
      traceCount: versionTraces.length,
    });

    // Fetch schematic for this version
    const schematic = await fetchSchematic(repositoryUrl, commitSha);

    if (!schematic || !schematic.storyboards || schematic.storyboards.length === 0) {
      console.log('[WorkflowMatcher] No storyboards found in schematic, skipping matching');
      enrichedTraces.push(...versionTraces);
      continue;
    }

    // Extract all workflows from all storyboards
    const allWorkflows: WorkflowData[] = [];
    for (const storyboard of schematic.storyboards) {
      if (storyboard.workflows && storyboard.workflows.length > 0) {
        // Add storyboard context to each workflow
        for (const workflow of storyboard.workflows) {
          allWorkflows.push({
            ...workflow,
            // Preserve canvasPath from workflow.content, workflow top-level, or fallback to storyboard canvas
            canvasPath:
              workflow.content?.canvas ||
              workflow.canvasPath ||
              storyboard.canvas.path,
          });
        }
      }
    }

    if (allWorkflows.length === 0) {
      console.log('[WorkflowMatcher] No workflows found in storyboards, skipping matching');
      enrichedTraces.push(...versionTraces);
      continue;
    }

    console.log('[WorkflowMatcher] Found workflows:', {
      storyboardCount: schematic.storyboards.length,
      workflowCount: allWorkflows.length,
      workflows: allWorkflows.map((w) => w.name || w.id),
    });

    // Match each trace against workflows
    for (const trace of versionTraces) {
      const matchedWorkflow = matchTraceAgainstWorkflows(trace, allWorkflows);

      if (matchedWorkflow) {
        console.log('[WorkflowMatcher] Matched trace to workflow:', {
          traceId: trace.traceId.substring(0, 8),
          workflow: matchedWorkflow.workflowName,
          scenario: matchedWorkflow.scenarioId,
        });
      }

      // Add matchedWorkflow to trace (or keep existing if already set)
      enrichedTraces.push({
        ...trace,
        matchedWorkflow: matchedWorkflow || trace.matchedWorkflow,
      });
    }
  }

  return enrichedTraces;
}
