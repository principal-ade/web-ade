/**
 * OpenTelemetry Instrumentation
 *
 * This file is automatically loaded by Next.js during server startup.
 * Uses @vercel/otel for simplified OpenTelemetry setup that works with Turbopack.
 */

export async function register() {
  console.log('[OTEL DEBUG] register() called');
  console.log('[OTEL DEBUG] NEXT_RUNTIME:', process.env.NEXT_RUNTIME);
  console.log('[OTEL DEBUG] NODE_ENV:', process.env.NODE_ENV);

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import Node.js APIs only in Node.js runtime to avoid Edge Runtime errors
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const { registerOTel } = await import('@vercel/otel');

    /**
     * Load OTEL resources from library.yaml
     * Returns resources as key-value pairs for OTEL configuration
     */
    function loadResourcesFromLibrary(): Record<string, string> {
      try {
        const libraryPath = join(process.cwd(), '.principal-views', 'library.yaml');
        const content = readFileSync(libraryPath, 'utf-8');

        // Simple YAML parser for the nested resources section
        // Match: resources:\n  web-ade:\n    key: value
        const nestedMatch = content.match(/resources:\s*\n\s+web-ade:\s*\n((?:\s+[\w.]+:\s*[^\n]+\n?)+)/);

        if (!nestedMatch || !nestedMatch[1]) {
          return {};
        }

        const resources: Record<string, string> = {};
        const resourceLines = nestedMatch[1].split('\n').filter(line => line.trim());

        for (const line of resourceLines) {
          const match = line.match(/^\s+([\w.]+):\s*["']?([^"'\n]+)["']?$/);
          if (match && match[1] && match[2]) {
            resources[match[1]] = match[2].trim();
          }
        }

        return resources;
      } catch (error) {
        console.warn('[OTEL] Could not load resources from library.yaml:', error);
        return {};
      }
    }

    // Load resources from library.yaml (local dev)
    const libraryResources = loadResourcesFromLibrary();

    // Parse OTEL_RESOURCE_ATTRIBUTES from environment (production)
    // Format: key1=value1,key2=value2
    const envResources: Record<string, string> = {};
    if (process.env.OTEL_RESOURCE_ATTRIBUTES) {
      process.env.OTEL_RESOURCE_ATTRIBUTES.split(',').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          envResources[key.trim()] = value.trim();
        }
      });
    }

    // Merge resources: library.yaml < OTEL_RESOURCE_ATTRIBUTES < individual env vars
    const mergedResources = { ...libraryResources, ...envResources };

    // Individual env vars take highest priority
    const serviceName = process.env.OTEL_SERVICE_NAME || mergedResources['service.name'] || 'web-ade';
    const serviceVersion = process.env.OTEL_SERVICE_VERSION || mergedResources['service.version'];

    // Extract service.name and service.version separately, pass others as attributes
    const { 'service.name': _, 'service.version': __, ...otherResources } = mergedResources;

    // Add service.version to attributes if present
    const attributes = serviceVersion
      ? { ...otherResources, 'service.version': serviceVersion }
      : otherResources;

    console.log('[OTEL] Registering with resources:', {
      serviceName,
      attributes
    });

    // Configure trace exporter with custom endpoint and headers
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

    const traceExporterConfig: {
      url?: string;
      headers?: Record<string, string>;
    } = {};

    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      traceExporterConfig.url = `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`;
    }

    if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
      traceExporterConfig.headers = Object.fromEntries(
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

    const traceExporter = new OTLPTraceExporter(traceExporterConfig);

    registerOTel({
      serviceName,
      attributes,
      traceExporter, // Explicitly provide custom exporter
    });

    // Set up metrics exporter (push-based)
    const { metrics } = await import('@opentelemetry/api');
    const { MeterProvider, PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');

    const metricsResource = resourceFromAttributes({
      'service.name': serviceName,
      ...otherResources
    });

    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
        : 'http://localhost:4318/v1/metrics',
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
        ? Object.fromEntries(
            process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',')
              .map(pair => {
                const [key, value] = pair.split('=');
                return [key?.trim(), value?.trim()];
              })
              .filter((pair): pair is [string, string] => {
                return typeof pair[0] === 'string' && typeof pair[1] === 'string' && pair[0] !== '' && pair[1] !== '';
              })
          )
        : {},
    });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000, // Export every 30 seconds
    });

    const meterProvider = new MeterProvider({
      resource: metricsResource,
      readers: [metricReader],
    });

    metrics.setGlobalMeterProvider(meterProvider);

    console.log('[OTEL] Metrics exporter configured');

    // Set up heartbeat metric
    const meter = metrics.getMeter('web-ade-heartbeat', '1.0.0');

    // Track service uptime
    const startTime = Date.now();
    const uptimeGauge = meter.createObservableGauge('service.uptime_seconds', {
      description: 'Service uptime in seconds',
      unit: 's'
    });

    uptimeGauge.addCallback((result) => {
      const uptimeSeconds = (Date.now() - startTime) / 1000;
      result.observe(uptimeSeconds);
    });

    // Heartbeat counter - increments every 30 seconds
    const heartbeatCounter = meter.createCounter('service.heartbeat', {
      description: 'Service heartbeat counter - increments periodically to indicate service is running',
      unit: '1'
    });

    setInterval(() => {
      heartbeatCounter.add(1, {
        'service.name': serviceName,
        'runtime': 'nodejs'
      });
    }, 30000); // Every 30 seconds

    console.log('[OTEL] Heartbeat metrics configured');
  }
}
