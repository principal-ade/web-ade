# S3 Storage Abstraction - Implementation Task List

This is a condensed checklist for implementing the S3 storage abstraction refactoring. See `s3-storage-abstraction-design.md` for full design details.

## Overview

**Total Buckets to Migrate:** 7
**Estimated Total Effort:** 25-35 hours
**Recommended Approach:** One bucket at a time, test thoroughly before moving to next

---

## Phase 1: Foundation (6-8 hours)

### Base Infrastructure
- [ ] Create `src/lib/s3/base/storage-interface.ts`
  - `IStorageBackend` interface
  - `IETagStorage` interface
  - `PutOptions`, `GetOptions` types

- [ ] Create `src/lib/s3/base/storage-errors.ts`
  - `StorageError` base class
  - `StorageNotFoundError`
  - `StorageConflictError` (for ETag conflicts)
  - `StorageValidationError`

- [ ] Create `src/lib/s3/base/s3-storage-base.ts`
  - Abstract `S3StorageBase` class
  - Implement `get()`, `put()`, `exists()`, `delete()`, `list()`
  - Protected abstract methods for bucket config

- [ ] Create `src/lib/s3/base/s3-etag-storage-base.ts`
  - Extend `S3StorageBase`
  - Implement `getWithETag()`, `putWithETag()`
  - Optimistic locking logic

- [ ] Create `src/lib/s3/storage-factory.ts`
  - Singleton factory pattern
  - Methods for each bucket type
  - Testing helpers (`setXXXStorage()`)

- [ ] Create `src/lib/s3/index.ts`
  - Public exports for library

- [ ] Write unit tests for base classes
  - Mock S3Client
  - Test error handling
  - Test ETag logic

---

## Phase 2: Bucket Migrations

Do these **ONE AT A TIME** in this order:

### ✅ 1. GitHub Tree Cache (2-3 hours) - EASIEST, START HERE

**File:** `src/lib/s3/buckets/github-tree-storage.ts`

**Why First:** Simplest, immutable data, read-heavy cache, lowest risk

**Current:** `src/lib/github-tree-s3-cache.ts` (140 lines)

**Tasks:**
- [ ] Create `GitHubTreeStorage` class extending `S3StorageBase`
- [ ] Configure bucket: `repo-tour-audio`, prefix: `github-trees`
- [ ] Implement domain methods:
  - `getTree(owner, repo, sha)`
  - `storeTree(owner, repo, sha, data)`
  - `generateKey(owner, repo, sha)`
- [ ] Add to `StorageFactory`
- [ ] Update consumers (search for imports of `github-tree-s3-cache`)
- [ ] Write tests
- [ ] Deploy and verify
- [ ] Remove old file

---

### ✅ 2. Line Counts Cache (2-3 hours)

**File:** `src/lib/s3/buckets/line-counts-storage.ts`

**Why Second:** Simple cache, non-critical, low risk

**Current:** `src/lib/line-counts/s3-cache.ts` (181 lines)

**Tasks:**
- [ ] Create `LineCountsStorage` class extending `S3StorageBase`
- [ ] Configure bucket: `repo-tour-audio`, prefix: `line-counts`
- [ ] Implement domain methods:
  - `getLineCounts(owner, repo)`
  - `storeLineCounts(data)`
  - `checkCache(owner, repo)`
  - `generateKey(owner, repo)`
- [ ] Add to `StorageFactory`
- [ ] Update consumers
- [ ] Write tests
- [ ] Deploy and verify
- [ ] Remove old file

---

### ✅ 3. File City Cache (2-3 hours)

**File:** `src/lib/s3/buckets/file-city-storage.ts`

**Why Third:** Simple, but handles binary data (PNG)

**Current:** `src/lib/file-city/s3-cache.ts` (110 lines)

**Tasks:**
- [ ] Create `FileCityStorage` class extending `S3StorageBase`
- [ ] Configure bucket: `repo-tour-audio`, prefix: `file-city`
- [ ] Override `put()` to handle Buffer instead of JSON
- [ ] Implement domain methods:
  - `checkCache(owner, repo, width, height)`
  - `uploadImage(owner, repo, width, height, buffer)`
  - `getUrl(owner, repo, width, height)`
  - `generateKey(owner, repo, width, height)`
