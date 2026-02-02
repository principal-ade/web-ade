# OpenTelemetry Setup & Turbopack ESM Issues

## Overview

This document describes the OpenTelemetry (OTEL) telemetry setup for web-ade and known issues with Next.js Turbopack.

## Current Status

✅ **Working**: Manual telemetry via API route
❌ **Blocked**: Automatic instrumentation with `instrumentation.ts`

## Architecture

```
web-ade (Next.js app)
  ↓ HTTP POST /v1/traces (OTLP)
OTEL Collector Server (http://localhost:4319)
  ↓ forwards to
OTEL Collector Binary (Go, port 4318)
  ↓ pretty-prints
Console Output
```

## Working Setup: Manual Telemetry

### Test Endpoint

A test API route is available at `/api/test-telemetry` that manually sends traces to the collector.

**File**: `src/app/api/test-telemetry/route.ts`

**Usage**:
```bash
curl http://localhost:3000/api/test-telemetry
```

**Response**:
```json
{
  "success": true,
  "message": "Telemetry sent successfully to OTEL Collector",
  "collectorUrl": "http://localhost:4319"
}
```

### Starting the Collector

From the `otel-collection-server` project:

```bash
node test-server.js
```

The collector will start on:
- **Wrapper endpoint**: http://localhost:4319 (send traces here)
- **Collector endpoint**: http://localhost:4318 (internal)

## Known Issue: Turbopack ESM Incompatibility

### Problem Description

When running Next.js with Turbopack (`npm run dev --turbopack`), the `instrumentation.ts` file fails to load OpenTelemetry packages with the following error:

```
TypeError: An error occurred while loading instrumentation hook: Resource is not a constructor
    at Module.register (instrumentation.ts:26:22)
```

### Root Cause

**Turbopack's ESM/CJS Module Resolution**

1. **Next.js's `instrumentation.ts`** runs during server initialization and requires synchronous `require()` for CommonJS packages
2. **Turbopack** attempts to bundle OpenTelemetry packages as ESM modules
3. **OpenTelemetry packages** have complex dual ESM/CJS exports that Turbopack mishandles
4. **Result**: The `Resource` class from `@opentelemetry/resources` is imported incorrectly and appears as a plain object instead of a constructor

### What We Tried

#### Attempt 1: Import from ESM build
```typescript
import { Resource } from '@opentelemetry/resources';
```
❌ **Failed**: `Resource is not a constructor`

#### Attempt 2: Require from CommonJS build
```typescript
const { Resource } = require('@opentelemetry/resources');
```
❌ **Failed**: Same error

#### Attempt 3: Require from specific path
```typescript
const { Resource } = require('@opentelemetry/resources/build/src/Resource');
```
❌ **Failed**: Module not found or same constructor error

#### Attempt 4: Pass resource attributes directly
```typescript
const sdk = new NodeSDK({
  resource: {
    attributes: { 'service.name': 'web-ade' }
  }
});
```
❌ **Failed**: `this._resource.merge is not a function` (NodeSDK expects a Resource instance)

### Workaround: Disable Automatic Instrumentation

The `instrumentation.ts` file has been removed to allow Next.js to start. Instead, use:

1. **Manual API route** (`/api/test-telemetry`) for testing
2. **Custom spans** in your code using the existing test infrastructure in `src/__tests__/otel-setup.ts`

## Future Solutions

### Option 1: Run Without Turbopack

Use Webpack instead of Turbopack:

```bash
# In package.json, change:
"dev": "next dev"  # instead of "next dev --turbopack"
```

**Trade-offs**:
- ✅ OpenTelemetry works correctly
- ❌ Slower build times
- ❌ Lose Turbopack performance benefits

### Option 2: Wait for Turbopack ESM Improvements

