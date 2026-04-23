# Redis Cache Abstraction Design

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Design Review

## Executive Summary

This document outlines a refactoring plan to introduce dependency injection and proper abstraction for the Upstash Redis cache layer. Currently, the Redis client is a module-level lazy singleton in `src/lib/redis-cache.ts`, and all callers import free functions directly. This makes testing impossible without a real Redis connection and prevents swapping cache backends.

## Current State Analysis

### Redis Usage Inventory

| Consumer | File | Cache Keys Used | TTL Range |
|----------|------|-----------------|-----------|
| **GitHub Router** | `src/server/routers/github.ts` | ref→SHA, tree, user profile | 20 min – 1 hr |
| **Commits Route** | `src/app/api/github/repo/[owner]/[name]/commits/route.ts` | commits per page/sha | 1 min |
| **Commit Detail Route** | `src/app/api/github/repo/[owner]/[name]/commits/[sha]/route.ts` | commit by SHA | long-term (immutable) |
| **Activity Route** | `src/app/api/github/user/[username]/activity/route.ts` | user activity | 1 min |
| **Collections Routes** | `src/app/api/collections/route.ts`, `[id]/route.ts` | collection data | varies |
| **File City Routes** | `src/app/api/file-city/[owner]/[repo]/route.ts`, `file-city-data/` | generated PNGs | 24 hr |
| **VFS GitHub Backend** | `src/lib/vfs/GitHubBackend.ts` | file content, trees | varies |
| **Starred Collections** | `src/lib/starred-collections/github-metadata.ts` | GitHub metadata | varies |

### Cache Key Namespaces

All keys defined in `src/lib/redis-cache.ts`:

| Function | Key Pattern | Description |
|----------|-------------|-------------|
| `getCommitsCacheKey` | `github:v1:commits:{owner}/{repo}:{perPage}:{page}:{sha}` | Paginated commit lists |
| `getRefShaCacheKey` | `github:v1:ref:{owner}/{repo}:{ref}` | Ref → SHA resolution |
| `getTreeCacheKey` | `github:v1:tree:{owner}/{repo}:{sha}` | GitHub tree responses |
| `getCommitDetailCacheKey` | `github:v1:commit:{owner}/{repo}:{sha}` | Individual commit details (immutable) |
| `getTourAvailabilityCacheKey` | `tour-available:{parentOwner}/{parentRepo}` | Whether a fork has a tour |
| *(inline)* | `github:user-profile:{login}` | User profile data (defined inline in `github.ts`) |

### Common Problems

1. **Module-level lazy singleton** — `redisClient` and `redisInitialized` are module globals; cannot be replaced for testing
2. **Direct function imports** — callers import `getCached`, `setCached`, etc. directly with no interface boundary
3. **Hardcoded key builders** — key format functions exported alongside the client; impossible to test cache logic independently of the key shape
4. **No testability** — cannot unit test code paths that branch on cache hit vs. miss without a real Redis instance
5. **Cannot swap backends** — cannot use an in-memory cache for local development or testing

## Proposed Architecture

### Design Principles

Same as the S3 abstraction: interface segregation, dependency injection, testability first.

### Core Abstraction

#### 1. Cache Backend Interface

```typescript
// src/lib/cache/base/cache-interface.ts

export interface ICacheBackend {
  /**
   * Get cached value. Returns null on miss or failure.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Store value with TTL in seconds.
   * Non-throwing — failures must be swallowed and logged.
   */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  /**
   * Delete a key. No-op if not found.
   */
  delete(key: string): Promise<void>;

  /**
   * Fire-and-forget set. Use when you don't need to await the write.
   */
  setAsync<T>(key: string, value: T, ttlSeconds: number): void;
}
```

#### 2. Upstash Redis Implementation

```typescript
// src/lib/cache/backends/upstash-redis-backend.ts

export class UpstashRedisCacheBackend implements ICacheBackend {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
  setAsync<T>(key: string, value: T, ttlSeconds: number): void { /* ... */ }
}
```

#### 3. In-Memory Implementation (for tests and local dev)

```typescript
// src/lib/cache/backends/in-memory-cache-backend.ts

export class InMemoryCacheBackend implements ICacheBackend {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  setAsync<T>(key: string, value: T, ttlSeconds: number): void {
    this.set(key, value, ttlSeconds).catch(() => {});
  }

  /** Test helper: inspect what's in the cache */
  snapshot(): Map<string, unknown> {
    return new Map([...this.store.entries()].map(([k, v]) => [k, v.value]));
  }

  /** Test helper: clear all entries */
  clear(): void {
    this.store.clear();
  }
}
```

