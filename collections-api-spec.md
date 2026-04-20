# Collections API Specification

## Overview

This document specifies the API routes for a starred repo collections feature, allowing users to organize GitHub repositories and users into custom collections.

**Storage Architecture**: Collections are stored in S3 as per-user JSON files rather than in a relational database. This approach is optimal for this use case because:
- Data is user-scoped with no cross-user queries needed
- Document-oriented structure matches API responses naturally
- Eliminates database infrastructure and associated costs
- Simple and cost-effective

## Data Models

### Collection

```typescript
interface Collection {
  id: string;                  // Timestamp-based ID (e.g., "1234567890123")
  name: string;               // User-defined name (required)
  description?: string;       // Optional description
  icon?: string;              // Lucide icon name (optional)
  repos: CollectionRepo[];    // Array of repos in collection
  users: CollectionUser[];    // Array of users in collection
  createdAt: string;         // ISO 8601 timestamp
  updatedAt: string;         // ISO 8601 timestamp
}
```

### CollectionRepo

```typescript
interface CollectionRepo {
  owner: string;              // GitHub repo owner (required)
  repo: string;               // GitHub repo name (required)
  addedAt: string;           // ISO 8601 timestamp when added
  description?: string;      // Cached from GitHub API
  stargazersCount?: number;  // Cached from GitHub API
  avatarUrl?: string;        // Cached owner avatar from GitHub
}
```

### CollectionUser

```typescript
interface CollectionUser {
  login: string;             // GitHub username (required)
  addedAt: string;          // ISO 8601 timestamp when added
  avatarUrl?: string;       // Cached from GitHub API
  name?: string;            // Cached from GitHub API
}
```

## Available Icons

Supported Lucide icon names for collections:
- `Star` (default)
- `BookMarked`
- `Flame`
- `Briefcase`
- `Target`
- `Rocket`
- `Lightbulb`
- `Palette`
- `Package`
- `Sparkles`
- `Heart`
- `Code`
- `Users`
- `Folder`

## API Endpoints

### 1. List Collections

```
GET /api/collections
```

**Description**: Retrieve all collections for the authenticated user.

**Query Parameters**:
- `include_items` (boolean, optional): Include repos and users arrays in response. Default: `true`

**Response**: 200 OK
```json
{
  "collections": [
    {
      "id": "1234567890123",
      "name": "Work Projects",
      "description": "Repositories related to work",
      "icon": "Briefcase",
      "repos": [...],
      "users": [...],
      "createdAt": "2026-04-19T10:30:00Z",
      "updatedAt": "2026-04-19T15:45:00Z"
    }
  ],
  "version": 42  // Monotonically increasing version for cache invalidation
}
```

**Notes**:
- The `version` field should increment on any collection mutation to help clients invalidate caches
- Empty arrays should be returned if user has no collections

---

### 2. Get Single Collection

```
GET /api/collections/:collectionId
```

**Description**: Retrieve a specific collection by ID.

**Response**: 200 OK
```json
{
  "id": "1234567890123",
  "name": "Work Projects",
  "description": "Repositories related to work",
  "icon": "Briefcase",
  "repos": [...],
  "users": [...],
  "createdAt": "2026-04-19T10:30:00Z",
  "updatedAt": "2026-04-19T15:45:00Z"
}
```

**Error Responses**:
- `404 Not Found`: Collection doesn't exist or doesn't belong to user

---

### 3. Create Collection

```
POST /api/collections
```

**Description**: Create a new collection.

**Request Body**:
```json
{
  "name": "My Collection",        // Required
  "description": "Description",   // Optional
  "icon": "Star"                  // Optional, defaults to "Star"
}
```

**Response**: 201 Created
```json
{
  "id": "1234567890124",
  "name": "My Collection",
  "description": "Description",
  "icon": "Star",
  "repos": [],
  "users": [],
  "createdAt": "2026-04-19T16:00:00Z",
  "updatedAt": "2026-04-19T16:00:00Z"
}
```

**Validation Rules**:
- `name`: Required, min length 1, max length 100
- `icon`: Must be one of the supported icon names (if provided)

**Error Responses**:
- `400 Bad Request`: Invalid input data
- `409 Conflict`: Collection with same name already exists for user (optional enforcement)

---

### 4. Update Collection

```
PATCH /api/collections/:collectionId
```

