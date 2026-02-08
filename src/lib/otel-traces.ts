/**
 * OTEL Traces Utilities
 *
 * Fetches and transforms trace data from the OTEL Collection Server.
 */

import { groupSpansByTrace, type TraceInfo } from '@industry-theme/principal-view-panels';

/**
 * Fetch traces for a specific service from the OTEL Collection Server
 *
 * @param serviceName - Name of the service (e.g., "web-ade")
 * @param limit - Maximum number of traces to return (optional)
 * @returns Array of TraceInfo objects
 */
export async function fetchTraces(
  serviceName: string,
  limit?: number
): Promise<TraceInfo[]> {
  try {
    // Build API URL with optional limit parameter
    const url = new URL(`/api/otel/traces/${encodeURIComponent(serviceName)}`, window.location.origin);
    if (limit !== undefined) {
      url.searchParams.set('limit', limit.toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        // Service not found - return empty array
        console.log(`[OTEL Traces] No traces found for service: ${serviceName}`);
        return [];
      }

      throw new Error(`Failed to fetch traces: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Transform OTLP traces to TraceInfo format
    // The API returns: { service, count, traces: [...] }
    // Where traces is an array of OTLP trace objects
    const traceInfos: TraceInfo[] = [];

    for (const otlpTrace of data.traces || []) {
      // Each OTLP trace has the structure: { resourceSpans: [...] }
      // groupSpansByTrace expects this exact structure
      const traces = groupSpansByTrace(otlpTrace);
      traceInfos.push(...traces);
    }

    console.log(`[OTEL Traces] Fetched ${traceInfos.length} traces for ${serviceName}`);
    return traceInfos;
  } catch (error) {
    console.error('[OTEL Traces] Error fetching traces:', error);
    throw error;
  }
}

/**
 * Fetch traces and handle errors gracefully
 * Returns empty array on error instead of throwing
 */
export async function fetchTracesSafe(
  serviceName: string,
  limit?: number
): Promise<TraceInfo[]> {
  try {
    return await fetchTraces(serviceName, limit);
  } catch (error) {
    console.error('[OTEL Traces] Failed to fetch traces:', error);
    return [];
  }
}
