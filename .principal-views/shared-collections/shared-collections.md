# Shared Collections Page

This canvas documents the user interactions for the `/worlds/[username]` page, which allows viewing another user's shared repository collections.

## Overview

The Shared Collections page is a **read-only view** (by default) that allows anyone to browse another GitHub user's collections. If the viewer is authenticated and owns the collections, they gain edit permissions.

## Key Differences from Worlds Page

| Aspect | Worlds (`/worlds`) | Shared (`/worlds/[username]`) |
|--------|-------------------|-------------------------------|
| **Purpose** | Manage your own collections | View someone else's collections |
| **Provider** | `WorldsPageProvider` | `SharedCollectionsProvider` |
| **Auth** | Required | Optional |
| **Permissions** | Full CRUD | Read-only (unless owner) |
| **Package Hydration** | Yes (sprite sizing) | Yes (sprite sizing) |
| **GitHub Repos** | Yes (Add Repository picker) | No |
| **Mode Switching** | Yes (Manage/Explore) | No |
| **Region Management** | Yes | No |

## Page Architecture

### Key Files
- `src/app/worlds/[username]/page.tsx` - Main page component
- `src/contexts/SharedCollectionsProvider.tsx` - Simplified provider for shared view

### Data Source
Collections are fetched from `/api/github/collections/{username}` which reads from the user's `.alexandria-collections` GitHub repository.

### Panel Layout
| Left Panel | Middle Panel | Right Panel |
|------------|--------------|-------------|
| User Profile | Collection Map | Workspace Collection / File City |

## Workflows

### 1. Page Initialization (`page-init.workflow.json`)
Handles loading another user's collections:

```
Page Init Started (username from URL)
    │
    └──► Fetch Collections (/api/github/collections/{user})
              │
              ├──► User Not Found (404)
              ├──► No Collections Repo (user hasn't set up collections)
              │
              └──► Collections Loaded
                        │
                        ├──► Empty Collections (0 collections)
                        │
                        └──► Check Permissions
                                  │
                                  └──► Permissions Result (canEdit)
                                            │
                                            └──► Collection Select → Page Ready
```

### 2. Collection Map Data (`collection-map-data.workflow.json`)
Two data flows feed the Collection Map Panel:

**Scenario 1: repo-details-to-map** (sprite rendering)
```
hydrate-repo-details-start
    │
    └──► hydrate-repo-details-item (repeats per repo)
              │
              └──► hydrate-repo-details-complete
                        │
                        └──► state-repo-details ──► panel-collection-map
```

**Scenario 2: packages-to-map** (sprite sizing)
```
hydrate-packages-start
    │
    └──► hydrate-packages-item (repeats per repo)
              │
              └──► hydrate-packages-complete
                        │
                        └──► state-packages ──► panel-collection-map
```

Both flows run in parallel when a collection is selected, ensuring sprites render with proper sizing.

### 3. Repository Preview (`repository-preview.workflow.json`)
When user clicks a repository on the map:

```
Repo Clicked
    │
    └──► File Tree Load
              │
              ├──► File Tree Success (File City panel)
              └──► File Tree Error
```

### 4. Collection Switch (`collection-switch.workflow.json`)
When user selects a different collection from the list.

## Event Naming Convention

All events follow the pattern: `shared.<domain>.<action>`

| Domain | Description |
|--------|-------------|
| `page` | Page-level lifecycle |
| `collections` | Collections loading/state |
| `permissions` | Edit permission checks |
| `collection` | Single collection operations |
| `hydrate` | Data loading |
| `state` | State store updates |
| `panel` | Panel renders |
| `repository` | Repository selection/preview |

## Permissions Model

1. **Fetch collections** - Always allowed (public data)
2. **Check permissions** - Requires authentication
3. **Edit operations** - Only if `canEdit === true` (owner viewing own collections)

```
Viewer authenticated? ──► No ──► Read-only view
         │
         Yes
         │
         └──► Check /api/github/collections/{user}/permissions
                   │
                   ├──► canEdit: true ──► Full CRUD
                   └──► canEdit: false ──► Read-only view
```

## Related Canvases

- `.principal-views/worlds/worlds.otel.canvas` - Full worlds page (own collections)
- `.principal-views/collections/collections.otel.canvas` - Backend collection operations
