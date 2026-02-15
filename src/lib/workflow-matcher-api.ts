/**
 * Server-side Workflow Matching API Client
 *
 * Calls the /api/traces/enrich endpoint to perform server-side workflow matching.
 * Replaces client-side matching logic for better performance and consistency.
 */

import type { TraceInfo } from '@industry-theme/principal-view-panels';

interface EnrichTracesRequest {
  traces: TraceInfo[];
  repositoryUrl: string;
  commitSha: string;
}

interface EnrichTracesResponse {
  traces: TraceInfo[];
  schematicFetched: boolean;
  workflowCount: number;
}

/**
 * Enrich traces with workflow matching using server-side API
 *
 * Groups traces by version (repositoryUrl + commitSha) and calls the
 * /api/traces/enrich endpoint for each version.
 *
 * @param traces - Array of traces to enrich
 * @returns Enriched traces with matchedWorkflows populated
 */
export async function enrichTracesWithWorkflowMatching(
  traces: TraceInfo[]
): Promise<TraceInfo[]> {
  if (traces.length === 0) {
    return traces;
  }

  console.log('[WorkflowMatcherAPI] Starting server-side enrichment:', {
    totalTraces: traces.length,
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

  console.log('[WorkflowMatcherAPI] Grouped traces:', {
    withVersion: tracesByVersion.size,
    withoutVersion: tracesWithoutVersion.length,
    versions: Array.from(tracesByVersion.keys()),
  });

  // Enrich traces for each version in parallel
  const enrichedTraces: TraceInfo[] = [...tracesWithoutVersion];

  const enrichmentPromises = Array.from(tracesByVersion.entries()).map(
    async ([versionKey, versionTraces]) => {
      const parts = versionKey.split('@');
      const repositoryUrl = parts[0];
      const commitSha = parts[1];

      // Safety check
      if (!repositoryUrl || !commitSha) {
        console.warn('[WorkflowMatcherAPI] Invalid version key:', versionKey);
        return versionTraces;
      }

      console.log('[WorkflowMatcherAPI] Enriching traces for version:', {
        repositoryUrl,
        commitSha,
        traceCount: versionTraces.length,
      });

      try {
        const requestBody: EnrichTracesRequest = {
          traces: versionTraces,
          repositoryUrl,
          commitSha,
        };

        const response = await fetch('/api/traces/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          console.error('[WorkflowMatcherAPI] Enrichment failed:', {
            status: response.status,
            statusText: response.statusText,
          });
          // Return traces unchanged on error
          return versionTraces;
        }

        const result: EnrichTracesResponse = await response.json();

        console.log('[WorkflowMatcherAPI] Enrichment successful:', {
          schematicFetched: result.schematicFetched,
          workflowCount: result.workflowCount,
          enrichedTraces: result.traces.length,
        });

        return result.traces;
      } catch (error) {
        console.error('[WorkflowMatcherAPI] Error enriching traces:', error);
        // Return traces unchanged on error
        return versionTraces;
      }
    }
  );

  // Wait for all enrichment operations to complete
  const enrichedVersionGroups = await Promise.all(enrichmentPromises);

  // Flatten results
  for (const group of enrichedVersionGroups) {
    enrichedTraces.push(...group);
  }

  console.log('[WorkflowMatcherAPI] Enrichment complete:', {
    totalEnrichedTraces: enrichedTraces.length,
  });

  return enrichedTraces;
}
