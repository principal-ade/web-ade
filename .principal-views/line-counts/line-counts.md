# Line Counts

Stores and retrieves line counts for repositories to determine building heights in the File City 3D visualization.

## Overview

Line counts are stored in S3 cache and fetched on-demand. The system supports two modes:
- **Pre-computed**: Electron desktop app uploads line counts for any repo size
- **On-demand**: Web-ADE computes for repos with <2000 files (requires auth)

## Architecture

### Data Flow

```
GET /api/line-counts/[owner]/[repo]
        |
        v
    Check S3 Cache
        |
    +---v---+------------------+
    | hit    | miss            |
    |        |                 |
    v        v                 v
  Return  Check Auth      PUT /api/line-counts/[owner]/[repo]
  cached          |              |
                  |         +----v----+
                  |         | auth ok  | auth fail
                  |         v          v
                  v        Store      401 Error
            Check file count
                  |
          +-------v-------+
          | <2000 files  | >=2000 files
          |              |
          v              v
    Compute on-demand Return too-large
          |
          v
    Store in S3 (async)
          |
          v
    Return data
```

### Key Files

| File | Purpose |
|------|---------|
| `src/app/api/line-counts/[owner]/[repo]/route.ts` | API route for GET/PUT |
| `src/lib/line-counts/s3-cache.ts` | S3 cache operations |
| `src/hooks/useFileTree.ts` | Uses line counts for File City |

### Constraints

- Repos with >=2000 files require pre-computed cache
- Repos with <2000 files can be computed on-demand
- Without login, only cached data is available
- PUT requires GitHub token auth

## API

### GET /api/line-counts/[owner]/[repo]

Fetches line counts for a repository.

**Query Params:**
- `compute=1` - Force recomputation (ignores cache)

**Response (available):**
```json
{
  "available": true,
  "data": {
    "owner": "owner",
    "repo": "repo",
    "generatedAt": "2024-01-01T00:00:00Z",
    "generatedBy": "electron-app",
    "fileCount": 100,
    "lineCounts": { "src/index.ts": 50 }
  }
}
```

**Response (unavailable):**
```json
{
  "available": false,
  "reason": "auth-required|too-large|not-cached",
  "message": "..."
}
```

### PUT /api/line-counts/[owner]/[repo]

Stores line counts from electron-app (requires GitHub token).

**Headers:** `Authorization: Bearer <github_token>`

**Body:**
```json
{
  "lineCounts": { "src/index.ts": 50 },
  "fileCount": 1
}
```

**Response:**
```json
{ "success": true, "fileCount": 1 }
```
