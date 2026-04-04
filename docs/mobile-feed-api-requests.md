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

All endpoints accept authentication via:
- **Bearer token** (recommended for mobile): `Authorization: Bearer <github_token>`
- **Cookie**: `github_token` cookie (for web)

```typescript
// Example mobile request
fetch('/api/trpc/github.getSuggestedUsers', {
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

## Related Files

- **Implementation:** `src/server/routers/github.ts` (lines 438+)
- Mobile app: `src/screens/FeedCustomizationScreen.tsx`
- OTEL canvas: `.principal-views/feed-collections/feed-collections.otel.canvas`
- Feed router: `src/server/routers/feed.ts`
