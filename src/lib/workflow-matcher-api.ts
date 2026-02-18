/**
 * Server-side Workflow Matching API Client
 *
 * @deprecated This API is largely redundant now that traces are converted to RegisteredTrace
 * on the server (otel-collection-server) with registry matching already performed.
 * RegisteredTrace includes matchInfo with server-side registry matching results.
 *
 * Calls the /api/traces/enrich endpoint to perform server-side workflow matching.
 * Replaces client-side matching logic for better performance and consistency.
 */

import type { RegisteredTrace } from '@industry-theme/principal-view-panels';

/**
 * Enrich traces with workflow matching using server-side API
 *
 * @deprecated RegisteredTrace already includes server-side matching via matchInfo
 * Groups traces by version (repositoryUrl + commitSha) and calls the
 * /api/traces/enrich endpoint for each version.
 *
 * @param traces - Array of traces to enrich
 * @returns Enriched traces with matchedWorkflows populated
 */
export async function enrichTracesWithWorkflowMatching(
  traces: RegisteredTrace[]
): Promise<RegisteredTrace[]> {
  if (traces.length === 0) {
    return traces;
  }

  console.log('[WorkflowMatcherAPI] Skipping server-side enrichment - RegisteredTrace already includes matching info:', {
    totalTraces: traces.length,
    sampleStatus: traces[0]?.registryStatus,
    sampleMatchInfo: traces[0]?.matchInfo,
  });

  // RegisteredTrace already includes server-side matching via matchInfo
  // No additional enrichment needed
  return traces;
}
