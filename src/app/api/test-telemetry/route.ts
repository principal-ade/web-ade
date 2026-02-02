/**
 * Test API route to test OpenTelemetry instrumentation via @vercel/otel
 *
 * Usage: GET http://localhost:3000/api/test-telemetry
 *
 * This route uses the standard OpenTelemetry API to create spans that are
 * automatically exported through @vercel/otel to the OTEL Collector.
 */

import { NextResponse } from 'next/server';
import { trace } from '@opentelemetry/api';

export async function GET() {
  const tracer = trace.getTracer('web-ade');

  return tracer.startActiveSpan('test-telemetry-request', async (span) => {
    try {
      // Set span attributes
      span.setAttribute('http.method', 'GET');
      span.setAttribute('http.route', '/api/test-telemetry');
      span.setAttribute('http.status_code', 200);
      span.setAttribute('test.type', 'manual');

      // Simulate some work with a nested span
      await tracer.startActiveSpan('simulate-work', async (workSpan) => {
        workSpan.setAttribute('work.duration_ms', 50);

        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 50));

        workSpan.end();
      });

      span.end();

      return NextResponse.json({
        success: true,
        message: 'Telemetry sent successfully via @vercel/otel',
        info: 'Spans are automatically exported to OTEL_EXPORTER_OTLP_ENDPOINT',
        collectorUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not configured',
      });
    } catch (error) {
      // Record exception in span
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: String(error) }); // ERROR

      span.end();

      console.error('Error in telemetry test:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 500 });
    }
  });
}
