/**
 * Test endpoint for manual OpenTelemetry instrumentation
 *
 * This route demonstrates manual tracing in AWS Amplify Lambda environment
 * where automatic instrumentation.ts doesn't work.
 */

import { withSpan, flushSpans } from '@/lib/otel-manual';
import { NextResponse } from 'next/server';
import { Span, trace, context } from '@opentelemetry/api';

export async function GET() {
  try {
    return await withSpan(
      'api.test-manual-telemetry',
      async (span) => {
        // Add custom attributes
        span.setAttribute('http.method', 'GET');
        span.setAttribute('http.route', '/api/test-manual-telemetry');
        span.setAttribute('test.type', 'manual-instrumentation');

        // Simulate some work with nested spans
        await simulateWork(span);

        // Flush spans before Lambda terminates
        await flushSpans();

        return NextResponse.json({
          success: true,
          message: 'Manual telemetry test completed',
          info: 'Check your OTEL collector for traces from web-ade service',
          collectorUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not configured',
        });
      },
      {
        'service.name': 'web-ade',
        'environment': process.env.NODE_ENV || 'development',
      }
    );
  } catch (error) {
    console.error('[OTEL Test] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Simulate some work with nested spans
 */
async function simulateWork(parentSpan: Span) {
  const tracer = trace.getTracer('web-ade-manual');

  // Create a child span for database operation
  const dbSpan = tracer.startSpan('db.query', {}, trace.setSpan(context.active(), parentSpan));
  dbSpan.setAttribute('db.operation', 'SELECT');
  dbSpan.setAttribute('db.table', 'users');

  await new Promise(resolve => setTimeout(resolve, 100)); // Simulate DB query

  dbSpan.end();

  // Create another child span for external API call
  const apiSpan = tracer.startSpan('http.request', {}, trace.setSpan(context.active(), parentSpan));
  apiSpan.setAttribute('http.url', 'https://api.example.com/data');
  apiSpan.setAttribute('http.method', 'GET');

  await new Promise(resolve => setTimeout(resolve, 50)); // Simulate API call

  apiSpan.end();
}
