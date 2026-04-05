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

### 5. Commit Queue (Swipe Feed)

**Endpoint:** `feed.getCommitQueue`

Fetches commit activity from the last 24 hours, grouped by repository + hour bucket for a "Tinder-style" swipe interface.

**Flow:**
1. Authenticate user (401 if not logged in)
2. Get user's followed repos and users
3. Parallel fetch:
   - Commits from followed repos (`GET /repos/{owner}/{repo}/commits`)
   - Push events from followed users (`GET /users/{login}/events`)
4. Group commits by repo + hour bucket (e.g., `2026-04-04:14:facebook/react`)
5. Filter out already passed or saved cards
6. Return activity cards sorted by recency

**Card Structure:**
- `itemId`: Unique ID in format `YYYY-MM-DD:HH:owner/repo`
- `repo`: Repository info
- `hour`: Hour bucket (0-23 UTC)
- `commits`: Array of commits in that hour
- `commitCount`: Total commits in card
- `latestCommitAt`: Most recent commit timestamp

### 6. Pass Card (Swipe Left)

**Endpoint:** `feed.passCard`

Mark an activity card as seen. Passed cards are ephemeral - only tracked for the current 24h window.

**Flow:**
1. Authenticate user
2. Add itemId to passed list in S3
3. Return success

### 7. Save Card (Swipe Right)

**Endpoint:** `feed.saveCard`

Save an activity card for later reference. Saved cards persist indefinitely with full snapshot.

**Flow:**
1. Authenticate user
2. Store full card snapshot to S3 with `savedAt` timestamp
3. Return success

### 8. Get Saved Cards

**Endpoint:** `feed.getSavedCards`

Retrieve all saved activity cards, sorted by save date.

### 9. Unsave Card

**Endpoint:** `feed.unsaveCard`

Remove a card from the saved list.

## Error Handling

- **401 Unauthorized:** Suggestion endpoints require authentication
- **403 Forbidden:** Rate limiting from GitHub API
- **Partial failures:** Org fetches use `Promise.allSettled` to handle inaccessible orgs gracefully

## Implementation

- **GitHub suggestions/search:** `src/server/routers/github.ts`
- **Swipe feed endpoints:** `src/server/routers/feed.ts`
- **Types:** `src/lib/feed-collections/types.ts`
- **S3 storage:** `src/lib/feed-collections/s3-storage.ts`

## Related

- [Mobile Feed API Requests](../../docs/mobile-feed-api-requests.md)
- [Feed Collections Canvas](./../feed-collections/feed-collections.otel.canvas)

## Workflow Files

- `suggested-users.workflow.json` - User suggestion scenarios
- `suggested-repos.workflow.json` - Repo suggestion scenarios
- `search.workflow.json` - GitHub search scenarios
- `commit-queue.workflow.json` - Commit queue fetch scenarios
- `swipe-actions.workflow.json` - Pass/save card scenarios
