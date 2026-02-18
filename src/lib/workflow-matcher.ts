/**
 * Workflow Matching Utility
 *
 * Matches OTEL traces against versioned workflows from the version registry.
 * Fetches schematics for the trace's service version and matches trace events
 * against workflow scenario conditions.
 *
 * @deprecated This client-side matching is largely redundant now that RegisteredTrace
 * includes server-side registry matching. Consider using the matchInfo from RegisteredTrace instead.
 */

import type { RegisteredTrace } from '@industry-theme/principal-view-panels';
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
  traces: RegisteredTrace[]
): Promise<RegisteredTrace[]> {
  if (traces.length === 0) {
    return traces;
  }

  console.log('[WorkflowMatcher] Starting enrichment:', {
    totalTraces: traces.length,
    sampleTrace: traces[0] ? {
      traceId: traces[0].traceId.substring(0, 8),
      serviceName: traces[0].serviceName,
      registryStatus: traces[0].registryStatus,
      schemaVersion: traces[0].matchInfo?.schemaVersion,
    } : null,
  });

  // Note: RegisteredTrace already includes server-side matching via matchInfo
  // This function adds additional client-side matching if needed
  console.warn('[WorkflowMatcher] enrichTracesWithWorkflowMatching is deprecated - RegisteredTrace already includes matching info');

  // For now, just return traces as-is since they already have matching info
  // If additional client-side matching is needed, implement it here
  return traces;
}