**Description**: Update collection metadata (name, description, icon).

**Request Body**:
```json
{
  "name": "Updated Name",         // Optional
  "description": "New desc",      // Optional
  "icon": "Rocket"                // Optional
}
```

**Response**: 200 OK
```json
{
  "id": "1234567890123",
  "name": "Updated Name",
  "description": "New desc",
  "icon": "Rocket",
  "repos": [...],
  "users": [...],
  "createdAt": "2026-04-19T10:30:00Z",
  "updatedAt": "2026-04-19T16:05:00Z"
}
```

**Error Responses**:
- `404 Not Found`: Collection doesn't exist
- `400 Bad Request`: Invalid input data

---

### 5. Delete Collection

```
DELETE /api/collections/:collectionId
```

**Description**: Delete a collection and all its associations.

**Response**: 204 No Content

**Error Responses**:
- `404 Not Found`: Collection doesn't exist

---

### 6. Add Repo to Collection

```
POST /api/collections/:collectionId/repos
```

**Description**: Add a repository to a collection. The API should fetch and cache GitHub metadata.

**Request Body**:
```json
{
  "owner": "facebook",
  "repo": "react"
}
```

**Response**: 200 OK
```json
{
  "owner": "facebook",
  "repo": "react",
  "addedAt": "2026-04-19T16:10:00Z",
  "description": "The library for web and native user interfaces.",
  "stargazersCount": 234567,
  "avatarUrl": "https://avatars.githubusercontent.com/u/69631?v=4"
}
```

**Server-Side Logic**:
1. Check if repo already exists in collection (return 409 if duplicate)
2. Fetch repo metadata from GitHub API (`GET /repos/:owner/:repo`)
3. Cache: `description`, `stargazers_count`, and owner `avatar_url`
4. Add repo to collection with current timestamp

**Error Responses**:
- `404 Not Found`: Collection doesn't exist
- `409 Conflict`: Repo already in collection
- `400 Bad Request`: Invalid owner/repo format
- `502 Bad Gateway`: GitHub API unavailable or repo doesn't exist

**Notes**:
- GitHub API call should be made server-side to keep data fresh
- Consider rate limiting if GitHub API quota is a concern

---

### 7. Remove Repo from Collection

```
DELETE /api/collections/:collectionId/repos/:owner/:repo
```

**Description**: Remove a repository from a collection.

**Example**: `DELETE /api/collections/1234567890123/repos/facebook/react`

**Response**: 204 No Content

**Error Responses**:
- `404 Not Found`: Collection or repo not found in collection

---

### 8. Add User to Collection

```
POST /api/collections/:collectionId/users
```

**Description**: Add a GitHub user to a collection. The API should fetch and cache GitHub user metadata.

**Request Body**:
```json
{
  "login": "torvalds"
}
```

**Response**: 200 OK
```json
{
  "login": "torvalds",
  "addedAt": "2026-04-19T16:15:00Z",
  "avatarUrl": "https://avatars.githubusercontent.com/u/1024025?v=4",
  "name": "Linus Torvalds"
}
```

**Server-Side Logic**:
1. Check if user already exists in collection (return 409 if duplicate)
2. Fetch user metadata from GitHub API (`GET /users/:login`)
3. Cache: `avatar_url` and `name`
4. Add user to collection with current timestamp

**Error Responses**:
- `404 Not Found`: Collection doesn't exist
- `409 Conflict`: User already in collection
- `400 Bad Request`: Invalid username format
- `502 Bad Gateway`: GitHub API unavailable or user doesn't exist

---

### 9. Remove User from Collection

```
DELETE /api/collections/:collectionId/users/:login
```

**Description**: Remove a GitHub user from a collection.

**Example**: `DELETE /api/collections/1234567890123/users/torvalds`

**Response**: 204 No Content

**Error Responses**:
- `404 Not Found`: Collection or user not found in collection

---

## Authentication

All endpoints require authentication via:
- Bearer token in `Authorization` header
- Session cookie (if applicable)

All operations are scoped to the authenticated user. Users cannot access or modify other users' collections.

## Storage Architecture (S3-Based)

### Overview

Collections data is stored in S3 using a per-user JSON file approach. This provides:
- Simple, scalable storage without database overhead
- Natural document-oriented format matching the API responses
- Built-in versioning and durability
- Cost-effective for read-heavy, user-scoped workloads

