/**
 * Client-Side Telemetry Utility
 *
 * Provides simple event emission for client-side telemetry.
 * Events are sent to OTEL collector for processing and visualization.
 */

interface TelemetryEvent {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  timestamp?: number;
}

interface TelemetrySpan {
  traceId: string;
  spanId: string;
  name: string;
  events: TelemetryEvent[];
  startTime: number;
  endTime?: number;
}

class TelemetryCollector {
  private currentSpan: TelemetrySpan | null = null;
  private collectorUrl = '/api/telemetry/collect'; // We'll create this endpoint

  /**
   * Generate a random hex ID
   */
  private generateId(bytes: number): string {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hex;
  }

  /**
   * Start a new telemetry span
   */
  startSpan(name: string): void {
    this.currentSpan = {
      traceId: this.generateId(16), // 16 bytes = 32 hex chars
      spanId: this.generateId(8),   // 8 bytes = 16 hex chars
      name,
      events: [],
      startTime: Date.now(),
    };
  }

  /**
   * Emit a telemetry event in the current span
   */
  emitEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    if (!this.currentSpan) {
      console.warn('[Telemetry] No active span. Call startSpan() first.');
      return;
    }

    this.currentSpan.events.push({
      name,
      attributes,
      timestamp: Date.now(),
    });
  }

  /**
   * End the current span and send to collector
   */
  async endSpan(): Promise<void> {
    if (!this.currentSpan) {
      return;
    }

    this.currentSpan.endTime = Date.now();
    const span = this.currentSpan;
    this.currentSpan = null;

    // Convert to OTLP format
    const otlpData = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'web-ade' } },
            { key: 'service.version', value: { stringValue: '0.1.0' } },
            { key: 'deployment.environment.name', value: { stringValue: 'production' } },
          ],
        },
        scopeSpans: [{
          scope: {
            name: 'web-ade',
            version: '1.0.0',
          },
          spans: [{
            traceId: span.traceId,
            spanId: span.spanId,
            name: span.name,
            kind: 2, // SPAN_KIND_SERVER
            startTimeUnixNano: String(span.startTime * 1000000),
            endTimeUnixNano: String((span.endTime || Date.now()) * 1000000),
            attributes: [],
            events: span.events.map(event => ({
              timeUnixNano: String((event.timestamp || Date.now()) * 1000000),
              name: event.name,
              attributes: Object.entries(event.attributes || {}).map(([key, value]) => ({
                key,
                value: this.convertAttributeValue(value),
              })),
            })),
            status: { code: 1 }, // STATUS_CODE_OK
          }],
        }],
      }],
    };

    // Send to collector (fire and forget for now)
    try {
      await fetch(this.collectorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otlpData),
      });
    } catch (error) {
      console.warn('[Telemetry] Failed to send to collector:', error);
    }
  }

  /**
   * Convert attribute value to OTLP format
   */
  private convertAttributeValue(value: string | number | boolean) {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { intValue: value };
      }
      return { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    }
    return { stringValue: String(value) };
  }
}

// Singleton instance
const telemetry = new TelemetryCollector();

/**
 * Helper to run a function within a telemetry span
 */
export async function withTelemetrySpan<T>(
  spanName: string,
  fn: (emit: (eventName: string, attrs?: Record<string, string | number | boolean>) => void) => Promise<T>
): Promise<T> {
  telemetry.startSpan(spanName);

  const emit = (eventName: string, attrs?: Record<string, string | number | boolean>) => {
    telemetry.emitEvent(eventName, attrs);
  };

  try {
    const result = await fn(emit);
    await telemetry.endSpan();
    return result;
  } catch (error) {
    // Emit error event before ending span
    emit('error', {
      'error.message': error instanceof Error ? error.message : String(error),
    });
    await telemetry.endSpan();
    throw error;
  }
}

export { telemetry };