#### 4. GitHub-Scoped Cache

Domain-specific wrapper that encapsulates all GitHub cache key logic:

```typescript
// src/lib/cache/scopes/github-cache.ts

export class GitHubCache {
  constructor(private readonly backend: ICacheBackend) {}

  // Key constants
  static readonly TTL = {
    COMMITS: 60,
    REF_SHA: 1200,        // 20 minutes
    TREE: 3600,           // 1 hour (SHA-keyed = immutable)
    COMMIT_DETAIL: 86400, // 24 hours (SHA = immutable)
    USER_PROFILE: 3600,   // 1 hour
    TOUR_AVAILABILITY: 3600,
  } as const;

  getCommits<T>(owner: string, repo: string, perPage: number, page: number, sha?: string) {
    return this.backend.get<T>(`github:v1:commits:${owner}/${repo}:${perPage}:${page}:${sha || 'HEAD'}`);
  }

  setCommitsAsync<T>(owner: string, repo: string, perPage: number, page: number, sha: string | undefined, data: T) {
    this.backend.setAsync(`github:v1:commits:${owner}/${repo}:${perPage}:${page}:${sha || 'HEAD'}`, data, GitHubCache.TTL.COMMITS);
  }

  getRefSha(owner: string, repo: string, ref: string) {
    return this.backend.get<string>(`github:v1:ref:${owner}/${repo}:${ref}`);
  }

  setRefShaAsync(owner: string, repo: string, ref: string, sha: string) {
    this.backend.setAsync(`github:v1:ref:${owner}/${repo}:${ref}`, sha, GitHubCache.TTL.REF_SHA);
  }

  getTree<T>(owner: string, repo: string, sha: string) {
    return this.backend.get<T>(`github:v1:tree:${owner}/${repo}:${sha}`);
  }

  setTreeAsync<T>(owner: string, repo: string, sha: string, data: T) {
    this.backend.setAsync(`github:v1:tree:${owner}/${repo}:${sha}`, data, GitHubCache.TTL.TREE);
  }

  getCommitDetail<T>(owner: string, repo: string, sha: string) {
    return this.backend.get<T>(`github:v1:commit:${owner}/${repo}:${sha}`);
  }

  setCommitDetailAsync<T>(owner: string, repo: string, sha: string, data: T) {
    this.backend.setAsync(`github:v1:commit:${owner}/${repo}:${sha}`, data, GitHubCache.TTL.COMMIT_DETAIL);
  }

  getUserProfile<T>(login: string) {
    return this.backend.get<T>(`github:user-profile:${login.toLowerCase()}`);
  }

  setUserProfileAsync<T>(login: string, data: T) {
    this.backend.setAsync(`github:user-profile:${login.toLowerCase()}`, data, GitHubCache.TTL.USER_PROFILE);
  }

  getTourAvailability<T>(parentOwner: string, parentRepo: string) {
    return this.backend.get<T>(`tour-available:${parentOwner}/${parentRepo}`);
  }

  setTourAvailabilityAsync<T>(parentOwner: string, parentRepo: string, data: T) {
    this.backend.setAsync(`tour-available:${parentOwner}/${parentRepo}`, data, GitHubCache.TTL.TOUR_AVAILABILITY);
  }
}
```

### Factory

```typescript
// src/lib/cache/cache-factory.ts

export class CacheFactory {
  private static githubCache?: GitHubCache;
  private static rawBackend?: ICacheBackend;

  static getBackend(): ICacheBackend {
    if (!this.rawBackend) {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (url && token) {
        const client = new Redis({ url, token });
        this.rawBackend = new UpstashRedisCacheBackend(client);
      } else {
        console.warn('[Cache] Redis not configured — using in-memory fallback');
        this.rawBackend = new InMemoryCacheBackend();
      }
    }
    return this.rawBackend;
  }

  static getGitHubCache(): GitHubCache {
    if (!this.githubCache) {
      this.githubCache = new GitHubCache(this.getBackend());
    }
    return this.githubCache;
  }

  // For testing
  static setBackend(backend: ICacheBackend): void {
    this.rawBackend = backend;
    this.githubCache = undefined; // reset scoped caches
  }
}
```