### S3 Key Structure

```
s3://{bucket-name}/collections/{user_id}/collections.json
s3://{bucket-name}/collections/{user_id}/metadata-cache.json
```

**Primary Collections File** (`collections.json`):
```json
{
  "version": 42,
  "updatedAt": "2026-04-19T16:00:00Z",
  "collections": [
    {
      "id": "1234567890123",
      "name": "Work Projects",
      "description": "Repositories related to work",
      "icon": "Briefcase",
      "repos": [
        {
          "owner": "facebook",
          "repo": "react",
          "addedAt": "2026-04-19T10:30:00Z",
          "description": "The library for web and native user interfaces.",
          "stargazersCount": 234567,
          "avatarUrl": "https://avatars.githubusercontent.com/u/69631?v=4"
        }
      ],
      "users": [
        {
          "login": "torvalds",
          "addedAt": "2026-04-19T11:00:00Z",
          "avatarUrl": "https://avatars.githubusercontent.com/u/1024025?v=4",
          "name": "Linus Torvalds"
        }
      ],
      "createdAt": "2026-04-19T10:30:00Z",
      "updatedAt": "2026-04-19T15:45:00Z"
    }
  ]
}
```

**GitHub Metadata Cache** (`metadata-cache.json`):
```json
{
  "repos": {
    "facebook/react": {
      "description": "The library for web and native user interfaces.",
      "stargazersCount": 234567,
      "avatarUrl": "https://avatars.githubusercontent.com/u/69631?v=4",
      "cachedAt": "2026-04-19T16:00:00Z"
    }
  },
  "users": {
    "torvalds": {
      "avatarUrl": "https://avatars.githubusercontent.com/u/1024025?v=4",
      "name": "Linus Torvalds",
      "cachedAt": "2026-04-19T16:00:00Z"
    }
  }
}
```

### Concurrency Control

Use **S3 ETags** for optimistic locking to prevent concurrent modification conflicts:

1. **Read Operation**:
   ```
   GET s3://bucket/collections/{user_id}/collections.json
   → Returns data + ETag (e.g., "abc123")
   ```

2. **Write Operation**:
   ```
   PUT s3://bucket/collections/{user_id}/collections.json
   If-Match: "abc123"  // Only succeed if ETag still matches
   → Success: Returns new ETag "def456"
   → Conflict: 412 Precondition Failed (retry with fresh data)
   ```

3. **API Implementation**:
   - Cache the ETag in memory or include in API response
   - On mutation, read file → modify → write with If-Match
   - Retry up to 3 times on 412 conflicts
   - Return 409 to client if all retries fail

### Size Limits

- **Max file size**: 5MB per user (sufficient for ~5,000 repos/collections)
- **Practical limit**: Recommend UI warning at 500 items per collection
- For users exceeding limits, consider sharding into multiple files

### S3 Configuration

```yaml
Bucket: {bucket-name}
Region: us-east-1  # Match API server region
Versioning: Enabled  # For data recovery
Encryption: AES-256
Lifecycle Rules:
  - DeleteMarkers: Remove after 90 days
  - NonCurrentVersions: Expire after 30 days
```

### Error Handling

- **File not found** (404): Initialize empty collections structure
- **Access denied** (403): Log error, return 500 to client
- **Precondition failed** (412): Retry with fresh data (3 attempts)
- **Service unavailable** (503): Exponential backoff, fallback to cached data if available

---

## Implementation Notes

### API Server Flow (Example: Add Repo to Collection)

```typescript
// GET /api/collections/:collectionId/repos
async function addRepoToCollection(userId: string, collectionId: string, owner: string, repo: string) {
  // 1. Read current collections file from S3
  const s3Key = `collections/${userId}/collections.json`;
  const { data, etag } = await s3.getObject(bucket, s3Key);

  // 2. Parse and find collection
  const collectionsData = JSON.parse(data);
  const collection = collectionsData.collections.find(c => c.id === collectionId);
  if (!collection) throw new NotFoundError();

  // 3. Check for duplicates
  const exists = collection.repos.some(r => r.owner === owner && r.repo === repo);
  if (exists) throw new ConflictError('Repo already in collection');

  // 4. Fetch GitHub metadata (with caching)
  const metadata = await getGitHubRepoMetadata(owner, repo, userId);

  // 5. Add repo to collection
  collection.repos.push({
    owner,
    repo,
    addedAt: new Date().toISOString(),
    ...metadata
  });
  collection.updatedAt = new Date().toISOString();
  collectionsData.version++;
  collectionsData.updatedAt = new Date().toISOString();

  // 6. Write back to S3 with optimistic locking
  await s3.putObject(bucket, s3Key, JSON.stringify(collectionsData), {
    ifMatch: etag  // Will fail if file was modified by another request
  });

  return collection.repos[collection.repos.length - 1];
}
```

