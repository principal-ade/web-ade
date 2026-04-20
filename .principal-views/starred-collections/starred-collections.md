# Starred Collections API - Telemetry Documentation

## Overview

This canvas documents the OpenTelemetry events for the Starred Collections API, a feature that allows users to organize GitHub repositories and users into custom collections stored in S3.

## Architecture

**Storage**: S3-based per-user JSON files
**Authentication**: GitHub OAuth tokens
**Concurrency Control**: Optimistic locking with ETags
**Metadata Caching**: GitHub API responses cached in S3

### Key Design Decisions

1. **S3 Storage vs Database**: Collections are stored as JSON files in S3 rather than a relational database because:
   - Data is user-scoped with no cross-user queries needed
   - Document-oriented structure matches API responses naturally
   - Eliminates database infrastructure and associated costs
   - Simple and cost-effective for this use case

2. **Optimistic Locking**: Uses S3 ETags to prevent concurrent modification conflicts:
   - Read file with ETag
   - Modify in memory
   - Write with If-Match header (fails if ETag changed)
   - Retry up to 3 times on conflicts

3. **GitHub Metadata Caching**: Repository and user metadata is cached in a separate S3 file:
   - Reduces GitHub API calls
   - 1-hour cache TTL
   - Async cache updates don't block responses

## Workflows

### 1. List Collections

**Endpoint**: `GET /api/starred-collections`

Retrieves all collections for the authenticated user.

**Event Flow**:
1. `starred-collections.list.started` - Request initiated
2. `starred-collections.list.s3.read` - Read collections from S3
3. `starred-collections.list.success` - Collections returned

**Error Paths**:
- `starred-collections.list.unauthorized` - Not authenticated
- `starred-collections.list.error` - S3 read failure

**Query Parameters**:
- `include_items` (boolean) - Include repos/users arrays (default: true)

---

### 2. Create Collection

**Endpoint**: `POST /api/starred-collections`

Creates a new collection with a timestamp-based ID.

**Event Flow**:
1. `starred-collections.create.started` - Creation requested
2. `starred-collections.create.validate` - Validate input (name, icon)
3. `starred-collections.create.s3.read` - Read existing collections
4. `starred-collections.create.check-duplicate` - Check for duplicate name
5. `starred-collections.create.check-limits` - Verify max collections not exceeded
6. `starred-collections.create.s3.write` - Write updated collections with ETag
7. `starred-collections.create.success` - Collection created

**Error Paths**:
- `starred-collections.create.unauthorized` - Not authenticated
- `starred-collections.create.validation-error` - Invalid name or icon
- `starred-collections.create.duplicate` - Collection name already exists
- `starred-collections.create.limit-exceeded` - Max collections reached
- `starred-collections.create.error` - S3 write failure or ETag conflict

**Validation Rules**:
- Name: Required, 1-100 characters
- Icon: Optional, must be valid Lucide icon name
- Description: Optional, max 500 characters

---

### 3. Add Repository to Collection

**Endpoint**: `POST /api/starred-collections/:collectionId/repos`

Adds a GitHub repository to a collection, fetching and caching metadata from GitHub API.

**Event Flow**:
1. `starred-collections.add-repo.started` - Add repo requested
2. `starred-collections.add-repo.validate` - Validate owner/repo format
3. `starred-collections.add-repo.s3.read` - Read collections data
4. `starred-collections.add-repo.check-duplicate` - Check if repo already in collection
5. `starred-collections.add-repo.github.fetch` - Fetch metadata from GitHub API (or cache)
6. `starred-collections.add-repo.cache.update` - Update metadata cache in S3
7. `starred-collections.add-repo.s3.write` - Write updated collection
8. `starred-collections.add-repo.success` - Repo added

**Error Paths**:
- `starred-collections.add-repo.unauthorized` - Not authenticated
- `starred-collections.add-repo.not-found` - Collection doesn't exist
- `starred-collections.add-repo.duplicate` - Repo already in collection
- `starred-collections.add-repo.github.error` - GitHub API error (repo not found, rate limit, etc.)
- `starred-collections.add-repo.error` - S3 write failure or other error

**Cached Metadata**:
- `description` - Repository description
- `stargazersCount` - Star count
- `avatarUrl` - Owner avatar URL

---

### 4. Add User to Collection

**Endpoint**: `POST /api/starred-collections/:collectionId/users`

Adds a GitHub user to a collection, fetching and caching metadata from GitHub API.

**Event Flow**:
1. `starred-collections.add-user.started` - Add user requested
2. `starred-collections.add-user.validate` - Validate username format
3. `starred-collections.add-user.github.fetch` - Fetch user metadata from GitHub API (or cache)
4. `starred-collections.add-user.s3.write` - Write updated collection
5. `starred-collections.add-user.success` - User added

**Error Paths**:
- `starred-collections.add-user.github.error` - GitHub API error (user not found, etc.)
- `starred-collections.add-user.error` - S3 write failure or other error

**Cached Metadata**:
- `avatarUrl` - User avatar URL
- `name` - User's display name

---

### 5. Reorder Items

**Endpoints**:
- `PATCH /api/starred-collections/reorder` - Reorder collections
- `PATCH /api/starred-collections/:collectionId/repos/reorder` - Reorder repos
- `PATCH /api/starred-collections/:collectionId/users/reorder` - Reorder users

Reorders items by updating the array order in the JSON file (array order = display order).

**Event Flow**:
1. `starred-collections.reorder.started` - Reorder requested
2. `starred-collections.reorder.validate` - Validate all items present, no duplicates
3. `starred-collections.reorder.s3.write` - Write reordered array
4. `starred-collections.reorder.success` - Reorder complete

