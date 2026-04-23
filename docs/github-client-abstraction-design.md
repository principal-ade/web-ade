# GitHub Client Abstraction Design

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Design Review

## Executive Summary

This document outlines a refactoring plan to introduce dependency injection and a repository service interface for GitHub API access. Currently, GitHub calls are made directly via `fetch` + `@octokit/rest` across multiple layers — API routes, tRPC routers, lib adapters — with caching strategies spread across Next.js `unstable_cache`, Upstash Redis, and S3. There is no single interface boundary, making tests dependent on GitHub's API and rate limits, and preventing mock repositories or alternative Git hosts.

## Current State Analysis

### GitHub Usage Inventory

| File | Method | Primary Use |
|------|--------|-------------|
| `src/lib/github-cache.ts` | `fetch` (direct) | Cached GET requests — commits, trees, repo info, user repos, orgs |
| `src/server/routers/github.ts` | `fetch` (direct) + Redis | Tree resolution, ref→SHA, tour availability, user profiles |
| `src/lib/vfs/GitHubBackend.ts` | `fetch` (direct) + Redis | Virtual file system — file content, directory listings |
| `src/lib/tts/github-fetcher.ts` | (direct) | Fetch files for TTS narration |
| `src/lib/starred-collections/github-metadata.ts` | (direct) | Repo and user metadata for collections |
| `src/lib/starred-collections/github-org.ts` | (direct) | Organization membership checks |
| `src/app/api/github/**` | `fetch` (direct) | Commits, issues, PRs, stargazers, search, permissions, packages |

### Caching Architecture (Current)

GitHub data flows through three independent caching layers with no coordination:

```
Request
  │
  ▼
Next.js unstable_cache       ← github-cache.ts (shared & user-scoped)
  │ miss
  ▼
Upstash Redis                ← github.ts router, GitHubBackend.ts
  │ miss
  ▼
AWS S3                       ← github-tree-s3-cache.ts (tree responses only)
  │ miss
  ▼
GitHub API
```

Each layer is called ad hoc at individual call sites. Cache TTLs are defined in:
- `src/lib/github-cache.ts`: `CACHE_TTL` constants (60s commits → 1800s contributors)
- `src/lib/redis-cache.ts`: key builders (no TTL constants — callers pass TTL inline)
- `src/lib/github-tree-s3-cache.ts`: implicit (tree SHAs are immutable)

### Common Problems

1. **No interface** — 7+ files import from GitHub directly; there is no `IGitHubClient` to mock
2. **Three independent cache layers** — logic duplicated; a cache miss at one layer does not automatically fall through to the next in a principled way
3. **Hardcoded `GITHUB_API_BASE`** — `https://api.github.com` appears in multiple files
4. **Token handling varies** — some routes read from cookies inline; others accept a `token` param; some use the public PAT
5. **No testability** — tests either skip GitHub calls entirely or hit the live API (subject to rate limits)
6. **Tight coupling to REST shape** — callers work directly with raw API response shapes, no domain model translation

## Proposed Architecture

### Design Principles

- Define an `IRepositoryService` interface covering the operations the app actually uses
- Separate the interface (what) from the implementation (GitHub REST, mock, future GraphQL)
- Centralise the three-layer cache behind the service — callers never touch Redis or S3 directly for GitHub data
- Accept the GitHub token via constructor injection, not cookie reads

### Core Abstraction

#### 1. Repository Service Interface

```typescript
// src/lib/github/base/repository-service-interface.ts

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: { name: string; date: string };
  additions?: number;
  deletions?: number;
}

export interface RepoInfo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  owner: { login: string; avatar_url: string; type: 'User' | 'Organization' };
}

export interface FileContent {
  content: string;
  sha: string;
  size: number;
  encoding: string;
}

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface IRepositoryService {
  // Repository metadata
  getRepo(ref: RepoRef): Promise<RepoInfo>;

  // Commits
  getCommits(ref: RepoRef, options?: { perPage?: number; page?: number; sha?: string }): Promise<CommitSummary[]>;
  getCommit(ref: RepoRef, sha: string): Promise<CommitSummary>;

  // Files & trees
  getFile(ref: RepoRef, path: string, gitRef?: string): Promise<FileContent>;
  getTree(ref: RepoRef, gitRef?: string): Promise<TreeEntry[]>;
  resolveRef(ref: RepoRef, gitRef: string): Promise<string>; // ref → SHA

  // User & social
  getUserProfile(login: string): Promise<{ login: string; name: string | null; avatar_url: string; type: 'User' | 'Organization' }>;
  getUserRepos(options?: { sort?: string; perPage?: number }): Promise<RepoInfo[]>;
  getOrgRepos(org: string, options?: { perPage?: number }): Promise<RepoInfo[]>;

  // Interactions
  starRepo(ref: RepoRef): Promise<void>;
  unstarRepo(ref: RepoRef): Promise<void>;
}
```

#### 2. GitHub REST Implementation

