/**
 * Client-Side Telemetry Utility
 *
 * Uses OpenTelemetry API for proper span/event instrumentation.
 * Events are emitted WITHIN spans, not standalone.
 *
 * Pattern:
 *   const span = telemetry.startSpan('stories.canvases.success');
 *   span.addEvent('stories.canvases.load', { owner: 'foo', repo: 'bar' });
 *   span.addEvent('stories.canvases.success', { canvasCount: 5 });
 *   span.end();
 */

// Initialize browser OTEL provider (no-op on server)
import './otel-browser-init';

import { trace, type Span, SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'web-ade';
const TRACER_VERSION = '1.0.0';

/**
 * Get the tracer instance for web-ade
 */
export function getTracer() {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

/**
 * Start a new span for a workflow operation.
 * The spanName should match the spanPattern from your workflow.json
 *
 * @example
 * const span = startSpan('stories.canvases.success');
 * span.addEvent('stories.canvases.load', { owner, repo });
 * span.addEvent('stories.canvases.success', { canvasCount: 5 });
 * span.end();
 */
export function startSpan(spanName: string, attributes?: Record<string, string | number | boolean>): Span {
  const tracer = getTracer();
  return tracer.startSpan(spanName, { attributes });
}

/**
 * Execute a function within a span context.
 * Automatically handles span start/end and error recording.
 *
 * @example
 * await withSpan('stories.canvases.success', async (span) => {
 *   span.addEvent('stories.canvases.load', { owner, repo });
 *   const result = await loadCanvases();
 *   span.addEvent('stories.canvases.success', { canvasCount: result.length });
 *   return result;
 * });
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = startSpan(spanName, attributes);

  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Synchronous version of withSpan for non-async operations
 */
export function withSpanSync<T>(
  spanName: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>
): T {
  const span = startSpan(spanName, attributes);

  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

// Legacy compatibility - deprecated, use startSpan + span.addEvent instead
class TelemetryCollector {
  private currentSpan: Span | null = null;

  startSpan(name: string): void {
    this.currentSpan = startSpan(name);
  }

  emitEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    if (!this.currentSpan) {
      console.warn('[Telemetry] No active span. Call startSpan() first.');
      return;
    }
    this.currentSpan.addEvent(name, attributes);
  }

  endSpan(): void {
    if (this.currentSpan) {
      this.currentSpan.end();
      this.currentSpan = null;
    }
  }
}

// Legacy singleton for backwards compatibility
export const telemetry = new TelemetryCollector();

// Re-export types
export { type Span, SpanStatusCode };
