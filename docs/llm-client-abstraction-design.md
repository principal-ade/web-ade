# LLM Client Abstraction Design

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Design Review

## Executive Summary

This document outlines a refactoring plan to introduce dependency injection and a provider interface for LLM completions. Currently, the commit explanation feature (`src/app/api/explain-commits/route.ts`) implements all LLM logic inline: direct `fetch` calls to OpenRouter, model rotation, rate-limit state, and in-memory caching. None of this is testable in isolation, and the logic cannot be reused or swapped without rewriting the route.

## Current State Analysis

### LLM Usage Inventory

| Consumer | File | Purpose |
|----------|------|---------|
| **Explain Commits** | `src/app/api/explain-commits/route.ts` | Generate AI summaries of commit groups for maintainers and non-technical audiences |

This is currently the only LLM call site. The abstraction is motivated by:
- Making the route testable without live API calls
- Extracting model-rotation and rate-limit logic into a reusable component
- Leaving a clean extension point for future LLM features (code review, PR summaries, etc.)

### Current Implementation

Everything lives inside `route.ts`:

| Concern | Implementation |
|---------|----------------|
| **HTTP client** | Raw `fetch` to `https://openrouter.ai/api/v1/chat/completions` |
| **Auth** | `process.env.OPENROUTER_API_KEY` read at request time |
| **Model list** | `OPENROUTER_MODELS` constant (4 models) |
| **Rate-limit tracking** | `rateLimitedModels: Map<string, number>` module-level singleton |
| **Model rotation** | `getAvailableModels()` filters out cooled-down models; tries in order |
| **In-memory cache** | `explanationCache: Map<string, {text, timestamp}>` with 24-hour TTL |
| **Prompt building** | `buildPrompt()` — two templates (`maintainer` / `non-technical`) |
| **Streaming response** | SSE format (`data: ...`) even though the full text is returned at once |

### Common Problems

1. **Module-level singletons** — `explanationCache` and `rateLimitedModels` are globals; they cannot be reset between tests or injected
2. **No interface** — impossible to swap OpenRouter for another provider (Anthropic, OpenAI) without rewriting the route
3. **Prompt logic entangled with HTTP logic** — `buildPrompt` is a pure function but lives inside a file full of API concerns
4. **No testability** — tests would need to intercept `fetch` globally
5. **Rate-limit state not shared across instances** — on Amplify/serverless, each cold start loses the cooldown map; the abstraction is a good place to eventually move this to Redis

## Proposed Architecture

### Core Abstraction

#### 1. LLM Client Interface

```typescript
// src/lib/llm/base/llm-client-interface.ts

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCompletion {
  text: string;
  model: string;
}

export interface ILLMClient {
  /**
   * Generate a completion for the given messages.
   * @throws LLMRateLimitError | LLMProviderError
   */
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletion>;
}
```

#### 2. Provider-Neutral Error Types

```typescript
// src/lib/llm/base/llm-errors.ts

export class LLMRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds?: number) {
    super('LLM rate limit exceeded');
    this.name = 'LLMRateLimitError';
  }
}

export class LLMProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export class LLMAllModelsExhaustedError extends LLMRateLimitError {
  constructor() {
    super(60);
    this.name = 'LLMAllModelsExhaustedError';
  }
}
```

#### 3. OpenRouter Implementation with Model Rotation

```typescript
// src/lib/llm/providers/openrouter-client.ts

export interface OpenRouterConfig {
  apiKey: string;
  models: readonly string[];
  rateLimitCooldownMs?: number; // default: 60_000
  siteUrl?: string;
  siteTitle?: string;
}

export class OpenRouterClient implements ILLMClient {
  private rateLimitedModels = new Map<string, number>();

  constructor(private readonly config: OpenRouterConfig) {}

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletion> {
    const availableModels = this.getAvailableModels();

    if (availableModels.length === 0) {
      throw new LLMAllModelsExhaustedError();
    }

    let lastError: string | undefined;

    for (const model of availableModels) {
      const result = await this.tryModel(model, messages, options);

      if (result.success) {
        return { text: result.text!, model };
      }

      if (result.rateLimited) {
        this.markModelRateLimited(model, result.retryAfterSeconds);
        lastError = result.error;
        continue;
      }

      lastError = result.error;
    }

    throw new LLMProviderError(lastError || 'All models failed');
  }

  private getAvailableModels(): string[] {
    const now = Date.now();
    return this.config.models.filter((model) => {
      const until = this.rateLimitedModels.get(model);
      if (!until) return true;
      if (now > until) {
        this.rateLimitedModels.delete(model);
        return true;
      }
      return false;
    });
  }

  private markModelRateLimited(model: string, retryAfterSeconds?: number): void {
    const cooldown = retryAfterSeconds
      ? retryAfterSeconds * 1000
      : (this.config.rateLimitCooldownMs ?? 60_000);
    this.rateLimitedModels.set(model, Date.now() + cooldown);
  }

  private async tryModel(model: string, messages: LLMMessage[], options?: LLMCompletionOptions) {
    // fetch logic extracted from route.ts callOpenRouterApi
  }
}
```