### GitHub Metadata Caching Helper

```typescript
async function getGitHubRepoMetadata(owner: string, repo: string, userId: string) {
  const cacheKey = `collections/${userId}/metadata-cache.json`;
  const repoKey = `${owner}/${repo}`;

  // Try to get from cache
  try {
    const { data } = await s3.getObject(bucket, cacheKey);
    const cache = JSON.parse(data);
    const cached = cache.repos[repoKey];

    // Check if cache is fresh (< 1 hour old)
    if (cached && Date.now() - new Date(cached.cachedAt).getTime() < 3600000) {
      return {
        description: cached.description,
        stargazersCount: cached.stargazersCount,
        avatarUrl: cached.avatarUrl
      };
    }
  } catch (err) {
    // Cache file doesn't exist, continue to fetch
  }

  // Fetch from GitHub
  const repoData = await octokit.repos.get({ owner, repo });
  const metadata = {
    description: repoData.data.description,
    stargazersCount: repoData.data.stargazers_count,
    avatarUrl: repoData.data.owner.avatar_url,
    cachedAt: new Date().toISOString()
  };

  // Update cache asynchronously (don't block response)
  updateMetadataCache(userId, repoKey, metadata).catch(err =>
    console.error('Failed to update metadata cache:', err)
  );

  return metadata;
}
```

### Initial User Setup

When a user makes their first request:
```typescript
async function ensureUserCollectionsExist(userId: string) {
  const s3Key = `collections/${userId}/collections.json`;

  try {
    await s3.headObject(bucket, s3Key);
  } catch (err) {
    if (err.code === 'NotFound') {
      // Initialize empty collections file
      await s3.putObject(bucket, s3Key, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        collections: []
      }));
    }
  }
}
```

### Reordering Implementation

Manual reordering leverages the array order in the JSON file as the source of truth:

```typescript
async function reorderReposInCollection(
  userId: string,
  collectionId: string,
  newOrder: Array<{ owner: string; repo: string }>
) {
  // 1. Read current collections file from S3
  const s3Key = `collections/${userId}/collections.json`;
  const { data, etag } = await s3.getObject(bucket, s3Key);
  const collectionsData = JSON.parse(data);

  // 2. Find collection
  const collection = collectionsData.collections.find(c => c.id === collectionId);
  if (!collection) throw new NotFoundError();

  // 3. Validate the new order
  if (newOrder.length !== collection.repos.length) {
    throw new BadRequestError('Must include all repos');
  }

  // 4. Build a map of existing repos
  const repoMap = new Map(
    collection.repos.map(r => [`${r.owner}/${r.repo}`, r])
  );

  // 5. Validate all repos exist and create new ordered array
  const reorderedRepos = newOrder.map(({ owner, repo }) => {
    const key = `${owner}/${repo}`;
    const existingRepo = repoMap.get(key);
    if (!existingRepo) {
      throw new BadRequestError(`Repo ${key} not found in collection`);
    }
    repoMap.delete(key); // Mark as processed
    return existingRepo;
  });

  // 6. Check for missing repos
  if (repoMap.size > 0) {
    throw new BadRequestError('Missing repos in reorder request');
  }

  // 7. Update collection
  collection.repos = reorderedRepos;
  collection.updatedAt = new Date().toISOString();
  collectionsData.version++;
  collectionsData.updatedAt = new Date().toISOString();

  // 8. Write back to S3 with optimistic locking
  await s3.putObject(bucket, s3Key, JSON.stringify(collectionsData), {
    ifMatch: etag
  });

  return reorderedRepos;
}
```

**Key Points**:
- Array order in JSON = display order (no separate `order` field needed)
- Validation ensures all items are present (no additions/removals during reorder)
- Preserves all metadata (addedAt, description, etc.)
- Uses same optimistic locking pattern as other mutations

