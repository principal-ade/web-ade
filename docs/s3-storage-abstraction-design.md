# S3 Storage Abstraction Design

**Version:** 1.0
**Date:** 2026-04-20
**Status:** Design Review

## Executive Summary

This document outlines a refactoring plan to introduce dependency injection (DI) and proper abstraction for S3 storage operations across the web-ADE codebase. Currently, all S3 storage implementations use module-level singleton S3Client instances, making testing difficult and preventing flexible storage backend swapping.

## Current State Analysis

### S3 Usage Inventory

We have **7 distinct S3 storage implementations** across the codebase:

| Module | File | Bucket Name | Primary Use Case | Operations |
|--------|------|-------------|------------------|------------|
| **Starred Collections** | `src/lib/starred-collections/s3-storage.ts` | `feed-collections` | User-created collections of starred repos | GET, PUT, DELETE, ETag-based optimistic locking |
| **Feed Collections** | `src/lib/feed-collections/s3-storage.ts` | `feed-collections` | Feed collections & user profiles | GET, PUT, DELETE, LIST |
| **Line Counts** | `src/lib/line-counts/s3-cache.ts` | `repo-tour-audio` | Cache of repository line counts | GET, PUT, HEAD |
| **GitHub Trees** | `src/lib/github-tree-s3-cache.ts` | `repo-tour-audio` | Cache of GitHub tree API responses | GET, PUT |
| **File City** | `src/lib/file-city/s3-cache.ts` | `repo-tour-audio` | Cache of generated File City PNGs | HEAD, PUT |
| **TTS Audio** | `src/lib/tts/s3-cache.ts` | `repo-tour-audio` | Cache of TTS-generated audio files | HEAD, PUT, GET metadata |
| **Version Registry** | `src/lib/version-registry/s3-storage.ts` | `principal-view-data` | Version-to-commit mappings & schematics | GET, PUT, DELETE, LIST, HEAD |

### Shared S3 Buckets

Note that multiple modules share buckets:

- **`feed-collections`**: Shared by Starred Collections and Feed Collections (using different prefixes)
- **`repo-tour-audio`**: Shared by Line Counts, GitHub Trees, File City, and TTS (using different prefixes)
- **`principal-view-data`**: Currently only Version Registry

### Common Problems

All implementations suffer from:

1. **Module-level singleton S3Client** - Cannot be mocked or replaced for testing
2. **Direct function imports** - No interface abstraction, tight coupling
3. **Hardcoded configuration** - Environment variables baked into module initialization
4. **No testability** - Cannot unit test without hitting real S3
5. **Cannot swap backends** - Cannot use local filesystem, mock storage, or alternative cloud providers

## Proposed Architecture

### Design Principles

1. **Interface Segregation** - Define small, focused interfaces for storage operations
2. **Dependency Injection** - Accept dependencies via constructor
3. **Single Responsibility** - Separate bucket access from business logic
4. **Testability** - Enable mocking through interfaces
5. **Backward Compatibility** - Minimal changes to consuming code during migration

### Core Abstractions

#### 1. Base Storage Interface

```typescript
/**
 * Base interface for all S3 storage operations
 *
 * Implementations handle bucket-specific logic, key building,
 * and AWS SDK interactions.
 */
export interface IStorageBackend {
  /**
   * Get object from storage
   * @returns Object data or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Put object to storage
   * @returns The S3 key where object was stored
   */
  put<T>(key: string, data: T, options?: PutOptions): Promise<string>;

  /**
   * Check if object exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete object from storage
   * @returns true if deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * List objects with optional prefix
   */
  list(prefix: string): Promise<string[]>;
}

export interface PutOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}
```

#### 2. ETag-Aware Storage Interface

For storage that requires optimistic locking (e.g., Starred Collections):

```typescript
/**
 * Extended interface for storage with optimistic locking
 */
export interface IETagStorage extends IStorageBackend {
  /**
   * Get object with ETag for optimistic locking
   */
  getWithETag<T>(key: string): Promise<{ data: T; etag: string } | null>;

  /**
   * Put object with ETag check
   * @throws StorageConflictError if ETag doesn't match
   */
  putWithETag<T>(
    key: string,
    data: T,
    etag: string | null,
    options?: PutOptions
  ): Promise<string>;
}
```

#### 3. Base S3 Storage Class

