# Mobile App Feed API Requests

API endpoints to support the mobile app's feed customization feature.

## Context

The mobile app (`principal-ai-mobile`) has a Feed Customization screen where users can:
- Follow/unfollow GitHub users
- Follow/unfollow repositories
- See activity from followed users/repos in their feed

Currently the app uses a hardcoded `FEATURED_REPOS` list. We want to let users customize their feed with suggestions based on their GitHub activity.

## Implemented Endpoints

All endpoints are available via tRPC at `github.*`.

### 1. Get Suggested Users

Single aggregated endpoint that returns users from multiple sources.

```typescript
// github.getSuggestedUsers
// Aggregates: GET /user/following + GET /orgs/{org}/members for each org

// Input: none (uses auth token)

// Output:
{
  users: Array<{
    login: string;
    avatar_url: string;
    name?: string | null;
    bio?: string | null;
    source: 'following' | 'org';
    orgName?: string;  // populated when source is 'org'
  }>;
}
```

**Sources aggregated:**
- Users the authenticated user follows on GitHub
- Members of organizations the user belongs to (coworkers)

**Use case:** Show as suggestions when user clicks "Add User" in feed customization.

### 2. Get Suggested Repos

Single aggregated endpoint that returns repos from multiple sources.

```typescript
// github.getSuggestedRepos
// Aggregates: GET /user/starred + GET /orgs/{org}/repos for each org

// Input: none (uses auth token)

// Output:
{
  repos: Array<{
    owner: string;
    name: string;
    full_name: string;
    description?: string | null;
    stargazers_count: number;
    language?: string | null;
    source: 'starred' | 'org';
    orgName?: string;  // populated when source is 'org'
  }>;
}
```

**Sources aggregated:**
- Repositories the user has starred
- Repositories from organizations the user belongs to

**Use case:** Show as suggestions when user clicks "Add Repository" in feed customization.

### 3. Search GitHub Users

Search for GitHub users by username/name.

```typescript
// github.searchUsers
// Maps to: GET /search/users (GitHub API)

// Input:
{
  query: string;
  perPage?: number;  // default 10, max 30
}

// Output:
{
  users: Array<{
    login: string;
    avatar_url: string;
    type: 'User' | 'Organization';
  }>;
  total_count: number;
}
```

**Use case:** Search functionality in "Add User" screen.

### 4. Search GitHub Repositories

Search for GitHub repositories.

```typescript
// github.searchRepos
// Maps to: GET /search/repositories (GitHub API)

// Input:
{
  query: string;
  perPage?: number;  // default 10, max 30
}

// Output:
{
  repos: Array<{
    owner: string;
    name: string;
    full_name: string;
    description?: string | null;
    stargazers_count: number;
    language?: string | null;
  }>;
  total_count: number;
}
```

**Use case:** Search functionality in "Add Repository" screen.

## Authentication

All endpoints (both `github.*` and `feed.*`) accept authentication via:
- **Bearer token** (recommended for mobile): `Authorization: Bearer <github_token>`
- **Cookie**: `github_token` cookie (for web)

Feed endpoints automatically fetch user identity from the GitHub API when using Bearer tokens.

```typescript
// Example mobile request
fetch('/api/trpc/feed.getCommitQueue', {
  headers: {
    'Authorization': 'Bearer ghp_xxxxxxxxxxxx'
  }
})
```

## Implementation Notes

- Suggestion endpoints require authentication (returns 401 if not authenticated)
- Search endpoints work without auth but benefit from higher rate limits when authenticated
- Org member/repo fetches run with concurrency limiting (max 5 parallel)
- Uses `Promise.allSettled` so partial failures don't break the response
- Results are deduplicated by login/full_name (following/starred takes priority over org)

## Swipe Feed Endpoints (Commit Activity)

Endpoints for the "Tinder-style" swipe feed where users can pass or save commit activity cards.

### 5. Get Commit Queue

Get activity cards from the last 24 hours, grouped by repo + hour bucket.

```typescript
// feed.getCommitQueue
// Fetches commits from followed users/repos, groups by repo+hour

// Input:
{
  limit?: number;  // default 20, max 50
}

// Output:
{
  cards: Array<{
    itemId: string;        // "YYYY-MM-DD:HH:owner/repo"
    repo: {
      owner: string;
      name: string;
    };
    hour: number;          // 0-23 (UTC)
    hourBucket: string;    // ISO timestamp for hour start
    commits: Array<{
      sha: string;
      message: string;
      author: {
        login: string;
        avatarUrl?: string;
      };
      committedAt: string;
      url: string;
    }>;
    commitCount: number;
    latestCommitAt: string;
  }>;
  hasMore: boolean;
}
```

**Grouping:** Commits are grouped by repository + hour bucket (same pattern as ActivityFeedPanel). Each card represents all commits for one repo within one hour.

**Filtering:** Cards that have been passed or saved are excluded from the queue.

### 6. Pass Card (Swipe Left)

Mark an activity card as seen - won't show again for this 24h cycle.

```typescript
// feed.passCard
// Input:
{
  itemId: string;  // e.g., "2026-04-04:14:facebook/react"
}

// Output:
{
  success: boolean;
}
```

**Note:** Passed items are ephemeral - only relevant for the current 24h window.

### 7. Save Card (Swipe Right)

Save an activity card for later reference. Persists beyond 24h.

```typescript
// feed.saveCard
// Input: Full CommitActivityCard object
{
  itemId: string;
  repo: { owner: string; name: string; };
  hour: number;
  hourBucket: string;
  commits: Array<{
    sha: string;
    message: string;
    author: { login: string; avatarUrl?: string; };
    committedAt: string;
    url: string;
  }>;
  commitCount: number;
  latestCommitAt: string;
}

// Output:
{
  success: boolean;
}
```

**Note:** The full card snapshot is saved so it remains accessible even after the 24h window expires.

### 8. Get Saved Cards

Retrieve all saved activity cards.

```typescript
// feed.getSavedCards
// Input: none

// Output:
{
  savedCards: Array<{
    ...CommitActivityCard,
    savedAt: string;  // ISO timestamp when saved
  }>;
}
```

Cards are sorted by `savedAt` (newest first).

### 9. Unsave Card

Remove a card from saved list.

```typescript
// feed.unsaveCard
// Input:
{
  itemId: string;
}

// Output:
{
  success: boolean;
}
```

## Follow Management Endpoints

Users can follow up to 5 users and 5 repositories.

```typescript
// feed.followUser / unfollowUser
// feed.followRepo / unfollowRepo
// feed.getFollows - returns current follows
```

## Related Files

- **GitHub API:** `src/server/routers/github.ts` (lines 438+)
- **Feed API:** `src/server/routers/feed.ts`
- **Types:** `src/lib/feed-collections/types.ts`
- **Storage:** `src/lib/feed-collections/s3-storage.ts`
- Mobile app: `src/screens/FeedCustomizationScreen.tsx`
- OTEL canvas: `.principal-views/feed-suggestions/feed-suggestions.otel.canvas`
