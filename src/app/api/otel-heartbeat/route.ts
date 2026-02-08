/**
 * OTEL Heartbeat Endpoint
 *
 * Sends a lightweight heartbeat trace to verify:
 * - OTEL is configured correctly
 * - Authentication works
 * - Service can reach the collector
 * - Service name is properly set
 *
 * Call this endpoint periodically or manually to ensure tracing is working.
 */

import { withSpan } from '@/lib/otel-manual';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    return await withSpan(
      'heartbeat.ping',
      async (span) => {
        // Add heartbeat-specific attributes
        span.setAttribute('heartbeat', true);
        span.setAttribute('check.type', 'configuration-validation');
        span.setAttribute('timestamp', new Date().toISOString());

        // Add service metadata
        span.setAttribute('service.name', 'web-ade');
        span.setAttribute('service.version', '0.1.0');
        span.setAttribute('deployment.environment', process.env.NODE_ENV || 'development');

        // Add configuration status
        const collectorUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not configured';
        const hasAuth = !!process.env.OTEL_EXPORTER_OTLP_HEADERS;

        span.setAttribute('collector.url', collectorUrl);
        span.setAttribute('collector.auth_configured', hasAuth);

        // Note: Spans are sent automatically by BatchSpanProcessor
        // No need to manually flush - the SDK handles it

        return NextResponse.json({
          success: true,
          message: 'Heartbeat sent successfully',
          configuration: {
            collectorUrl,
            authConfigured: hasAuth,
            serviceName: 'web-ade',
            environment: process.env.NODE_ENV || 'development',
          },
          timestamp: new Date().toISOString(),
        });
      },
      {
        'heartbeat.check': 'otel-configuration',
      }
    );
  } catch (error) {
    console.error('[OTEL Heartbeat] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to send heartbeat',
      },
      { status: 500 }
    );
  }
}