Abstract base class that handles common AWS SDK operations:

```typescript
/**
 * Abstract base class for S3 storage implementations
 *
 * Handles common S3 operations and provides hooks for
 * bucket-specific configuration.
 */
export abstract class S3StorageBase implements IStorageBackend {
  constructor(
    protected readonly s3Client: S3Client,
    protected readonly config: S3StorageConfig
  ) {}

  // Implement common operations using s3Client
  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async put<T>(key: string, data: T, options?: PutOptions): Promise<string> { /* ... */ }
  async exists(key: string): Promise<boolean> { /* ... */ }
  async delete(key: string): Promise<boolean> { /* ... */ }
  async list(prefix: string): Promise<string[]> { /* ... */ }

  // Abstract methods for subclasses to implement
  protected abstract getBucketName(): string;
  protected abstract buildKey(key: string): string;
}

export interface S3StorageConfig {
  bucketName: string;
  region: string;
  prefix?: string;
  defaultCacheControl?: string;
}
```

#### 4. ETag-Aware S3 Storage Class

```typescript
/**
 * S3 storage with optimistic locking support
 */
export abstract class S3ETagStorageBase
  extends S3StorageBase
  implements IETagStorage {

  async getWithETag<T>(key: string): Promise<{ data: T; etag: string } | null> {
    // Implementation using GetObjectCommand with ETag
  }

  async putWithETag<T>(
    key: string,
    data: T,
    etag: string | null,
    options?: PutOptions
  ): Promise<string> {
    // Implementation using PutObjectCommand with IfMatch
  }
}
```

### Bucket-Specific Implementations

Each bucket gets its own class that extends the base:

#### Example: Starred Collections Storage

```typescript
export class StarredCollectionsStorage extends S3ETagStorageBase {
  constructor(s3Client: S3Client, config?: Partial<S3StorageConfig>) {
    super(s3Client, {
      bucketName: config?.bucketName || process.env.FEED_COLLECTIONS_S3_BUCKET || 'feed-collections',
      region: config?.region || process.env.FEED_COLLECTIONS_AWS_REGION || 'us-east-1',
      prefix: 'starred-collections',
      defaultCacheControl: 'max-age=60',
      ...config,
    });
  }

  protected getBucketName(): string {
    return this.config.bucketName;
  }

  protected buildKey(key: string): string {
    // Key building logic specific to starred collections
    return `${this.config.prefix}/${key}`;
  }

  // High-level domain methods
  async getCollections(userId: string): Promise<CollectionsData | null> {
    return this.get<CollectionsData>(`${userId}/collections.json`);
  }

  async updateCollections(
    userId: string,
    modifier: (data: CollectionsData) => CollectionsData
  ): Promise<CollectionsData> {
    // Implementation with retry logic for ETag conflicts
  }
}
```

### Dependency Injection Pattern

#### Before (Current):
```typescript
// src/lib/starred-collections/s3-storage.ts
const s3Client = new S3Client({ region: BUCKET_REGION });

export async function getCollections(userId: string): Promise<CollectionsData | null> {
  // Uses module-level s3Client
}
```

```typescript
// src/app/api/starred-collections/route.ts
import { getCollections } from '@/lib/starred-collections/s3-storage';

export async function GET() {
  const data = await getCollections(userId);
}
```

#### After (Proposed):
```typescript
// src/lib/s3/storage-factory.ts
export class StorageFactory {
  private static starredCollectionsStorage?: StarredCollectionsStorage;

  static getStarredCollectionsStorage(): StarredCollectionsStorage {
    if (!this.starredCollectionsStorage) {
      const s3Client = new S3Client({
        region: process.env.FEED_COLLECTIONS_AWS_REGION || 'us-east-1',
      });
      this.starredCollectionsStorage = new StarredCollectionsStorage(s3Client);
    }
    return this.starredCollectionsStorage;
  }

  // For testing: inject custom storage
  static setStarredCollectionsStorage(storage: StarredCollectionsStorage) {
    this.starredCollectionsStorage = storage;
  }
}
```

```typescript
// src/app/api/starred-collections/route.ts
import { StorageFactory } from '@/lib/s3/storage-factory';

export async function GET() {
  const storage = StorageFactory.getStarredCollectionsStorage();
  const data = await storage.getCollections(userId);
}
```