### Testing Benefits

```typescript
describe('GET /api/github/repo/[owner]/[name]/commits', () => {
  let mockCache: InMemoryCacheBackend;

  beforeEach(() => {
    mockCache = new InMemoryCacheBackend();
    CacheFactory.setBackend(mockCache);
  });

  it('returns cached commits without calling GitHub', async () => {
    const cached = [{ sha: 'abc123', message: 'fix: something' }];
    await mockCache.set('github:v1:commits:owner/repo:10:1:HEAD', cached, 60);

    const response = await GET(mockRequest({ owner: 'owner', name: 'repo' }));
    expect(response.status).toBe(200);
    // GitHub API was never called
  });

  it('sets cache on miss', async () => {
    // ... test that a miss triggers a write
    expect(mockCache.snapshot().has('github:v1:commits:owner/repo:10:1:HEAD')).toBe(true);
  });
});
```

## Migration Checklist

### Phase 1: Create Base Abstractions
- [ ] Create `src/lib/cache/base/cache-interface.ts` — core `ICacheBackend` interface
- [ ] Create `src/lib/cache/backends/upstash-redis-backend.ts` — Upstash implementation
- [ ] Create `src/lib/cache/backends/in-memory-cache-backend.ts` — test/dev implementation
- [ ] Create `src/lib/cache/cache-factory.ts` — factory with Redis/in-memory fallback
- [ ] Write unit tests for `InMemoryCacheBackend` (TTL expiry, snapshot, clear)

### Phase 2: Migrate Scoped Caches
- [ ] Create `src/lib/cache/scopes/github-cache.ts` — domain wrapper
- [ ] Write tests for `GitHubCache` (key generation, TTL constants)

### Phase 3: Migrate Consumers (one by one)

#### 3.1: GitHub Router
- [ ] Update `src/server/routers/github.ts` to use `CacheFactory.getGitHubCache()`
- [ ] Remove direct imports from `@/lib/redis-cache`
- [ ] Write tests that use `InMemoryCacheBackend`
- [ ] Verify production behavior

**Complexity:** Low | **Risk:** Low | **Effort:** 2–3 hours

#### 3.2: Commits Routes
- [ ] Update `commits/route.ts` and `commits/[sha]/route.ts`
- [ ] Write tests

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours

#### 3.3: Activity, Collections, File City, VFS, Starred Collections
- [ ] Update remaining 6 consumers one by one
- [ ] Write tests for each

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours each

### Phase 4: Finalization
- [ ] Mark `src/lib/redis-cache.ts` as deprecated
- [ ] Remove all direct imports from the old module
- [ ] Delete `src/lib/redis-cache.ts`
- [ ] Verify no regressions in production metrics

## Migration Order Recommendation

1. **GitHub Router** (most usage, establishes the pattern)
2. **Commits Routes** (straightforward, high value)
3. **VFS GitHub Backend** (isolated)
4. **Remaining consumers** (activity, collections, file-city, starred-collections)

## Benefits Summary

### Before
- ❌ Cannot unit test cache-hit/miss branching without Redis
- ❌ Module-level singleton
- ❌ Key format baked into free functions at call sites
- ❌ No in-memory fallback for local dev without Redis configured

### After
- ✅ Full unit tests with `InMemoryCacheBackend`
- ✅ Cache key logic lives in one typed place per domain
- ✅ In-memory backend automatically used when Redis is unconfigured
- ✅ Easy to add middleware (metrics, logging, prefixing)

## File Structure

```
src/lib/cache/
├── base/
│   └── cache-interface.ts
├── backends/
│   ├── upstash-redis-backend.ts
│   └── in-memory-cache-backend.ts
├── scopes/
│   └── github-cache.ts
├── cache-factory.ts
└── index.ts
```

## Open Questions

1. **Should other domains get scoped caches?** — Collections and file-city have their own key patterns; they could get `CollectionsCache`, `FileCityCache`, etc.
2. **Should `InMemoryCacheBackend` be the default in non-production?** — Useful for local dev without Redis credentials.
3. **Key versioning** — Current keys use `github:v1:…`; the scoped cache is a good place to enforce this convention going forward.

---

**Document Owner:** Engineering Team
**Last Updated:** 2026-04-23
**Review Status:** Pending Review
