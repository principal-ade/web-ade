/**
 * Workflow Matching Utility
 *
 * Matches OTEL traces against versioned workflows from the version registry.
 * Fetches schematics for the trace's service version and matches trace events
 * against workflow scenario conditions.
 */

import type { TraceInfo, WorkflowMatch } from '@industry-theme/principal-view-panels';
import type {
  CanvasDiscoveryResultWithContent,
  DiscoveredWorkflow,
  DiscoveredWorkflowWithContent,
} from '@principal-ai/principal-view-core';
import { getRequiredEvents } from '@principal-ai/principal-view-core';

/**
 * Fetch schematic from version registry for a specific version
 */
async function fetchSchematic(
  repositoryUrl: string,
  commitSha: string
): Promise<CanvasDiscoveryResultWithContent | null> {
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
    return schematic as CanvasDiscoveryResultWithContent;
  } catch (error) {
    console.error('[WorkflowMatcher] Error fetching schematic:', error);
    return null;
  }
}

/**
 * Match a trace against workflow scenarios
 *
 * This implementation:
 * 1. Finds workflows in the schematic
 * 2. Matches trace events against scenario required events
 * 3. Returns ALL matching workflow/scenario combinations
 *
 * TODO: Implement full scenario condition matching (assertions, etc.)
 */
function matchTraceAgainstWorkflows(
  trace: TraceInfo,
  workflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[]
): WorkflowMatch[] {
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

  const matches: WorkflowMatch[] = [];

  // Try to match against each workflow
  for (const workflow of workflows) {
    // Type guard: only DiscoveredWorkflowWithContent has content.scenarios
    if (!('content' in workflow)) {
      continue;
    }

    const scenarios = workflow.content.scenarios;
    if (!scenarios || scenarios.length === 0) {
      continue;
    }

    // Separate catch-all scenarios (no required events) from regular scenarios
    const regularScenarios = scenarios.filter((s) => getRequiredEvents(s).length > 0);
    const catchAllScenarios = scenarios.filter((s) => getRequiredEvents(s).length === 0);

    // Try regular scenarios first, in priority order
    const sortedRegularScenarios = [...regularScenarios].sort(
      (a, b) => (a.priority || 999) - (b.priority || 999)
    );

    let matchedInWorkflow = false;

    for (const scenario of sortedRegularScenarios) {
      // Check if all required events are present
      const requiredEvents = getRequiredEvents(scenario);

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
        matches.push({
          storyboardId: workflow.content.canvas,
          storyboardName: workflow.name || 'Unknown Workflow',
          workflowId: workflow.id,
          workflowName: workflow.name,
          scenarioId: scenario.id,
          scenarioName: scenario.id, // TODO: get scenario name from template
          matchedEventCount: requiredEvents.length,
          matchedEventNames: requiredEvents,
        });
        matchedInWorkflow = true;
        // Continue checking other scenarios in this workflow
      }
    }

    // If no regular scenario matched, try catch-all scenarios
    // But only if trace has at least one event from this workflow's domain
    if (!matchedInWorkflow && catchAllScenarios.length > 0) {
      // Collect all possible events from regular scenarios to determine workflow domain
      const workflowDomainEvents = new Set<string>();
      for (const scenario of regularScenarios) {
        const requiredEvents = getRequiredEvents(scenario);
        requiredEvents.forEach((event) => workflowDomainEvents.add(event));
      }

      // Check if trace has ANY event from this workflow's domain
      const hasWorkflowEvents = Array.from(workflowDomainEvents).some((event) =>
        traceEventNames.has(event)
      );

      if (hasWorkflowEvents) {
        const sortedCatchAllScenarios = [...catchAllScenarios].sort(
          (a, b) => (a.priority || 999) - (b.priority || 999)
        );

        console.log('[WorkflowMatcher] No specific scenario matched, using catch-all:', {
          workflow: workflow.name,
          scenarioId: sortedCatchAllScenarios[0]?.id,
          workflowDomainEvents: Array.from(workflowDomainEvents),
          traceEvents: Array.from(traceEventNames),
        });

        matches.push({
          storyboardId: workflow.content.canvas,
          storyboardName: workflow.name || 'Unknown Workflow',
          workflowId: workflow.id,
          workflowName: workflow.name,
          scenarioId: sortedCatchAllScenarios[0]!.id,
          scenarioName: sortedCatchAllScenarios[0]!.id,
          matchedEventCount: 0,
        });
      }
    }
  }

  return matches;
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
    const allWorkflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[] =
      schematic.storyboards.flatMap(storyboard => storyboard.workflows || []);

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
      const matchedWorkflows = matchTraceAgainstWorkflows(trace, allWorkflows);

      if (matchedWorkflows.length > 0) {
        console.log('[WorkflowMatcher] Matched trace to workflows:', {
          traceId: trace.traceId.substring(0, 8),
          matchCount: matchedWorkflows.length,
          workflows: matchedWorkflows.map(m => `${m.workflowName}/${m.scenarioId}`),
        });
      }

      // Add matchedWorkflows to trace (or keep existing if already set)
      enrichedTraces.push({
        ...trace,
        matchedWorkflows: matchedWorkflows.length > 0 ? matchedWorkflows : trace.matchedWorkflows,
      });
    }
  }

  return enrichedTraces;
}