### Testing Benefits

With DI, we can now easily test:

```typescript
// Mock storage for testing
class MockStarredCollectionsStorage extends StarredCollectionsStorage {
  private mockData = new Map<string, CollectionsData>();

  async getCollections(userId: string): Promise<CollectionsData | null> {
    return this.mockData.get(userId) || null;
  }

  async updateCollections(/* ... */): Promise<CollectionsData> {
    // In-memory implementation
  }
}

// In tests
describe('GET /api/starred-collections', () => {
  beforeEach(() => {
    const mockStorage = new MockStarredCollectionsStorage();
    StorageFactory.setStarredCollectionsStorage(mockStorage);
  });

  it('should return empty collections for new users', async () => {
    // Test without hitting real S3
  });
});
```

## Migration Checklist

### Phase 1: Create Base Abstractions ✓ TODO
- [ ] Create `src/lib/s3/base/storage-interface.ts` - Core interfaces
- [ ] Create `src/lib/s3/base/s3-storage-base.ts` - Base S3 implementation
- [ ] Create `src/lib/s3/base/s3-etag-storage-base.ts` - ETag-aware base
- [ ] Create `src/lib/s3/base/storage-errors.ts` - Common error types
- [ ] Write unit tests for base classes

### Phase 2: Migrate Individual Buckets (Do One by One)

Each bucket migration follows the same pattern:
1. Create bucket-specific storage class
2. Create factory method
3. Update consuming code to use factory
4. Write tests for the storage class
5. Deprecate old module-level functions
6. Remove old code after verification

#### 2.1: Starred Collections Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/starred-collections-storage.ts`
- [ ] Implement `StarredCollectionsStorage` extending `S3ETagStorageBase`
- [ ] Add factory method to `StorageFactory`
- [ ] Update `src/app/api/starred-collections/**/*.ts` to use factory
- [ ] Write tests for `StarredCollectionsStorage`
- [ ] Mark `src/lib/starred-collections/s3-storage.ts` as deprecated
- [ ] Verify production behavior matches
- [ ] Remove old implementation

**Complexity:** Medium (ETag logic, retry mechanism)
**Risk:** Medium (user data mutation)
**Estimated Effort:** 4-6 hours

#### 2.2: Feed Collections Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/feed-collections-storage.ts`
- [ ] Implement `FeedCollectionsStorage` extending `S3StorageBase`
- [ ] Support multiple data types (collections, user profiles, commit feed state)
- [ ] Add factory method to `StorageFactory`
- [ ] Update `src/app/api/feed-collections/**/*.ts` to use factory
- [ ] Write tests for `FeedCollectionsStorage`
- [ ] Mark `src/lib/feed-collections/s3-storage.ts` as deprecated
- [ ] Remove old implementation

**Complexity:** Medium (multiple data types, LIST operations)
**Risk:** Medium (user data)
**Estimated Effort:** 4-6 hours

#### 2.3: Line Counts Cache Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/line-counts-storage.ts`
- [ ] Implement `LineCountsStorage` extending `S3StorageBase`
- [ ] Add factory method to `StorageFactory`
- [ ] Update consuming code
- [ ] Write tests
- [ ] Mark `src/lib/line-counts/s3-cache.ts` as deprecated
- [ ] Remove old implementation

**Complexity:** Low (simple cache)
**Risk:** Low (read-heavy cache, non-critical)
**Estimated Effort:** 2-3 hours

#### 2.4: GitHub Tree Cache Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/github-tree-storage.ts`
- [ ] Implement `GitHubTreeStorage` extending `S3StorageBase`
- [ ] Add factory method to `StorageFactory`
- [ ] Update consuming code
- [ ] Write tests
- [ ] Mark `src/lib/github-tree-s3-cache.ts` as deprecated
- [ ] Remove old implementation

**Complexity:** Low (simple cache)
**Risk:** Low (immutable cache)
**Estimated Effort:** 2-3 hours

#### 2.5: File City Cache Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/file-city-storage.ts`
- [ ] Implement `FileCityStorage` extending `S3StorageBase`
- [ ] Handle binary PNG data (not JSON)
- [ ] Add factory method to `StorageFactory`
- [ ] Update consuming code
- [ ] Write tests
- [ ] Mark `src/lib/file-city/s3-cache.ts` as deprecated
- [ ] Remove old implementation

