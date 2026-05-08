# OpenRouter Client Centralization

**Status:** In progress
**Scope:** Narrow — centralize HTTP-level access to OpenRouter. Per-route prompts, parsers, caching, and response shaping stay where they are.

## Why

`OPENROUTER_API_URL`, the model fallback list, the `Authorization: Bearer` header, the OpenAI-shape response extraction, and the per-model rate-limit cooldown map are duplicated across five files (`src/lib/pr-trail/generate.ts`, `scripts/test-pr-to-trail.ts`, and the three `explain-*` / `theme-commits` route handlers). The model lists already drifted into two divergent lineups — that's the maintenance tax we want gone.

We're also adopting the `openrouter/free` meta-router (released 2026-02-01), which auto-selects a free model that supports the requested features (e.g. `response_format: json_object`). That collapses the per-call-site model-rotation loop into a single hardcoded model id, which only makes sense if there's one place to change.

## Scope

**In:** the HTTP call to `/v1/chat/completions` — URL, method, auth header, OpenRouter attribution headers (`HTTP-Referer`, `X-Title`), request body envelope, response error/empty-content handling, model id default.

**Out:** prompts, system messages, `temperature`, `max_tokens`, `response_format`, parsers, in-memory caches, SSE response shaping, audience-level branching. These are domain logic and stay in each route.

## Shape

```
src/lib/openrouter/
├── client.ts      OpenRouterClient — chatCompletion({ messages, temperature, maxTokens, responseFormat, appTitle })
├── factory.ts     getOpenRouterClient() — reads OPENROUTER_API_KEY from env, throws if absent
└── index.ts       barrel
```

The client returns `{ content: string; model: string }`. It throws on non-2xx, on `data.error`, and on empty content — the route decides how to surface those (500, retry, etc.). The default model is `'openrouter/free'`; callers may override via the constructor for cases where a specific model is required.

Per-route `callOpenRouter*` helpers, `OPENROUTER_MODELS` arrays, `rateLimitedModels` maps, and `parseRetryAfter`/`getAvailableModels` helpers are deleted. The meta-router handles model selection and rate-limit avoidance internally.

## What we're explicitly **not** doing yet

- **Provider interface (`ILLMClient` + DI factory).** The aspirational design in `docs/llm-client-abstraction-design.md` covers this — multiple providers, mock clients for testing, per-feature scoped wrappers. We may pick that up later; for now we're just removing duplication, not building a test seam.
- **Scoped wrappers** (`PrTrailLLM`, `CommitExplainerLLM`, etc.). Per-route prompts and parsers are still small enough to live next to their call sites. We can extract them when a second consumer wants the same prompt.
- **Caching at the client level.** Each route already caches by its own domain key (commit-set hash, PR head SHA, etc.). Centralizing caching would require knowing what's cacheable, which is per-domain.

If/when we want testability and provider-swapping, the path is to add an `ILLMClient` interface in front of `OpenRouterClient` — the call sites won't change, only the factory.

## Migration

1. Land `src/lib/openrouter/{client,factory,index}.ts`.
2. Migrate each consumer in a single PR — no per-file feature flags, the shape is identical.
3. Delete the duplicated constants and helpers in each file.

Touched files:

- `src/lib/pr-trail/generate.ts`
- `src/app/api/pr-trail/route.ts` (no change — it already delegates)
- `src/app/api/explain-commits/route.ts`
- `src/app/api/explain-working-changes/route.ts`
- `src/app/api/theme-commits/route.ts`
- `scripts/test-pr-to-trail.ts`

## Related

- `docs/llm-client-abstraction-design.md` — broader future-state design (provider interface, scoped wrappers, mock client). Kept as the direction we'd grow into when a second LLM provider or unit-test seam is needed.
- `docs/redis-cache-abstraction-design.md` — same architectural pattern for the Redis cache layer.
