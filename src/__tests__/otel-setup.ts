/**
 * OpenTelemetry Test Infrastructure
 *
 * Provides tracer configuration and utilities for capturing telemetry
 * events during test execution. Events are validated against canvas
 * schemas and exported to __executions__/ directory.
 */

import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// In-memory span exporter for test execution
const spanExporter = new InMemorySpanExporter();

// Tracer provider with simple span processor
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
provider.register();

// Get tracer instance
export const tracer = trace.getTracer('web-ade-test', '1.0.0');

/**
 * Get all captured spans from the in-memory exporter
 */
export function getCapturedSpans() {
  return spanExporter.getFinishedSpans();
}

/**
 * Clear all captured spans
 */
export function clearSpans() {
  spanExporter.reset();
}

/**
 * Export captured spans to OTLP JSON format
 * Format matches OpenTelemetry Protocol specification
 */
export function exportSpansToOTLP(testName: string) {
  const spans = getCapturedSpans();

  if (spans.length === 0) {
    console.warn(`No spans captured for test: ${testName}`);
    return;
  }

  // Convert to OTLP JSON format
  const otlpData = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'web-ade' } },
            { key: 'service.version', value: { stringValue: '0.1.0' } },
            { key: 'environment', value: { stringValue: 'test' } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: 'web-ade-test',
              version: '1.0.0',
            },
            spans: spans.map((span) => ({
              traceId: span.spanContext().traceId,
              spanId: span.spanContext().spanId,
              name: span.name,
              kind: span.kind,
              startTimeUnixNano: String(span.startTime[0] * 1e9 + span.startTime[1]),
              endTimeUnixNano: String(span.endTime[0] * 1e9 + span.endTime[1]),
              attributes: Object.entries(span.attributes).map(([key, value]) => ({
                key,
                value: convertAttributeValue(value),
              })),
              events: span.events.map((event) => ({
                timeUnixNano: String(event.time[0] * 1e9 + event.time[1]),
                name: event.name,
                attributes: Object.entries(event.attributes || {}).map(([key, value]) => ({
                  key,
                  value: convertAttributeValue(value),
                })),
              })),
              status: {
                code: span.status.code,
                message: span.status.message || '',
              },
            })),
          },
        ],
      },
    ],
  };

  // Ensure __executions__ directory exists
  const executionsDir = join(process.cwd(), '.principal-views', '__executions__');
  mkdirSync(executionsDir, { recursive: true });

  // Write to file
  const filename = `${testName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.otel.json`;
  const filepath = join(executionsDir, filename);

  writeFileSync(filepath, JSON.stringify(otlpData, null, 2));
  console.log(`✅ Exported ${spans.length} spans to ${filepath}`);
}

/**
 * Convert attribute values to OTLP format
 */
function convertAttributeValue(value: any) {
  if (typeof value === 'string') {
    return { stringValue: value };
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { intValue: value };
    }
    return { doubleValue: value };
  } else if (typeof value === 'boolean') {
    return { boolValue: value };
  } else {
    return { stringValue: String(value) };
  }
}

/**
 * Helper to create a span with automatic error handling
 */
export function withSpan<T>(
  name: string,
  fn: () => T | Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  });
}

/**
 * Create a validated span emitter that checks events against canvas schema
 * Note: This is a simplified version - full validation would require loading the canvas
 */
export function createValidatedSpanEmitter(spanName: string) {
  const span = tracer.startSpan(spanName);

  return {
    emitEvent(eventName: string, attributes: Record<string, any>) {
      // In strict mode, you would validate attributes against canvas dataSchema here
      // For now, we just emit the event
      span.addEvent(eventName, attributes);
    },
    end() {
      span.end();
    },
    setError(error: Error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
    },
  };
}

// Export cleanup for afterAll hooks
export { spanExporter };
