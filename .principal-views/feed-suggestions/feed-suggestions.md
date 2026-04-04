# Feed Suggestions

OTEL canvas documenting the GitHub API aggregation workflows for mobile feed customization.

## Overview

These endpoints provide user and repository suggestions by aggregating data from multiple GitHub API sources into single responses, optimized for mobile app consumption.

## Workflows

### 1. Get Suggested Users

**Endpoint:** `github.getSuggestedUsers`

Aggregates users from:
- GitHub following (`GET /user/following`)
- Organization members (`GET /orgs/{org}/members` for each org)

**Flow:**
1. Authenticate user (401 if not logged in)
2. Parallel fetch: following list + user's orgs
3. For each org, fetch members (with concurrency limiting)
4. Deduplicate by login (following takes priority)
5. Return with source attribution

### 2. Get Suggested Repos

**Endpoint:** `github.getSuggestedRepos`

Aggregates repositories from:
- Starred repos (`GET /user/starred`)
- Organization repos (`GET /orgs/{org}/repos` for each org)

**Flow:**
1. Authenticate user (401 if not logged in)
2. Parallel fetch: starred repos + user's orgs
3. For each org, fetch repos (with concurrency limiting)
4. Deduplicate by full_name (starred takes priority)
5. Return with source attribution

### 3. Search Users

**Endpoint:** `github.searchUsers`

Simple passthrough to GitHub Search API.

**Flow:**
1. Validate query input
2. Call `GET /search/users`
3. Return mapped results

### 4. Search Repos

**Endpoint:** `github.searchRepos`

Simple passthrough to GitHub Search API.

**Flow:**
1. Validate query input
2. Call `GET /search/repositories`
3. Return mapped results

## Error Handling

- **401 Unauthorized:** Suggestion endpoints require authentication
- **403 Forbidden:** Rate limiting from GitHub API
- **Partial failures:** Org fetches use `Promise.allSettled` to handle inaccessible orgs gracefully

## Implementation

See `src/server/routers/github.ts` for the tRPC router implementation.

## Related

- [Mobile Feed API Requests](../../docs/mobile-feed-api-requests.md)
- [Feed Collections Canvas](./../feed-collections/feed-collections.otel.canvas)