- [ ] Add to `StorageFactory`
- [ ] Update consumers
- [ ] Write tests (mock Buffer data)
- [ ] Deploy and verify
- [ ] Remove old file

**Note:** This is first binary data handling - test thoroughly!

---

### ✅ 4. TTS Audio Cache (3-4 hours)

**File:** `src/lib/s3/buckets/tts-audio-storage.ts`

**Why Fourth:** Binary data + has legacy key fallback logic

**Current:** `src/lib/tts/s3-cache.ts` (179 lines)

**Tasks:**
- [ ] Create `TTSAudioStorage` class extending `S3StorageBase`
- [ ] Configure bucket: `repo-tour-audio`, prefix: (none - root level)
- [ ] Override `put()` to handle Buffer (MP3 audio)
- [ ] Implement domain methods:
  - `checkCache(key)` and `checkCacheWithFallback(contentKey, legacyKey)`
  - `uploadAudio(key, buffer, metadata)`
  - `getMetadata(key)`
  - `getUrl(key)`
- [ ] Handle CDN_DOMAIN in URL generation
- [ ] Add to `StorageFactory`
- [ ] Update consumers
- [ ] Write tests (test fallback logic!)
- [ ] Deploy and verify
- [ ] Remove old file

**Note:** Legacy fallback is critical - test both paths!

---

### ✅ 5. Feed Collections (4-6 hours)

**File:** `src/lib/s3/buckets/feed-collections-storage.ts`

**Why Fifth:** More complex - handles 3 data types, has LIST operations

**Current:** `src/lib/feed-collections/s3-storage.ts` (545 lines)

**Tasks:**
- [ ] Create `FeedCollectionsStorage` class extending `S3StorageBase`
- [ ] Configure bucket: `feed-collections`, prefix: `collections` (for collections)
- [ ] Implement collection methods:
  - `getCollection(id)`
  - `storeCollection(collection)`
  - `deleteCollection(id)`
  - `listUserCollections(ownerGithubId)`
  - `getCollections(ids[])` (batch)
- [ ] Implement user profile methods:
  - `getUserProfile(githubId)`
  - `storeUserProfile(profile)`
- [ ] Implement commit feed state methods:
  - `getCommitFeedState(githubId)`
  - `storeCommitFeedState(state)`
  - `getOrCreateCommitFeedState(githubId)`
- [ ] Add to `StorageFactory`
- [ ] Update all API routes in `src/app/api/feed-collections/**/*`
- [ ] Write comprehensive tests (3 data types!)
- [ ] Deploy and verify
- [ ] Remove old file

**Note:** This is complex - multiple data types sharing one storage class

---

### ✅ 6. Starred Collections (4-6 hours) - HIGHEST COMPLEXITY

**File:** `src/lib/s3/buckets/starred-collections-storage.ts`

**Why Sixth:** Critical user data + ETag optimistic locking + retry logic

**Current:** `src/lib/starred-collections/s3-storage.ts` (458 lines)

**Tasks:**
- [ ] Create `StarredCollectionsStorage` class extending `S3ETagStorageBase`
- [ ] Configure bucket: `feed-collections`, prefix: `starred-collections`
- [ ] Implement ETag-aware methods:
  - `getCollections(userId)` - without ETag
  - `getCollectionsWithETag(userId)` - with ETag
  - `updateCollections(userId, modifier)` - with retry on conflict
  - `checkCollectionsExist(userId)`
- [ ] Implement metadata cache methods:
  - `getMetadataCache(userId)`
  - `updateMetadataCache(userId, modifier)`
- [ ] Implement cleanup:
  - `deleteUserData(userId)`
- [ ] Handle `MAX_ETAG_RETRIES` with exponential backoff
- [ ] Add to `StorageFactory`
- [ ] Update all API routes in `src/app/api/starred-collections/**/*`
- [ ] Write extensive tests (ETag conflicts, retries!)
- [ ] Deploy to staging first
- [ ] Monitor production carefully
- [ ] Remove old file after 100% confidence

**Note:** THIS IS THE MOST CRITICAL - test exhaustively, deploy carefully!

---

### ✅ 7. Version Registry (4-5 hours)

**File:** `src/lib/s3/buckets/version-registry-storage.ts`

**Why Last:** Complex key structure + OpenTelemetry integration