---

## Rate Limiting Recommendations

- **Per-user limits**: 100 requests/minute per user
- **GitHub API caching**: Cache repo/user metadata for 1 hour in S3 metadata-cache.json
- **Concurrent modifications**: Retry limit of 3 attempts to prevent excessive S3 writes

---

### 10. Reorder Repos in Collection

```
PATCH /api/collections/:collectionId/repos/reorder
```

**Description**: Reorder repositories within a collection. The array order in the stored JSON represents the display order.

**Request Body**:
```json
{
  "repos": [
    { "owner": "facebook", "repo": "react" },
    { "owner": "microsoft", "repo": "vscode" },
    { "owner": "vercel", "repo": "next.js" }
  ]
}
```

**Response**: 200 OK
```json
{
  "repos": [
    {
      "owner": "facebook",
      "repo": "react",
      "addedAt": "2026-04-19T10:30:00Z",
      "description": "The library for web and native user interfaces.",
      "stargazersCount": 234567,
      "avatarUrl": "https://avatars.githubusercontent.com/u/69631?v=4"
    },
    // ... other repos in new order
  ]
}
```

**Validation Rules**:
- All repos in the request must exist in the collection
- No duplicate repos allowed
- Array length must match current collection repos count

**Error Responses**:
- `404 Not Found`: Collection doesn't exist
- `400 Bad Request`: Invalid repo list (missing repos, duplicates, or wrong count)

---

### 11. Reorder Users in Collection

```
PATCH /api/collections/:collectionId/users/reorder
```

**Description**: Reorder users within a collection. The array order in the stored JSON represents the display order.

**Request Body**:
```json
{
  "users": [
    { "login": "torvalds" },
    { "login": "gaearon" },
    { "login": "tj" }
  ]
}
```

**Response**: 200 OK
```json
{
  "users": [
    {
      "login": "torvalds",
      "addedAt": "2026-04-19T11:00:00Z",
      "avatarUrl": "https://avatars.githubusercontent.com/u/1024025?v=4",
      "name": "Linus Torvalds"
    },
    // ... other users in new order
  ]
}
```

**Validation Rules**:
- All users in the request must exist in the collection
- No duplicate users allowed
- Array length must match current collection users count

**Error Responses**:
- `404 Not Found`: Collection doesn't exist
- `400 Bad Request`: Invalid user list (missing users, duplicates, or wrong count)

---

### 12. Reorder Collections

```
PATCH /api/collections/reorder
```

**Description**: Reorder collections for the authenticated user. The array order in the stored JSON represents the display order.

**Request Body**:
```json
{
  "collectionIds": ["1234567890124", "1234567890123", "1234567890125"]
}
```

**Response**: 200 OK
```json
{
  "collections": [
    {
      "id": "1234567890124",
      "name": "Personal Projects",
      // ... full collection data
    },
    // ... other collections in new order
  ],
  "version": 43
}
```

**Validation Rules**:
- All collection IDs must belong to the authenticated user
- No duplicate IDs allowed
- Array length must match current collections count

**Error Responses**:
- `400 Bad Request`: Invalid collection list (missing collections, duplicates, or wrong count)

---

## Future Enhancements

1. **Sharing**: Allow users to share collections publicly or with specific users
   - Would require separate S3 path: `s3://bucket/shared-collections/{share_id}.json`
2. **Import/Export**: Export collections as JSON for backup
   - Already trivial with S3 - just provide presigned URL to collections.json
3. **Smart Collections**: Auto-populate based on topics, languages, or stars
4. **Collaborative Collections**: Multiple users can contribute to shared collections
5. **Collection Stats**: Track view counts, popular repos within collections
   - Store in separate `stats.json` file
6. **Search**: Full-text search across collection names, descriptions, and repo metadata
   - Could pre-build search index in `search-index.json` for each user

---

## Open Questions

1. Should collection names be unique per user, or allow duplicates?
2. What's the expected collection size limit (max repos/users per collection)?
   - Current S3 approach handles ~5,000 items comfortably
   - Need to know if we should plan for larger scales
3. Should deleted collections be soft-deleted for recovery?
   - S3 versioning provides 30-day recovery window automatically
4. How should we handle concurrent edits from multiple devices?
   - Current spec uses last-write-wins with version conflicts
   - Alternative: operational transforms or CRDTs for complex scenarios

