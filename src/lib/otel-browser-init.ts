/**
 * Browser-side OTEL Initialization
 *
 * Configures OpenTelemetry TracerProvider for client-side spans.
 * Must be called early in the app lifecycle (e.g., in a client component or layout).
 */

'use client';

import {
  WebTracerProvider,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let initialized = false;

export function initializeBrowserOTEL() {
  if (typeof window === 'undefined' || initialized) {
    return;
  }

  initialized = true;

  const serviceName = 'web-ade';
  const serviceVersion = '1.0.0';

  // Get repository info from the page URL or window context
  // These should match what the server sends
  const repositoryUrl = typeof window !== 'undefined'
    ? (window as unknown as { __REPO_URL__?: string }).__REPO_URL__ || 'https://github.com/anthropics/web-ade'
    : 'https://github.com/anthropics/web-ade';

  // Create resource with same attributes as server
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'service.repository.url': repositoryUrl,
  });

  // Create exporter - sends to the same collector endpoint
  // Uses relative URL to avoid CORS issues (proxied through Next.js)
  const exporter = new OTLPTraceExporter({
    url: '/api/telemetry/traces', // Proxy endpoint
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Create provider with resource and span processor
  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 100,
        maxExportBatchSize: 10,
        scheduledDelayMillis: 500,
      }),
    ],
  });

  // Register as global provider
  provider.register();

  console.log('[OTEL Browser] Initialized TracerProvider');
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  initializeBrowserOTEL();
}
