/**
 * POST /api/telemetry/collect
 *
 * Receives client-side telemetry in OTLP format and forwards to OTEL collector.
 * This endpoint acts as a proxy to avoid CORS issues and add server-side enrichment.
 */

import { NextRequest, NextResponse } from 'next/server';

const OTEL_COLLECTOR_URL = process.env.OTEL_COLLECTOR_URL || 'http://localhost:4319';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward to OTEL collector
    const response = await fetch(`${OTEL_COLLECTOR_URL}/v1/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('[Telemetry] Collector returned error:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to forward to collector' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Telemetry] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to collect telemetry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