```typescript
// src/lib/github/implementations/github-rest-service.ts

export interface GitHubRestConfig {
  token?: string;          // user OAuth token (optional — falls back to publicPat)
  publicPat?: string;      // GITHUB_PUBLIC_PAT env var
  baseUrl?: string;        // default: https://api.github.com
  cache?: ICacheBackend;   // Redis cache backend (from cache abstraction)
}

export class GitHubRestService implements IRepositoryService {
  constructor(private readonly config: GitHubRestConfig) {}

  async getCommits(ref: RepoRef, options = {}): Promise<CommitSummary[]> {
    // 1. Check Redis cache (getCommitsCacheKey from cache abstraction)
    // 2. On miss: fetch from GitHub API
    // 3. Store in cache async
    // 4. Return normalised CommitSummary[]
  }

  async getTree(ref: RepoRef, gitRef = 'HEAD'): Promise<TreeEntry[]> {
    // 1. resolveRef → SHA
    // 2. Check Redis cache (getTreeCacheKey)
    // 3. On miss: check S3 cache (getTreeFromS3Cache)
    // 4. On miss: fetch from GitHub API
    // 5. Store in Redis + S3 async
    // 6. Return normalised TreeEntry[]
  }

  // ... other methods
}
```

The three-layer cache waterfall is **encapsulated inside this class**, not at call sites.

#### 3. Mock Implementation

```typescript
// src/lib/github/implementations/mock-repository-service.ts

export class MockRepositoryService implements IRepositoryService {
  private repos = new Map<string, RepoInfo>();
  private commits = new Map<string, CommitSummary[]>();
  private files = new Map<string, FileContent>();
  private trees = new Map<string, TreeEntry[]>();

  // Seed helpers for tests
  seedRepo(ref: RepoRef, info: Partial<RepoInfo>): void { /* ... */ }
  seedCommits(ref: RepoRef, commits: CommitSummary[]): void { /* ... */ }
  seedFile(ref: RepoRef, path: string, content: FileContent): void { /* ... */ }
  seedTree(ref: RepoRef, entries: TreeEntry[]): void { /* ... */ }

  async getRepo(ref: RepoRef): Promise<RepoInfo> {
    const key = `${ref.owner}/${ref.repo}`;
    const repo = this.repos.get(key);
    if (!repo) throw new GitHubNotFoundError(`Repo ${key} not seeded`);
    return repo;
  }

  // ... other methods follow same pattern
}
```

### Factory

```typescript
// src/lib/github/github-service-factory.ts

export class GitHubServiceFactory {
  private static services = new Map<string, IRepositoryService>();
  private static mockService?: IRepositoryService;

  /**
   * Get a service instance scoped to a user token.
   * Authenticated requests use the user's OAuth token.
   * Unauthenticated requests use the public PAT.
   */
  static getService(token?: string | null): IRepositoryService {
    if (this.mockService) return this.mockService;

    const key = token ? `user:${token.substring(0, 8)}` : 'public';

    if (!this.services.has(key)) {
      this.services.set(key, new GitHubRestService({
        token: token ?? undefined,
        publicPat: process.env.GITHUB_PUBLIC_PAT,
        cache: CacheFactory.getBackend(), // from cache abstraction
      }));
    }

    return this.services.get(key)!;
  }

  // For testing
  static setMockService(service: IRepositoryService): void {
    this.mockService = service;
    this.services.clear();
  }

  static clearMock(): void {
    this.mockService = undefined;
    this.services.clear();
  }
}
```

### Consumer Update

