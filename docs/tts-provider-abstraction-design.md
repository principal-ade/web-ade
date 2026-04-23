# TTS Provider Abstraction Design

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Design Review

## Executive Summary

This document outlines a refactoring plan to introduce dependency injection and a provider interface for Text-to-Speech (TTS) audio generation. Currently, `src/lib/tts/elevenlabs-client.ts` exposes free functions that read environment variables at call time and make direct HTTP requests to the ElevenLabs API. All consumers import those functions directly, making tests dependent on live API calls and preventing provider swapping.

## Current State Analysis

### TTS Usage Inventory

| Consumer | File | Operations |
|----------|------|------------|
| **TTS Generate Route** | `src/app/api/tts/generate/route.ts` | `generateAudio`, `mergeTTSOptions` |
| **TTS Batch Generate Route** | `src/app/api/tts/batch-generate/route.ts` | `generateAudio`, `mergeTTSOptions` |
| **TTS Router** | `src/server/routers/tts.ts` | `generateAudio`, `getDefaultOptions` |

### Current Implementation

`src/lib/tts/elevenlabs-client.ts` exports three free functions:

| Function | Responsibility |
|----------|----------------|
| `generateAudio(text, options, previousText?)` | Makes HTTP POST to `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, returns `Buffer` |
| `getDefaultOptions()` | Reads `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` from env at call time |
| `mergeTTSOptions(userOptions?)` | Merges user options with defaults, validates speed range |

The function handles:
- `previous_text` for contextual continuity between sequential segments
- Optional pronunciation dictionary (`ELEVENLABS_PRONUNCIATION_DICTIONARY_ID`)
- Rate-limit detection (HTTP 429) with `Retry-After` parsing and `TTSErrorCode.RATE_LIMIT_EXCEEDED`

### Common Problems

1. **No interface** — consumers are hard-wired to ElevenLabs; swapping providers (Amazon Polly, Google TTS, Azure) requires changing all call sites
2. **Env vars read at call time** — `process.env.ELEVENLABS_API_KEY` evaluated inside the function body, not injected
3. **No testability** — unit tests in `src/__tests__/tts-generation.test.ts` hit real API or require mocking the entire `fetch` global
4. **Provider-specific concepts leak out** — `TTSErrorCode.ELEVENLABS_ERROR` surfaces to callers; they shouldn't care which provider failed

## Proposed Architecture

### Core Abstraction

#### 1. TTS Provider Interface

```typescript
// src/lib/tts/base/tts-provider-interface.ts

export interface TTSGenerateOptions {
  voice: string;
  speed: number;
  model: string;
  previousText?: string;
}

export interface ITTSProvider {
  /**
   * Generate audio from text.
   * @returns MP3 audio as Buffer
   * @throws TTSRateLimitError | TTSProviderError
   */
  generateAudio(text: string, options: TTSGenerateOptions): Promise<Buffer>;

  /**
   * Returns the default options for this provider from configuration.
   */
  getDefaultOptions(): TTSGenerateOptions;
}
```

#### 2. Provider-Neutral Error Types

```typescript
// src/lib/tts/base/tts-errors.ts

export class TTSRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('TTS rate limit exceeded');
    this.name = 'TTSRateLimitError';
  }
}

export class TTSProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTSProviderError';
  }
}
```

Callers catch `TTSRateLimitError` and `TTSProviderError` instead of ElevenLabs-specific error codes.

#### 3. ElevenLabs Implementation

```typescript
// src/lib/tts/providers/elevenlabs-provider.ts

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
  pronunciationDictionaryId?: string;
  pronunciationDictionaryVersionId?: string;
}

export class ElevenLabsProvider implements ITTSProvider {
  constructor(private readonly config: ElevenLabsConfig) {}

  async generateAudio(text: string, options: TTSGenerateOptions): Promise<Buffer> {
    // Existing fetch logic, using this.config instead of process.env.*
    // Throws TTSRateLimitError or TTSProviderError (not ElevenLabs-specific codes)
  }

  getDefaultOptions(): TTSGenerateOptions {
    return {
      voice: this.config.voiceId,
      speed: 1.1,
      model: this.config.modelId,
    };
  }
}
```

#### 4. Mock Implementation (for tests)

```typescript
// src/lib/tts/providers/mock-tts-provider.ts

export class MockTTSProvider implements ITTSProvider {
  private calls: Array<{ text: string; options: TTSGenerateOptions }> = [];
  private shouldFail = false;
  private shouldRateLimit = false;

  async generateAudio(text: string, options: TTSGenerateOptions): Promise<Buffer> {
    this.calls.push({ text, options });
    if (this.shouldRateLimit) throw new TTSRateLimitError(60);
    if (this.shouldFail) throw new TTSProviderError('Mock failure');
    return Buffer.from(`mock-audio:${text}`);
  }

  getDefaultOptions(): TTSGenerateOptions {
    return { voice: 'mock-voice', speed: 1.0, model: 'mock-model' };
  }

  // Test helpers
  simulateRateLimit() { this.shouldRateLimit = true; }
  simulateFailure() { this.shouldFail = true; }
  getCalls() { return this.calls; }
  reset() { this.calls = []; this.shouldFail = false; this.shouldRateLimit = false; }
}
```

### Factory

```typescript
// src/lib/tts/tts-factory.ts

export class TTSFactory {
  private static provider?: ITTSProvider;

  static getProvider(): ITTSProvider {
    if (!this.provider) {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

      this.provider = new ElevenLabsProvider({
        apiKey,
        voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
        modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_v3',
        pronunciationDictionaryId: process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID,
        pronunciationDictionaryVersionId: process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID,
      });
    }
    return this.provider;
  }

