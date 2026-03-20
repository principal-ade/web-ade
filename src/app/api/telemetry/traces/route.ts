/**
 * Telemetry Traces Proxy
 *
 * Proxies browser OTEL traces to the collector.
 * This avoids CORS issues with direct browser → collector communication.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const tracesUrl = `${collectorEndpoint}/v1/traces`;

  try {
    const body = await request.arrayBuffer();

    // Forward headers from OTEL exporter
    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    };

    // Add any configured OTEL headers
    if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
      process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          headers[key.trim()] = value.trim();
        }
      });
    }

    const response = await fetch(tracesUrl, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Telemetry Proxy] Collector error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to forward traces' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Telemetry Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
