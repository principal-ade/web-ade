# Feed Collections

This canvas documents the personalized feed collections feature, allowing users to customize which repositories appear in their activity feed.

## Overview

Feed Collections enables authenticated users to:
- Create private and public collections of repositories
- Subscribe to other users' public collections
- Personalize their home page feed with repos from subscribed collections

Anonymous users continue to see the default `FEATURED_REPOS` list.

## Architecture

### Storage (S3)

All data is stored in S3 as JSON files:

```
s3://feed-collections/
  collections/
    {collection-id}.json       # Collection definition
  users/
    {github-user-id}.json      # User's subscriptions + settings
```

### Data Models

```typescript
// Collection definition
interface FeedCollection {
  id: string;                          // UUID
  name: string;
  description?: string;
  ownerGithubId: string;
  ownerGithubLogin: string;
  visibility: 'public' | 'private';
  repos: Array<{
    owner: string;
    repo: string;
    description?: string;
    addedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// User's feed preferences
interface UserFeedProfile {
  githubId: string;
  githubLogin: string;
  subscribedCollections: string[];     // Collection IDs
  createdAt: string;
  updatedAt: string;
}
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/feed-collections/s3-storage.ts` | S3 CRUD operations for collections and profiles |
| `src/lib/feed-collections/types.ts` | TypeScript interfaces |
| `src/hooks/usePersonalizedFeed.ts` | React hook for loading personalized feed |
| `src/app/api/feed/collections/route.ts` | Create/list collections |
| `src/app/api/feed/collections/[id]/route.ts` | Get/update/delete collection |
| `src/app/api/feed/collections/[id]/repos/route.ts` | Add/remove repos from collection |
| `src/app/api/feed/collections/[id]/subscribe/route.ts` | Subscribe/unsubscribe |
| `src/app/api/feed/collections/public/[id]/route.ts` | View public collection |

## Workflows

### 1. Feed Load (`feed-load.workflow.json`)

Loading the personalized feed on home page:

```
Feed Load Started (githubId, isAuthenticated)
    │
    ├──► [Anonymous] ──► Use Featured Repos ──► Feed Ready
    │
    └──► [Authenticated]
              │
              └──► Fetch User Profile (S3)
                        │
                        ├──► Profile Not Found ──► Use Featured Repos ──► Feed Ready
                        │
                        └──► Profile Loaded
                                  │
                                  └──► Fetch Collections (S3, parallel)
                                            │
                                            └──► Collections Loaded
                                                      │
                                                      └──► Merge Repos (dedupe)
                                                                │
                                                                └──► Feed Ready
```

### 2. Collection CRUD (`collection-crud.workflow.json`)

Creating and managing collections:

```
Create Collection
    │
    └──► S3 Put Collection ──► Collection Created
                                      │
                                      └──► Auto-subscribe owner

Add Repo to Collection
    │
    └──► Fetch Collection ──► Validate ownership ──► Update Collection ──► S3 Put

Remove Repo from Collection
    │
    └──► Fetch Collection ──► Validate ownership ──► Update Collection ──► S3 Put
```

### 3. Subscription (`subscription.workflow.json`)

Subscribing to public collections:

```
Subscribe to Collection
    │
    └──► Fetch Collection
              │
              ├──► Collection Not Found ──► Error
              ├──► Private Collection ──► Access Denied
              │
              └──► Public Collection
                        │
                        └──► Update User Profile (add to subscriptions)
                                  │
                                  └──► S3 Put Profile

Unsubscribe from Collection
    │
    └──► Update User Profile (remove from subscriptions)
              │
              └──► S3 Put Profile
```

## Event Naming Convention

All events follow the pattern: `feed.<domain>.<action>`

| Domain | Description |
|--------|-------------|
| `load` | Feed loading lifecycle |
| `profile` | User profile operations |
| `collections` | Batch collection operations |
| `collection` | Single collection operations |
| `fallback` | Fallback to featured repos |
| `repos` | Repository merge/dedup |

## Access Control

| Operation | Anonymous | Authenticated (non-owner) | Owner |
|-----------|-----------|---------------------------|-------|
| View public collection | Yes | Yes | Yes |
| View private collection | No | No | Yes |
| Create collection | No | Yes | Yes |
| Edit collection | No | No | Yes |
| Delete collection | No | No | Yes |
| Subscribe to public | No | Yes | Yes |
| Unsubscribe | No | Yes | Yes |

## Feed Composition

When loading a personalized feed:

1. Fetch user's `UserFeedProfile` from S3
2. For each `subscribedCollections` ID, fetch the `FeedCollection` from S3
3. Merge all repos from all collections
4. Deduplicate by `owner/repo`
5. Pass to `useGitHubActivityFeed` hook (existing infrastructure)

If any step fails or user has no subscriptions, fall back to `FEATURED_REPOS`.

## Related Canvases

- `.principal-views/activity-feed/activity-feed.otel.canvas` - Activity feed rendering
- `.principal-views/shared-collections/shared-collections.otel.canvas` - Existing collections UI