#### 4. Mock Implementation

```typescript
// src/lib/llm/providers/mock-llm-client.ts

export class MockLLMClient implements ILLMClient {
  private responses: string[] = [];
  private callCount = 0;
  private shouldRateLimit = false;

  async complete(messages: LLMMessage[]): Promise<LLMCompletion> {
    if (this.shouldRateLimit) throw new LLMRateLimitError(60);
    const text = this.responses[this.callCount] ?? `mock response ${this.callCount}`;
    this.callCount++;
    return { text, model: 'mock-model' };
  }

  // Test helpers
  queueResponse(text: string) { this.responses.push(text); }
  simulateRateLimit() { this.shouldRateLimit = true; }
  getCallCount() { return this.callCount; }
  reset() { this.responses = []; this.callCount = 0; this.shouldRateLimit = false; }
}
```

### Commit Explainer Service

Prompt-building and caching logic extracted into a dedicated service:

```typescript
// src/lib/llm/services/commit-explainer.ts

export type AudienceLevel = 'maintainer' | 'non-technical';

export interface CommitData {
  sha: string;
  message: string;
  author: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

export class CommitExplainer {
  private cache = new Map<string, { text: string; timestamp: number }>();
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000;

  constructor(private readonly llmClient: ILLMClient) {}

  async explain(commits: CommitData[], audienceLevel: AudienceLevel, repoName: string): Promise<string> {
    const cacheKey = this.getCacheKey(commits, audienceLevel, repoName);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const prompt = this.buildPrompt(commits, audienceLevel, repoName);
    const completion = await this.llmClient.complete([{ role: 'user', content: prompt }], {
      temperature: 0.7,
      maxTokens: 512,
    });

    this.setCache(cacheKey, completion.text);
    return completion.text;
  }

  private buildPrompt(commits: CommitData[], audienceLevel: AudienceLevel, repoName: string): string {
    // Extracted from route.ts buildPrompt()
  }

  private getCacheKey(commits: CommitData[], audienceLevel: string, repoName: string): string {
    // Extracted from route.ts getCacheKey()
  }

  private getFromCache(key: string): string | null { /* ... */ }
  private setCache(key: string, text: string): void { /* ... */ }
}
```

### Factory

```typescript
// src/lib/llm/llm-factory.ts

const OPENROUTER_MODELS = [
  'google/gemini-3.1-flash-lite-preview',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-3.1-flash-image-preview',
] as const;

export class LLMFactory {
  private static client?: ILLMClient;
  private static commitExplainer?: CommitExplainer;

  static getClient(): ILLMClient {
    if (!this.client) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

      this.client = new OpenRouterClient({
        apiKey,
        models: OPENROUTER_MODELS,
        siteUrl: 'https://web-ade.dev',
        siteTitle: 'Web ADE Commit Explainer',
      });
    }
    return this.client;
  }

  static getCommitExplainer(): CommitExplainer {
    if (!this.commitExplainer) {
      this.commitExplainer = new CommitExplainer(this.getClient());
    }
    return this.commitExplainer;
  }

  // For testing
  static setClient(client: ILLMClient): void {
    this.client = client;
    this.commitExplainer = undefined;
  }
}
```

### Consumer Update

#### Before:
```typescript
// src/app/api/explain-commits/route.ts
// ~350 lines of mixed HTTP, caching, prompt, and rate-limit logic
```

#### After:
```typescript
// src/app/api/explain-commits/route.ts
import { LLMFactory } from '@/lib/llm/llm-factory';
import { LLMRateLimitError } from '@/lib/llm/base/llm-errors';

export async function POST(req: NextRequest) {
  const { commits, audienceLevel, repoName } = await req.json() as ExplainRequest;

  try {
    const explainer = LLMFactory.getCommitExplainer();
    const text = await explainer.explain(commits, audienceLevel, repoName);
    // ... return SSE response
  } catch (error) {
    if (error instanceof LLMRateLimitError) {
      return Response.json({ error: 'rate_limited', retryAfter: error.retryAfterSeconds }, { status: 429 });
    }
    throw error;
  }
}
```