**Complexity:** Low (simple binary cache)
**Risk:** Low (generated images, can be regenerated)
**Estimated Effort:** 2-3 hours

#### 2.6: TTS Audio Cache Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/tts-audio-storage.ts`
- [ ] Implement `TTSAudioStorage` extending `S3StorageBase`
- [ ] Handle binary MP3 data
- [ ] Support legacy key fallback logic
- [ ] Add factory method to `StorageFactory`
- [ ] Update consuming code
- [ ] Write tests
- [ ] Mark `src/lib/tts/s3-cache.ts` as deprecated
- [ ] Remove old implementation

**Complexity:** Low-Medium (binary data + legacy fallback)
**Risk:** Low (cache, can regenerate)
**Estimated Effort:** 3-4 hours

#### 2.7: Version Registry Storage ✓ TODO
- [ ] Create `src/lib/s3/buckets/version-registry-storage.ts`
- [ ] Implement `VersionRegistryStorage` extending `S3StorageBase`
- [ ] Handle complex key structure (version registrations + schematics)
- [ ] Support OpenTelemetry span instrumentation
- [ ] Add factory method to `StorageFactory`
- [ ] Update consuming code
- [ ] Write tests
- [ ] Mark `src/lib/version-registry/s3-storage.ts` as deprecated
- [ ] Remove old implementation

**Complexity:** Medium (complex keys, OTEL integration)
**Risk:** Medium (registry data)
**Estimated Effort:** 4-5 hours

### Phase 3: Finalization ✓ TODO
- [ ] Add comprehensive integration tests
- [ ] Update documentation
- [ ] Add migration guide for new buckets
- [ ] Performance benchmarking (compare old vs new)
- [ ] Remove all deprecated modules
- [ ] Update OTEL instrumentation (if needed)

## Migration Order Recommendation

Suggested order (lowest risk to highest risk):

1. **GitHub Tree Cache** (simplest, immutable, low risk)
2. **Line Counts Cache** (simple, low risk)
3. **File City Cache** (simple, binary, low risk)
4. **TTS Audio Cache** (medium complexity, legacy fallback)
5. **Feed Collections** (medium risk, user data but less critical)
6. **Starred Collections** (medium-high risk, user data + ETag logic)
7. **Version Registry** (complex keys, OTEL, but well-tested domain)

## Benefits Summary

### Before Refactoring
- ❌ Cannot unit test without S3
- ❌ Tight coupling to AWS SDK
- ❌ Module-level state
- ❌ No interface contracts
- ❌ Cannot swap backends
- ❌ Difficult to add observability

### After Refactoring
- ✅ Full unit test coverage with mocks
- ✅ Pluggable storage backends
- ✅ Clear interface contracts
- ✅ Dependency injection enabled
- ✅ Can use local filesystem for development
- ✅ Easy to add middleware (logging, metrics, caching)

## File Structure

```
src/lib/s3/
├── base/
│   ├── storage-interface.ts          # Core interfaces
│   ├── s3-storage-base.ts             # Base S3 implementation
│   ├── s3-etag-storage-base.ts        # ETag-aware base
│   └── storage-errors.ts              # Common error types
├── buckets/
│   ├── starred-collections-storage.ts
│   ├── feed-collections-storage.ts
│   ├── line-counts-storage.ts
│   ├── github-tree-storage.ts
│   ├── file-city-storage.ts
│   ├── tts-audio-storage.ts
│   └── version-registry-storage.ts
├── storage-factory.ts                 # Central factory
└── index.ts                           # Public exports
```

## Open Questions

1. **Should we support multiple S3 clients?** - Some buckets might be in different regions
2. **How to handle OTEL instrumentation?** - Middleware pattern vs built into base class?
3. **Should we extract key-building to separate strategy classes?** - Keys are complex in some buckets
4. **Local filesystem backend for development?** - Would be useful but adds complexity
5. **Should we add connection pooling/reuse?** - AWS SDK already handles this, but worth verifying

## Next Steps

1. Review this design document with team
2. Get approval on architecture
3. Start with Phase 1 (base abstractions)
4. Migrate buckets one by one in recommended order
5. Monitor production metrics during rollout
6. Document learnings and update guide

---

**Document Owner:** Engineering Team
**Last Updated:** 2026-04-20
**Review Status:** Pending Review
