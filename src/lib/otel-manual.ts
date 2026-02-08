/**
 * Manual OpenTelemetry Instrumentation
 *
 * Use this for manual tracing in API routes since instrumentation.ts
 * doesn't work in AWS Amplify's Lambda environment.
 */

import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';

let sdk: NodeSDK | null = null;

/**
 * Initialize the OpenTelemetry tracer provider
 * Call this once per Lambda execution
 */
export function initializeTracer() {
  if (sdk) {
    return sdk;
  }

  // Configure OTLP exporter
  const exporterConfig: Partial<OTLPExporterNodeConfigBase> = {
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
      : 'http://localhost:4318/v1/traces',
  };

  // Add headers if configured
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    exporterConfig.headers = Object.fromEntries(
      process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',')
        .map(pair => {
          const [key, value] = pair.split('=');
          return [key?.trim(), value?.trim()];
        })
        .filter((pair): pair is [string, string] => {
          return typeof pair[0] === 'string' && typeof pair[1] === 'string' && pair[0] !== '' && pair[1] !== '';
        })
    );
  }

  const exporter = new OTLPTraceExporter(exporterConfig);

  // Create SDK with exporter and resource attributes
  sdk = new NodeSDK({
    traceExporter: exporter,
    serviceName: 'web-ade',
    resource: {
      attributes: {
        'service.version': '0.1.0',
        'deployment.environment': process.env.NODE_ENV || 'development',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  // Start the SDK
  sdk.start();

  console.log('[OTEL Manual] Tracer initialized:', {
    endpoint: exporterConfig.url,
    hasHeaders: !!exporterConfig.headers,
  });

  return sdk;
}

/**
 * Get the tracer instance
 */
export function getTracer() {
  if (!sdk) {
    initializeTracer();
  }
  return trace.getTracer('web-ade-manual', '1.0.0');
}

/**
 * Create a span and automatically handle errors
 *
 * @example
 * ```typescript
 * export async function GET() {
 *   return withSpan('api.example', async (span) => {
 *     span.setAttribute('user.id', '123');
 *     const result = await fetchData();
 *     return Response.json(result);
 *   });
 * }
 * ```
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  // Add attributes if provided
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });

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
 * Force flush all pending spans
 * Call this at the end of Lambda execution to ensure spans are sent
 */
export async function flushSpans() {
  if (sdk) {
    await sdk.shutdown();
    console.log('[OTEL Manual] Spans flushed');
  }
}