Next.js and Turbopack are actively improving ESM support. Monitor:
- [Next.js releases](https://github.com/vercel/next.js/releases)
- [Turbopack issues](https://github.com/vercel/turbo/issues)

### Option 3: Manual Instrumentation

Create custom telemetry wrappers instead of using auto-instrumentation:

```typescript
// Example: Instrument an API route manually
import { trace } from '@opentelemetry/api';

export async function GET() {
  const tracer = trace.getTracer('web-ade');

  return tracer.startActiveSpan('api-route', async (span) => {
    try {
      // Your code here
      span.setAttribute('http.method', 'GET');
      span.end();
      return Response.json({ ok: true });
    } catch (error) {
      span.recordException(error);
      span.end();
      throw error;
    }
  });
}
```

### Option 4: Use @vercel/otel (Recommended for Production)

Vercel provides their own OpenTelemetry integration:

```bash
npm install @vercel/otel
```

```typescript
// instrumentation.ts
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel('web-ade');
}
```

This is optimized for Vercel's platform and works with Turbopack.

## Installed Packages

The following OpenTelemetry packages are installed and ready to use:

```json
{
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/sdk-trace-base": "^2.5.0",
  "@opentelemetry/sdk-node": "^0.56.0",
  "@opentelemetry/auto-instrumentations-node": "^0.55.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.56.0",
  "@opentelemetry/resources": "^1.29.0",
  "@opentelemetry/semantic-conventions": "^1.29.0"
}
```

## Development Workflow

### 1. Start the OTEL Collector

Terminal 1:
```bash
cd /path/to/otel-collection-server
node test-server.js
```

### 2. Start web-ade

Terminal 2:
```bash
cd /path/to/web-ade
npm run dev
```

### 3. Send Test Telemetry

```bash
# Via curl
curl http://localhost:3000/api/test-telemetry

# Or visit in browser
open http://localhost:3000/api/test-telemetry
```

### 4. View Traces

Check Terminal 1 (collector) for pretty-printed traces:

```
======================================================================
TRACE FROM web-ade
Received at: 2026-01-25T22:56:38.809Z
======================================================================

Service: web-ade v0.1.0
Resource Attributes:
  deployment.environment.name: development

Scope: web-ade-test (1.0.0)
  - API /test-telemetry (SERVER) 50ms [OK]
     http.method=GET, http.status_code=200, http.route=/api/test-telemetry
======================================================================
```

## Adding Custom Telemetry

### In API Routes

```typescript
// src/app/api/your-route/route.ts
export async function GET() {
  // Create and send a trace
  const trace = {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'web-ade' } },
        ],
        droppedAttributesCount: 0,
      },
      scopeSpans: [{
        scope: { name: 'web-ade', version: '1.0.0' },
        spans: [{
          traceId: generateTraceId(),
          spanId: generateSpanId(),
          name: 'Your Operation',
          kind: 2, // SERVER
          startTimeUnixNano: String(Date.now() * 1000000),
          endTimeUnixNano: String((Date.now() + duration) * 1000000),
          attributes: [
            { key: 'custom.attribute', value: { stringValue: 'value' } },
          ],
          droppedAttributesCount: 0,
          events: [],
          droppedEventsCount: 0,
          links: [],
          droppedLinksCount: 0,
          status: { code: 1 }, // OK
        }],
      }],
    }],
  };

  await fetch('http://localhost:4319/v1/traces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trace),
  });

  // Your regular response
  return Response.json({ ok: true });
}
```

### Using Existing Test Infrastructure

The project already has OpenTelemetry test infrastructure:

```typescript
// Import from existing test setup
import { tracer, withSpan } from '@/__tests__/otel-setup';

// Use in your code
await withSpan('my-operation', async () => {
  // Your code here
  return result;
}, {
  'custom.attribute': 'value'
});
```

## Troubleshooting

### Collector Not Receiving Traces

1. **Check collector is running**:
   ```bash
   curl http://localhost:4319/health
   ```

2. **Check Next.js can reach collector**:
   ```bash
   curl -X POST http://localhost:4319/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}'
   ```

3. **Check for errors in collector logs** (Terminal 1)

### Next.js Won't Start

1. **Remove `instrumentation.ts` if present**:
   ```bash
   rm instrumentation.ts
   rm -rf .next  # Clear cache
   ```

2. **Verify packages are installed**:
   ```bash
   npm list | grep opentelemetry
   ```

### Traces Not Appearing

1. **Check OTLP format is correct** - use the test route as a reference
2. **Verify trace IDs are valid hex strings** (16 bytes for traceId, 8 bytes for spanId)
3. **Check timestamps are in nanoseconds** (multiply JS milliseconds by 1000000)

## References

- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [Turbopack](https://turbo.build/pack)
- [@vercel/otel](https://www.npmjs.com/package/@vercel/otel)

## Related Files

- `src/app/api/test-telemetry/route.ts` - Manual telemetry test endpoint
- `src/__tests__/otel-setup.ts` - Test infrastructure with tracer setup
- `docs/opentelemetry-setup.md` - This document

## Status & Timeline

- **2026-01-25**: Initial setup completed, turbopack issue discovered
- **Next steps**: Monitor Next.js/Turbopack releases for ESM fixes

---

**Last Updated**: 2026-01-25
**Maintainer**: Development Team