**Error Paths**:
- `starred-collections.reorder.validation-error` - Missing items, duplicates, or count mismatch
- `starred-collections.reorder.error` - S3 write failure

**Validation Rules**:
- All existing items must be present
- No duplicate items allowed
- Array length must match current count

---

### 6. Delete Collection

**Endpoint**: `DELETE /api/starred-collections/:collectionId`

Deletes a collection and all its associations.

**Event Flow**:
1. `starred-collections.delete.started` - Delete requested
2. `starred-collections.delete.s3.read` - Read collections data
3. `starred-collections.delete.s3.write` - Write updated collections without deleted item
4. `starred-collections.delete.success` - Collection deleted

**Error Paths**:
- `starred-collections.delete.not-found` - Collection doesn't exist
- `starred-collections.delete.error` - S3 write failure

---

## Event Attributes

### Common Attributes

All events include:
- `userId` - GitHub user ID (where applicable)
- `collectionId` - Collection ID (where applicable)

### S3 Operation Attributes

- `s3Key` - S3 object key being accessed
- `etag` - ETag for optimistic locking
- `newVersion` - Version number after update

### GitHub API Attributes

- `owner` / `repo` - Repository identifiers
- `login` - GitHub username
- `cacheHit` - Whether metadata was served from cache

### Error Attributes

- `error.message` - Human-readable error message
- `error.code` - Error code (e.g., `DUPLICATE_NAME`, `GITHUB_API_ERROR`)
- `error.field` - Field that failed validation

---

## Instrumentation Scope

**Scope Name**: `starred-collections-api`

This scope covers all API operations for the starred collections feature, including:
- Collection CRUD operations
- Repository/user management within collections
- Reordering operations
- S3 storage operations
- GitHub API integration

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/starred-collections` | List all collections |
| POST | `/api/starred-collections` | Create collection |
| PATCH | `/api/starred-collections` | Reorder collections |
| GET | `/api/starred-collections/:id` | Get single collection |
| PATCH | `/api/starred-collections/:id` | Update collection metadata |
| DELETE | `/api/starred-collections/:id` | Delete collection |
| POST | `/api/starred-collections/:id/repos` | Add repo to collection |
| DELETE | `/api/starred-collections/:id/repos/:owner/:repo` | Remove repo |
| PATCH | `/api/starred-collections/:id/repos/reorder` | Reorder repos |
| POST | `/api/starred-collections/:id/users` | Add user to collection |
| DELETE | `/api/starred-collections/:id/users/:login` | Remove user |
| PATCH | `/api/starred-collections/:id/users/reorder` | Reorder users |

---

## S3 Storage Structure

```
s3://{bucket}/starred-collections/{user-id}/collections.json
s3://{bucket}/starred-collections/{user-id}/metadata-cache.json
```

**collections.json**:
```json
{
  "version": 42,
  "updatedAt": "2026-04-19T16:00:00Z",
  "collections": [...]
}
```

**metadata-cache.json**:
```json
{
  "repos": {
    "owner/repo": {
      "description": "...",
      "stargazersCount": 12345,
      "avatarUrl": "...",
      "cachedAt": "2026-04-19T16:00:00Z"
    }
  },
  "users": {
    "username": {
      "avatarUrl": "...",
      "name": "...",
      "cachedAt": "2026-04-19T16:00:00Z"
    }
  }
}
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `NOT_AUTHENTICATED` | 401 | Missing or invalid auth token |
| `COLLECTION_NOT_FOUND` | 404 | Collection doesn't exist |
| `DUPLICATE_NAME` | 409 | Collection name already exists |
| `DUPLICATE_REPO` | 409 | Repo already in collection |
| `DUPLICATE_USER` | 409 | User already in collection |
| `MAX_COLLECTIONS_EXCEEDED` | 400 | User has too many collections |
| `INVALID_COLLECTION_NAME` | 400 | Invalid collection name |
| `INVALID_ICON` | 400 | Invalid icon name |
| `INVALID_REORDER_REQUEST` | 400 | Invalid reorder data |
| `ETAG_CONFLICT` | 409 | Concurrent modification detected |
| `GITHUB_API_ERROR` | 502 | GitHub API unavailable |
| `REPO_NOT_FOUND` | 502 | GitHub repo doesn't exist |
| `USER_NOT_FOUND` | 502 | GitHub user doesn't exist |
| `S3_ERROR` | 500 | S3 operation failed |

---

## Performance Considerations

1. **GitHub API Rate Limiting**: Metadata is cached for 1 hour to reduce API calls
2. **ETag Conflicts**: Retry up to 3 times with exponential backoff
3. **Partial Responses**: `include_items=false` query param reduces payload size for list operations
4. **Async Cache Updates**: Cache updates don't block API responses

---

## Future Enhancements

Potential telemetry additions for future features:

- **Sharing**: Events for sharing collections publicly or with specific users
- **Import/Export**: Events for bulk import/export operations
- **Smart Collections**: Events for auto-population based on topics/languages
- **Search**: Events for full-text search across collections
- **Stats**: Events for tracking collection views and popularity

---

## References

- **API Specification**: `/collections-api-spec.md`
- **Implementation**: `/src/app/api/starred-collections/`
- **Storage Layer**: `/src/lib/starred-collections/s3-storage.ts`
- **GitHub Integration**: `/src/lib/starred-collections/github-metadata.ts`
- **Type Definitions**: `/src/lib/starred-collections/types.ts`
