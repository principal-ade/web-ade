/**
 * Server-side OTEL Initialization (Fallback)
 *
 * This module provides a fallback initialization mechanism for OpenTelemetry
 * when instrumentation.ts is not called by the deployment platform (e.g., AWS Amplify).
 *
 * This is called from the root layout on server startup to ensure OTEL is always initialized.
 */

let initialized = false;

export async function initializeOTEL() {
  // Only run on server, only once
  if (typeof window !== 'undefined' || initialized) {
    return;
  }

  // Only in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  console.log('[OTEL FALLBACK] Starting initialization from layout.tsx fallback method');
  initialized = true;

  try {
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
        console.warn('[OTEL FALLBACK] Could not load resources from library.yaml:', error);
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

    /**
     * Auto-detect repository URL and commit SHA from git (local dev)
     */
    function getRepositoryUrl(): string | undefined {
      try {
        const { execSync } = require('child_process');
        const url = execSync('git config --get remote.origin.url')
          .toString()
          .trim()
          .replace(/\.git$/, '')
          .replace(/^git@github\.com:/, 'https://github.com/');
        return url;
      } catch {
        return undefined;
      }
    }

    function getCommitSha(): string | undefined {
      try {
        const { execSync } = require('child_process');
        return execSync('git rev-parse HEAD').toString().trim();
      } catch {
        return undefined;
      }
    }

    // Individual env vars take highest priority
    const serviceName = process.env.OTEL_SERVICE_NAME || mergedResources['service.name'] || 'web-ade';
    const serviceVersion = process.env.OTEL_SERVICE_VERSION || mergedResources['service.version'];
    const repositoryUrl =
      process.env.SERVICE_REPOSITORY_URL ||
      mergedResources['service.repository.url'] ||
      getRepositoryUrl();  // Auto-detect from git
    const commitSha =
      process.env.SERVICE_COMMIT_SHA ||
      mergedResources['service.commit.sha'] ||
      getCommitSha();  // Auto-detect from git

    // Extract service.name and service.version separately, pass others as attributes
    const { 'service.name': _, 'service.version': __, 'service.repository.url': ___, 'service.commit.sha': ____, ...otherResources } = mergedResources;

    // Build attributes object with all version registry info
    const attributes = {
      ...otherResources,
      ...(serviceVersion && { 'service.version': serviceVersion }),
      ...(repositoryUrl && { 'service.repository.url': repositoryUrl }),
      ...(commitSha && { 'service.commit.sha': commitSha }),
    };

    console.log('[OTEL FALLBACK] Registering with resources:', {
      serviceName,
      serviceVersion,
      repositoryUrl,
      commitSha,
      otherAttributes: Object.keys(otherResources)
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

    console.log('[OTEL FALLBACK] Trace exporter registered');

    // Set up metrics exporter (push-based)
    const { metrics } = await import('@opentelemetry/api');
    const { MeterProvider, PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');

    const metricsResource = resourceFromAttributes({
      'service.name': serviceName,
      ...attributes
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

    console.log('[OTEL FALLBACK] Metrics exporter configured');

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
        'runtime': 'nodejs',
        'init.method': 'fallback' // Distinguish from instrumentation.ts init
      });
      console.log('[OTEL FALLBACK] Heartbeat sent');
    }, 30000); // Every 30 seconds

    console.log('[OTEL FALLBACK] Heartbeat metrics configured');
    console.log('[OTEL FALLBACK] ✅ Initialization complete - first heartbeat in 30 seconds');
  } catch (error) {
    console.error('[OTEL FALLBACK] ❌ Failed to initialize:', error);
  }
}