**Current:** `src/lib/version-registry/s3-storage.ts` (554 lines)

**Tasks:**
- [ ] Create `VersionRegistryStorage` class extending `S3StorageBase`
- [ ] Configure bucket: `principal-view-data`, prefix: `version-registry`
- [ ] Implement version registration methods:
  - `checkVersionExists(key)`
  - `storeVersionRegistration(registration, span?)`
  - `getVersionRegistration(key, span?)`
  - `deleteVersionRegistration(key)`
  - `listRepoRegistrations(customerId, span?)`
- [ ] Implement schematic methods:
  - `storeSchematic(repositoryUrl, commitSha, schematic, span?)`
  - `getSchematic(repositoryUrl, commitSha)`
  - `checkSchematicExists(repositoryUrl, commitSha)`
- [ ] Preserve OpenTelemetry span instrumentation
- [ ] Handle complex key building (multi-level paths)
- [ ] Add to `StorageFactory`
- [ ] Update all consumers
- [ ] Write tests (mock OTEL spans)
- [ ] Deploy and verify
- [ ] Remove old file

**Note:** OTEL integration is important - preserve all span events!

---

## Phase 3: Cleanup & Documentation (3-4 hours)

- [ ] Remove all deprecated `*-s3-storage.ts` and `*-s3-cache.ts` files
- [ ] Update all imports across codebase
- [ ] Add JSDoc to all public methods
- [ ] Create developer guide: "Adding a New S3 Bucket"
- [ ] Create testing guide: "Mocking S3 Storage in Tests"
- [ ] Update architecture documentation
- [ ] Add observability (if not already in base class)
- [ ] Performance comparison (old vs new)
- [ ] Final integration tests

---

## Testing Checklist (Per Bucket)

For each migration, verify:

- [ ] Unit tests pass with mocked S3
- [ ] Integration tests pass with real S3
- [ ] Error handling works (not found, network errors)
- [ ] Retry logic works (for ETag storage)
- [ ] Binary data handled correctly (for File City, TTS)
- [ ] Legacy compatibility (for TTS fallback)
- [ ] OTEL events emitted (for Version Registry)
- [ ] No memory leaks (S3Client pooling)
- [ ] Performance matches old implementation
- [ ] All existing API routes still work

---

## Rollback Plan

For each migration, before removing old code:

1. Keep old implementation alongside new for 1-2 weeks
2. Add feature flag to switch between old/new
3. Compare behavior in staging
4. Monitor metrics in production
5. Only remove old code after 100% confidence

**Feature Flag Example:**
```typescript
const USE_NEW_STORAGE = process.env.FEATURE_FLAG_NEW_S3_STORAGE === 'true';

if (USE_NEW_STORAGE) {
  const storage = StorageFactory.getStarredCollectionsStorage();
  await storage.getCollections(userId);
} else {
  await legacyGetCollections(userId);
}
```

---

## Success Criteria

Migration is complete when:

✅ All 7 buckets migrated
✅ All old files removed
✅ Test coverage ≥ 80% for storage layer
✅ Zero production incidents related to storage
✅ Performance equal or better than before
✅ Documentation updated
✅ Team trained on new patterns

---

## Estimated Timeline

- **Phase 1 (Foundation):** 1-1.5 weeks
- **Phase 2 (Migrations):** 2-3 weeks (doing 2-3 buckets per week)
- **Phase 3 (Cleanup):** 2-3 days

**Total: 4-5 weeks** if done by one person full-time

**Total: 8-10 weeks** if done alongside other work (20-30% time allocation)

---

## Quick Reference: Current Files to Migrate

```
src/lib/starred-collections/s3-storage.ts     → starred-collections-storage.ts (ETag)
src/lib/feed-collections/s3-storage.ts        → feed-collections-storage.ts
src/lib/line-counts/s3-cache.ts               → line-counts-storage.ts
src/lib/github-tree-s3-cache.ts               → github-tree-storage.ts
src/lib/file-city/s3-cache.ts                 → file-city-storage.ts (Binary)
src/lib/tts/s3-cache.ts                       → tts-audio-storage.ts (Binary + Fallback)
src/lib/version-registry/s3-storage.ts        → version-registry-storage.ts (OTEL)
```

---

**Last Updated:** 2026-04-20
**Status:** Ready to Start