  // For testing
  static setProvider(provider: ITTSProvider): void {
    this.provider = provider;
  }
}
```

### Consumer Update

#### Before:
```typescript
// src/app/api/tts/generate/route.ts
import { generateAudio, mergeTTSOptions } from '@/lib/tts/elevenlabs-client';

const audio = await generateAudio(text, mergeTTSOptions(userOptions), previousText);
```

#### After:
```typescript
// src/app/api/tts/generate/route.ts
import { TTSFactory } from '@/lib/tts/tts-factory';
import { TTSRateLimitError } from '@/lib/tts/base/tts-errors';

const provider = TTSFactory.getProvider();
const options = { ...provider.getDefaultOptions(), ...userOptions };

try {
  const audio = await provider.generateAudio(text, { ...options, previousText });
} catch (error) {
  if (error instanceof TTSRateLimitError) {
    return Response.json({ error: 'rate_limited', retryAfter: error.retryAfterSeconds }, { status: 429 });
  }
  throw error;
}
```

### Testing Benefits

```typescript
// src/__tests__/tts-generation.test.ts
describe('POST /api/tts/generate', () => {
  let mockProvider: MockTTSProvider;

  beforeEach(() => {
    mockProvider = new MockTTSProvider();
    TTSFactory.setProvider(mockProvider);
  });

  it('returns audio buffer on success', async () => {
    const response = await POST(mockRequest({ text: 'Hello world' }));
    expect(response.status).toBe(200);
    expect(mockProvider.getCalls()).toHaveLength(1);
    expect(mockProvider.getCalls()[0].text).toBe('Hello world');
  });

  it('returns 429 on rate limit', async () => {
    mockProvider.simulateRateLimit();
    const response = await POST(mockRequest({ text: 'Hello' }));
    expect(response.status).toBe(429);
  });
});
```

## Relationship with S3 Abstraction

The TTS S3 cache (`src/lib/tts/s3-cache.ts`) is being abstracted separately via the S3 storage design. The TTS provider abstraction sits at the *generation* layer only — it produces a `Buffer` that the S3 cache layer then stores. Both abstractions are independent and can be migrated in either order.

## Migration Checklist

### Phase 1: Create Base Abstractions
- [ ] Create `src/lib/tts/base/tts-provider-interface.ts` — `ITTSProvider`, `TTSGenerateOptions`
- [ ] Create `src/lib/tts/base/tts-errors.ts` — `TTSRateLimitError`, `TTSProviderError`
- [ ] Write unit tests for error types

### Phase 2: Implement Providers
- [ ] Create `src/lib/tts/providers/elevenlabs-provider.ts` — migrate logic from `elevenlabs-client.ts`
- [ ] Create `src/lib/tts/providers/mock-tts-provider.ts` — for tests
- [ ] Create `src/lib/tts/tts-factory.ts` — factory with `setProvider` for tests
- [ ] Write tests for `ElevenLabsProvider` (mock `fetch`, verify request body shape)

### Phase 3: Migrate Consumers

#### 3.1: TTS Generate Route
- [ ] Update `src/app/api/tts/generate/route.ts` to use `TTSFactory.getProvider()`
- [ ] Replace `TTSErrorCode` error handling with `TTSRateLimitError` / `TTSProviderError`
- [ ] Write tests using `MockTTSProvider`
- [ ] Mark `elevenlabs-client.ts` as deprecated

**Complexity:** Low | **Risk:** Low | **Effort:** 2–3 hours

#### 3.2: TTS Batch Generate Route
- [ ] Same as 3.1 for `src/app/api/tts/batch-generate/route.ts`

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours

#### 3.3: TTS Router (tRPC)
- [ ] Update `src/server/routers/tts.ts`
- [ ] Write tests

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours

### Phase 4: Finalization
- [ ] Remove `src/lib/tts/elevenlabs-client.ts`
- [ ] Update `src/lib/tts/types.ts` — remove `TTSErrorCode.ELEVENLABS_ERROR` if no longer referenced
- [ ] Confirm existing `tts-generation.test.ts` passes with mock provider

## Benefits Summary

### Before
- ❌ Tests require mocking global `fetch` to avoid live API calls
- ❌ ElevenLabs-specific error codes leak to all consumers
- ❌ Adding a second TTS provider requires forking the entire call site
- ❌ Pronunciation dictionary config scattered across env reads

### After
- ✅ Tests use `MockTTSProvider` — no fetch mocking needed
- ✅ Provider-neutral error types (`TTSRateLimitError`)
- ✅ Swap providers (Amazon Polly, Google TTS) by implementing `ITTSProvider`
- ✅ All ElevenLabs config injected at construction time

## File Structure

```
src/lib/tts/
├── base/
│   ├── tts-provider-interface.ts
│   └── tts-errors.ts
├── providers/
│   ├── elevenlabs-provider.ts
│   └── mock-tts-provider.ts
├── tts-factory.ts
└── index.ts                    # Public exports
```

## Open Questions

1. **Should `mergeTTSOptions` move into the factory or stay as a utility?** — It validates speed range (0.5–2.0); could be a static method on the interface or a standalone validator.
2. **Should the factory handle missing API keys gracefully?** — Currently it throws; alternatively it could return a no-op provider that logs a warning, matching the Redis fallback pattern.
3. **Second provider candidate** — If Amazon Polly is added later, voice IDs are completely different; the `TTSGenerateOptions.voice` field may need to be provider-agnostic (e.g., a logical voice name resolved by each provider).

---

**Document Owner:** Engineering Team
**Last Updated:** 2026-04-23
**Review Status:** Pending Review