### Testing Benefits

```typescript
describe('POST /api/explain-commits', () => {
  let mockClient: MockLLMClient;

  beforeEach(() => {
    mockClient = new MockLLMClient();
    LLMFactory.setClient(mockClient);
  });

  it('returns explanation on success', async () => {
    mockClient.queueResponse('This PR adds login functionality');
    const res = await POST(mockRequest({ commits: [...], audienceLevel: 'maintainer', repoName: 'my-app' }));
    expect(res.status).toBe(200);
    expect(mockClient.getCallCount()).toBe(1);
  });

  it('returns 429 when all models are rate limited', async () => {
    mockClient.simulateRateLimit();
    const res = await POST(mockRequest({ commits: [...], audienceLevel: 'maintainer', repoName: 'my-app' }));
    expect(res.status).toBe(429);
  });

  it('returns cached result on second request', async () => {
    mockClient.queueResponse('Cached result');
    await POST(mockRequest({ commits: sameCommits, audienceLevel: 'maintainer', repoName: 'my-app' }));
    await POST(mockRequest({ commits: sameCommits, audienceLevel: 'maintainer', repoName: 'my-app' }));
    expect(mockClient.getCallCount()).toBe(1); // only called once
  });
});
```

## Migration Checklist

### Phase 1: Create Base Abstractions
- [ ] Create `src/lib/llm/base/llm-client-interface.ts` — `ILLMClient`, message/completion types
- [ ] Create `src/lib/llm/base/llm-errors.ts` — `LLMRateLimitError`, `LLMProviderError`, `LLMAllModelsExhaustedError`

### Phase 2: Implement Client and Service
- [ ] Create `src/lib/llm/providers/openrouter-client.ts` — migrate logic from `route.ts`
- [ ] Create `src/lib/llm/providers/mock-llm-client.ts`
- [ ] Create `src/lib/llm/services/commit-explainer.ts` — migrate prompt + cache logic
- [ ] Create `src/lib/llm/llm-factory.ts`
- [ ] Write tests for `OpenRouterClient` (model rotation, rate-limit cooldown)
- [ ] Write tests for `CommitExplainer` (cache hit/miss, prompt variants)

**Complexity:** Medium | **Risk:** Low | **Effort:** 4–5 hours

### Phase 3: Migrate Consumer
- [ ] Rewrite `src/app/api/explain-commits/route.ts` to use `LLMFactory`
- [ ] Write integration tests for the route
- [ ] Verify production behavior

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours

### Phase 4: Finalization
- [ ] Confirm `rateLimitedModels` state is acceptable as instance-level (per cold start) or move to Redis if cross-instance coordination needed
- [ ] Update any documentation referencing the old route implementation

## Benefits Summary

### Before
- ❌ ~350-line route mixes HTTP, caching, prompt, and rate-limit concerns
- ❌ Cannot test without intercepting global `fetch`
- ❌ Rate-limit state and in-memory cache are unkillable module globals
- ❌ No path to add more LLM-powered features without copy-pasting the boilerplate

### After
- ✅ Route is ~30 lines
- ✅ `CommitExplainer` is independently testable with `MockLLMClient`
- ✅ Model rotation logic tested in isolation
- ✅ `ILLMClient` is a ready extension point for future features (PR summaries, code review)

## File Structure

```
src/lib/llm/
├── base/
│   ├── llm-client-interface.ts
│   └── llm-errors.ts
├── providers/
│   ├── openrouter-client.ts
│   └── mock-llm-client.ts
├── services/
│   └── commit-explainer.ts
├── llm-factory.ts
└── index.ts
```

## Open Questions

1. **Should in-memory cache move to `ICacheBackend`?** — The `CommitExplainer` cache and the Redis cache abstraction are separate concerns, but they could share the same backend once both abstractions exist. Particularly useful if we want 24-hour cross-instance caching.
2. **Should `rateLimitedModels` move to Redis?** — On serverless, each instance has its own cooldown map; a shared Redis key would prevent unnecessary retries across instances.
3. **Should `CommitExplainer` accept an `ICacheBackend` as well?** — Would let tests inject `InMemoryCacheBackend` and verify caching behavior without the `Map` singleton.

---

**Document Owner:** Engineering Team
**Last Updated:** 2026-04-23
**Review Status:** Pending Review