#### Before (tRPC GitHub Router):
```typescript
// src/server/routers/github.ts
const cacheKey = getRefShaCacheKey(owner, repo, ref);
let sha = await getCached<string>(cacheKey);
if (!sha) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${ref}`, { headers });
  // ... parse, cache, etc.
}
```

#### After:
```typescript
// src/server/routers/github.ts
const github = GitHubServiceFactory.getService(token);
const sha = await github.resolveRef({ owner, repo }, ref);
// Caching is the service's responsibility
```

### Testing Benefits

```typescript
describe('getTree tRPC procedure', () => {
  let mockGitHub: MockRepositoryService;

  beforeEach(() => {
    mockGitHub = new MockRepositoryService();
    GitHubServiceFactory.setMockService(mockGitHub);
  });

  afterEach(() => GitHubServiceFactory.clearMock());

  it('returns seeded tree', async () => {
    mockGitHub.seedTree({ owner: 'acme', repo: 'web' }, [
      { path: 'src/index.ts', type: 'blob', sha: 'abc', size: 100 },
    ]);

    const result = await caller.getTree({ owner: 'acme', repo: 'web' });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/index.ts');
  });

  it('throws not found for unknown repo', async () => {
    await expect(caller.getTree({ owner: 'ghost', repo: 'nowhere' }))
      .rejects.toThrow('not seeded');
  });
});
```

## Migration Checklist

### Phase 1: Create Base Abstractions
- [ ] Create `src/lib/github/base/repository-service-interface.ts` — `IRepositoryService` + domain types
- [ ] Create `src/lib/github/base/github-errors.ts` — `GitHubNotFoundError`, `GitHubRateLimitError`, `GitHubAuthError`
- [ ] Write unit tests for error types

**Note:** This phase must come *after* or in parallel with the Redis cache abstraction — `GitHubRestService` will depend on `ICacheBackend`.

### Phase 2: Implement Service
- [ ] Create `src/lib/github/implementations/github-rest-service.ts`
  - Migrate caching waterfall from `github.ts`, `github-cache.ts`, `GitHubBackend.ts`
  - Centralise token handling
  - Implement all `IRepositoryService` methods
- [ ] Create `src/lib/github/implementations/mock-repository-service.ts`
- [ ] Create `src/lib/github/github-service-factory.ts`
- [ ] Write tests for `GitHubRestService` (mock `fetch`, verify cache layer order)
- [ ] Write tests for `MockRepositoryService` (seed and query)

**Complexity:** High | **Risk:** Medium | **Effort:** 8–12 hours

### Phase 3: Migrate Consumers (highest value first)

#### 3.1: tRPC GitHub Router
- [ ] Update `src/server/routers/github.ts` to use `GitHubServiceFactory.getService(token)`
- [ ] Remove direct Redis cache calls (now inside the service)
- [ ] Remove `GITHUB_API_BASE` constant
- [ ] Write tests using `MockRepositoryService`
- [ ] Verify production behavior

**Complexity:** Medium | **Risk:** Medium | **Effort:** 4–6 hours

#### 3.2: VFS GitHub Backend
- [ ] Update `src/lib/vfs/GitHubBackend.ts`
- [ ] Write tests

**Complexity:** Medium | **Risk:** Low | **Effort:** 3–4 hours

#### 3.3: TTS GitHub Fetcher
- [ ] Update `src/lib/tts/github-fetcher.ts`

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours

#### 3.4: Starred Collections Helpers
- [ ] Update `github-metadata.ts` and `github-org.ts`

**Complexity:** Low | **Risk:** Low | **Effort:** 1–2 hours

#### 3.5: API Routes (`src/app/api/github/**`)
- [ ] Update each route to use the factory
- [ ] Most routes already delegate to `github-cache.ts`; after the service wraps that, routes become thin

**Complexity:** Low–Medium | **Risk:** Low | **Effort:** 4–6 hours total

### Phase 4: Finalization
- [ ] Remove `src/lib/github-cache.ts` (folded into `GitHubRestService`)
- [ ] Deprecate then remove `GITHUB_API_BASE` constants across files
- [ ] Remove direct Redis imports from all GitHub consumer files
- [ ] Remove direct S3 tree cache imports from all GitHub consumer files
- [ ] Confirm OTEL spans still fire (move instrumentation into `GitHubRestService`)
- [ ] Performance benchmarking — verify three-layer cache hit rates unchanged

## Migration Order Recommendation

1. **Phase 1** — interfaces and errors (no production impact)
2. **Phase 2** — implement `GitHubRestService` + `MockRepositoryService` (no callers yet)
3. **Phase 3.1** — tRPC router (highest call volume, best signal)
4. **Phase 3.2–3.4** — remaining lib files
5. **Phase 3.5** — API routes (lowest risk, thin wrappers)
6. **Phase 4** — cleanup

**Dependency:** The Redis cache abstraction should be completed before Phase 2, since `GitHubRestService` will accept an `ICacheBackend`.

## Benefits Summary

### Before
- ❌ Cannot test any GitHub-dependent route without live API or full fetch mocking
- ❌ Three-layer cache logic duplicated across 4+ files
- ❌ Token handling inconsistent (cookies, params, env vars)
- ❌ OTEL instrumentation scattered at call sites
- ❌ Tight coupling to GitHub REST API response shapes

### After
- ✅ Any route tested in < 1ms with `MockRepositoryService`
- ✅ Cache waterfall (Redis → S3 → GitHub API) in one place
- ✅ Token injected at construction — no cookie reads inside library code
- ✅ OTEL spans in one implementation class
- ✅ Extension point for GraphQL API, GitHub Enterprise, or mock repos

## File Structure

```
src/lib/github/
├── base/
│   ├── repository-service-interface.ts
│   └── github-errors.ts
├── implementations/
│   ├── github-rest-service.ts
│   └── mock-repository-service.ts
├── github-service-factory.ts
└── index.ts
```

## Open Questions

1. **Scope of domain types** — Should `IRepositoryService` return rich domain types (defined here) or keep raw GitHub API shapes? Rich types mean more translation work upfront but decouple consumers from API versioning.
2. **Pagination** — Most methods return arrays; should the interface support async iterators or cursor-based pagination for large result sets?
3. **GitHub GraphQL** — Several pieces of data (pinned repos, contribution graph) already use GraphQL via separate mechanisms. Should `IRepositoryService` cover those, or stay REST-only?
4. **Cache invalidation** — After this abstraction, cache invalidation (e.g., post-push webhook) would be a single method on the service. Worth designing the hook point now.
5. **Per-user vs. shared service instances** — The factory caches one service per token prefix; consider whether a single shared instance with token-per-call is cleaner.

---

**Document Owner:** Engineering Team
**Last Updated:** 2026-04-23
**Review Status:** Pending Review
