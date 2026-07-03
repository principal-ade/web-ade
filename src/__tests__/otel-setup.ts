/**
 * OpenTelemetry Test Infrastructure
 *
 * Provides tracer configuration and utilities for capturing telemetry
 * events during test execution. Events are validated against canvas
 * schemas and exported to __executions__/ directory.
 */

import { AttributeValue } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// In-memory span exporter for test execution
const spanExporter = new InMemorySpanExporter();

// Tracer provider with simple span processor
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});
provider.register();

/**
 * Get all captured spans from the in-memory exporter
 */
function getCapturedSpans() {
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
 *
 * @param testName - Name of the test (used as filename)
 * @param workflowPath - Optional workflow path (e.g., 'tts-generation/cache-hit')
 *                       If not provided, exports to __executions__ (deprecated)
 */
export function exportSpansToOTLP(testName: string, workflowPath?: string) {
  // Writing execution captures to .principal-views/ is OPT-IN. A normal
  // `npm test` run should not litter the working tree with generated
  // *.otel.json files (they are ephemeral run output, not source). Set
  // EXPORT_TEST_SPANS=1 to regenerate the principal-views dashboards.
  if (!process.env.EXPORT_TEST_SPANS) {
    return;
  }

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

  // Determine export directory
  let exportDir: string;
  if (workflowPath) {
    // Export to workflow folder (new storyboard structure)
    exportDir = join(process.cwd(), '.principal-views', workflowPath);
  } else {
    // Export to __executions__ (deprecated, for backward compatibility)
    exportDir = join(process.cwd(), '.principal-views', '__executions__');
  }

  mkdirSync(exportDir, { recursive: true });

  // Write to file
  const filename = `${testName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.otel.json`;
  const filepath = join(exportDir, filename);

  writeFileSync(filepath, JSON.stringify(otlpData, null, 2));
  console.log(`✅ Exported ${spans.length} spans to ${filepath}`);
}

/**
 * Convert attribute values to OTLP format
 */
function convertAttributeValue(value: AttributeValue | undefined) {
  if (value === undefined) {
    return { stringValue: '' };
  }
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
