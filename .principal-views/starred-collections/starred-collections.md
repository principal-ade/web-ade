# Starred Collections API - Telemetry Documentation

## Overview

This canvas documents the OpenTelemetry events for the Starred Collections API, a feature that allows users to organize GitHub repositories and users into custom collections stored in S3.

## Architecture

**Storage**: S3-based per-user and per-organization JSON files
**Authentication**: GitHub OAuth tokens for writes; reads are public
**Authorization**:
- Mutations: user collections (owner-only), org collections (any active member)
- Reads: any caller can fetch another user's or org's collections via the public read routes under `/api/github/owner/[owner]/starred-collections`
**Concurrency Control**: Optimistic locking with ETags
**Metadata Caching**: GitHub API responses cached in S3

### Key Design Decisions

1. **Organization Collections**: Users can create and manage collections under organizations they belong to:
   - User collections stored at `{user-id}/collections.json`
   - Organization collections stored at `org-{org-login}/collections.json`
   - Any active organization member can view, create, and edit org collections
   - Membership verified via GitHub API on every operation
   - List operations aggregate both user and org collections

2. **S3 Storage vs Database**: Collections are stored as JSON files in S3 rather than a relational database because:
   - Data is user-scoped and org-scoped with no complex cross-queries needed
   - Document-oriented structure matches API responses naturally
   - Eliminates database infrastructure and associated costs
   - Simple and cost-effective for this use case

3. **Optimistic Locking**: Uses S3 ETags to prevent concurrent modification conflicts:
   - Read file with ETag
   - Modify in memory
   - Write with If-Match header (fails if ETag changed)
   - Retry up to 3 times on conflicts

4. **GitHub Metadata Caching**: Repository and user metadata is cached in a separate S3 file:
   - Reduces GitHub API calls
   - 1-hour cache TTL
   - Async cache updates don't block responses

## Workflows

### 1. List Collections

**Endpoint**: `GET /api/starred-collections`

Retrieves all collections for the authenticated user, including both user-owned and organization collections.

**Event Flow**:
1. `starred-collections.list.started` - Request initiated (includes `orgCount` attribute)
2. `starred-collections.list.s3.read` - Read user collections from S3
3. For each organization: `starred-collections.list.s3.read` - Read org collections from S3
4. `starred-collections.list.success` - Aggregated collections returned

**Error Paths**:
- `starred-collections.list.unauthorized` - Not authenticated
- `starred-collections.list.error` - S3 read failure

**Query Parameters**:
- `include_items` (boolean) - Include repos/users arrays (default: true)

**Notes**:
- User collections and all org collections are fetched in parallel
- Organization membership is retrieved via GitHub API
- Collections include `ownerType` ('user' or 'org') and `ownerLogin` fields

---

### 2. Create Collection

**Endpoint**: `POST /api/starred-collections`

Creates a new collection with a timestamp-based ID. Can be created under a user account or an organization.

**Event Flow**:
1. `starred-collections.create.started` - Creation requested
2. `starred-collections.create.validate` - Validate input (name, icon)
3. `starred-collections.create.check-org-membership` - If `orgLogin` provided, verify user is org member via GitHub API
4. `starred-collections.create.s3.read` - Read existing collections (user or org storage)
5. `starred-collections.create.check-duplicate` - Check for duplicate name
6. `starred-collections.create.check-limits` - Verify max collections not exceeded
7. `starred-collections.create.s3.write` - Write updated collections with ETag
8. `starred-collections.create.success` - Collection created

**Error Paths**:
- `starred-collections.create.unauthorized` - Not authenticated
- `starred-collections.create.validation-error` - Invalid name or icon
- `starred-collections.create.not-org-member` - User not a member of specified organization
- `starred-collections.create.duplicate` - Collection name already exists
- `starred-collections.create.limit-exceeded` - Max collections reached
- `starred-collections.create.error` - S3 write failure or ETag conflict

**Request Body**:
- `name`: Required, 1-100 characters
- `icon`: Optional, must be valid Lucide icon name
- `description`: Optional, max 500 characters
- `orgLogin`: Optional, organization login to create collection under

**Notes**:
- If `orgLogin` is provided, collection is created in org storage and owned by the organization
- Organization membership is verified via GitHub API (`orgs.getMembershipForAuthenticatedUser`)
- Only active organization members can create org collections

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

### 6. Public Read (Another User's Collections)

**Endpoints**:
- `GET /api/github/owner/[owner]/starred-collections` - List a user's or org's collections
- `GET /api/github/owner/[owner]/starred-collections/[id]` - Get a single collection

Public, unauthenticated reads of any user's or organization's starred
collections. Resolves the GitHub login to an `id`/`type` via the GitHub
users API, then reads from the corresponding S3 file.

**Behavior**:
- `User` accounts -> `getCollections('user', String(id))`
- `Organization` accounts -> `getCollections('org', login)`
- Returns an empty `collections: []` array if the owner has no S3 file
- 404 if the GitHub login does not exist, or (single-collection route) the collection ID is not present

**Query Parameters** (list route):
- `include_items` (boolean) - Include repos/users arrays (default: true)

**Notes**:
- These routes do not emit telemetry today; if added later, suggest
  span pattern `api.collections.public-read`.
- The caller's GitHub token, if present, is forwarded only to ease
  rate limits on the `users/{login}` lookup. It is not used for
  authorization.

---

### 7. Delete Collection

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
- `ownerType` - Owner type: 'user' or 'org' (where applicable)
- `orgLogin` - Organization login for org collections (where applicable)

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
| GET | `/api/github/owner/:owner/starred-collections` | List another user's or org's collections (public) |
| GET | `/api/github/owner/:owner/starred-collections/:id` | Get a single collection by owner + ID (public) |

---

## S3 Storage Structure

**User Collections**:
```
s3://{bucket}/starred-collections/{user-id}/collections.json
s3://{bucket}/starred-collections/{user-id}/metadata-cache.json
```

**Organization Collections**:
```
s3://{bucket}/starred-collections/org-{org-login}/collections.json
s3://{bucket}/starred-collections/org-{org-login}/metadata-cache.json
```

**collections.json**:
```json
{
  "version": 42,
  "updatedAt": "2026-04-19T16:00:00Z",
  "collections": [
    {
      "id": "col_123456",
      "name": "My Collection",
      "ownerType": "user",
      "repos": [...],
      "users": [...]
    },
    {
      "id": "col_789012",
      "name": "Team Collection",
      "ownerType": "org",
      "ownerLogin": "my-org",
      "repos": [...],
      "users": [...]
    }
  ]
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

**Notes**:
- User collections stored by user ID, org collections prefixed with `org-`
- Each owner (user or org) has its own metadata cache
- Collection objects include `ownerType` and optionally `ownerLogin` fields

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `NOT_AUTHENTICATED` | 401 | Missing or invalid auth token |
| `COLLECTION_NOT_FOUND` | 404 | Collection doesn't exist |
| `NOT_ORG_MEMBER` | 403 | User not a member of specified organization |
| `ORG_MEMBERSHIP_CHECK_FAILED` | 502 | Failed to verify org membership via GitHub API |
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
