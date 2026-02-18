/**
 * OTEL Traces Utilities
 *
 * Fetches and transforms trace data from the OTEL Collection Server.
 */

import { type RegisteredTrace } from '@industry-theme/principal-view-panels';

/**
 * Fetch traces for a specific service from the OTEL Collection Server
 *
 * @param serviceName - Name of the service (e.g., "web-ade")
 * @param limit - Maximum number of traces to return (optional)
 * @returns Array of RegisteredTrace objects
 */
export async function fetchTraces(
  serviceName: string,
  limit?: number
): Promise<RegisteredTrace[]> {
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

    // Extract RegisteredTrace from API response
    // The API returns: { service, count, traces: [...] }
    // Each trace has the structure: { timestamp, source, payload, registeredTrace }
    // The registeredTrace field contains the full RegisteredTrace object
    const registeredTraces: RegisteredTrace[] = [];

    for (const traceEnvelope of data.traces || []) {
      try {
        // The updated otel-collection-server stores registeredTrace in the envelope
        if (traceEnvelope.registeredTrace) {
          registeredTraces.push(traceEnvelope.registeredTrace);
        } else {
          // Fallback: old format or missing registeredTrace
          console.warn('[OTEL Traces] Trace envelope missing registeredTrace field:', traceEnvelope);
        }
      } catch (error) {
        console.error('[OTEL Traces] Error processing trace:', error);
        console.error('[OTEL Traces] Problematic trace envelope:', traceEnvelope);
      }
    }

    console.log(`[OTEL Traces] Fetched ${registeredTraces.length} traces for ${serviceName}`);
    return registeredTraces;
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
): Promise<RegisteredTrace[]> {
  try {
    return await fetchTraces(serviceName, limit);
  } catch (error) {
    console.error('[OTEL Traces] Failed to fetch traces:', error);
    return [];
  }
}
