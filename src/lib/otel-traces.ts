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

    // Log full response for debugging
    console.log('[OTEL Traces] Full API response:', data);
    console.log('[OTEL Traces] Number of traces:', data.traces?.length);

    if (data.traces?.[0]) {
      console.log('[OTEL Traces] First trace object:', data.traces[0]);
      console.log('[OTEL Traces] First trace keys:', Object.keys(data.traces[0]));
      console.log('[OTEL Traces] Has resourceSpans?', 'resourceSpans' in data.traces[0]);
      console.log('[OTEL Traces] resourceSpans value:', data.traces[0].resourceSpans);
    }

    // Transform OTLP traces to TraceInfo format
    // The API returns: { service, count, traces: [...] }
    // Each trace has the structure: { timestamp, source, payload: { resourceSpans: [...] } }
    // We need to extract the payload which contains the actual OTLP data
    const traceInfos: TraceInfo[] = [];

    for (const traceEnvelope of data.traces || []) {
      try {
        // Extract the OTLP payload from the envelope
        const otlpTrace = traceEnvelope.payload;

        if (!otlpTrace || !otlpTrace.resourceSpans) {
          console.warn('[OTEL Traces] Trace missing payload.resourceSpans:', traceEnvelope);
          continue;
        }

        // groupSpansByTrace expects: { resourceSpans: [...] }
        const traces = groupSpansByTrace(otlpTrace);
        traceInfos.push(...traces);
      } catch (error) {
        console.error('[OTEL Traces] Error processing trace:', error);
        console.error('[OTEL Traces] Problematic trace envelope:', traceEnvelope);
      }
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
