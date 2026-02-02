/**
 * OpenTelemetry Instrumentation
 *
 * This file is automatically loaded by Next.js during server startup.
 * Uses @vercel/otel for simplified OpenTelemetry setup that works with Turbopack.
 */

export async function register() {
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

        // Simple YAML parser for the resources section
        // Matches: resources:\n  key: "value" or key: value
        const resourcesMatch = content.match(/resources:\s*\n((?:\s+[\w.]+:\s*[^\n]+\n?)+)/);

        if (!resourcesMatch) {
          return {};
        }

        const resources: Record<string, string> = {};
        const resourceLines = resourcesMatch[1].split('\n').filter(line => line.trim());

        for (const line of resourceLines) {
          const match = line.match(/^\s+([\w.]+):\s*["']?([^"'\n]+)["']?$/);
          if (match) {
            const [, key, value] = match;
            resources[key] = value.trim();
          }
        }

        return resources;
      } catch (error) {
        console.warn('[OTEL] Could not load resources from library.yaml:', error);
        return {};
      }
    }

    // Load resources from library.yaml
    const libraryResources = loadResourcesFromLibrary();

    // Merge with environment variable overrides
    const serviceName = process.env.OTEL_SERVICE_NAME || libraryResources['service.name'] || 'web-ade';

    // Extract service.name and service.version separately, pass others as attributes
    const { 'service.name': _, 'service.version': __, ...otherResources } = libraryResources;

    console.log('[OTEL] Registering with resources:', {
      serviceName,
      attributes: otherResources
    });

    registerOTel({
      serviceName,
      attributes: otherResources,
      // Additional configuration will be picked up from environment variables
      // OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4319
    });

    // Set up metrics exporter (push-based)
    const { metrics } = await import('@opentelemetry/api');
    const { MeterProvider, PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
    const { Resource } = await import('@opentelemetry/resources');

    const metricsResource = new Resource({
      'service.name': serviceName,
      ...otherResources
    });

    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
        : 'http://localhost:4318/v1/metrics',
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
