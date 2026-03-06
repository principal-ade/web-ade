# Worlds Page Interactions

This canvas documents the user interactions and page-level flows for the `/worlds` page, which provides an overworld map visualization of repository collections.

## Overview

The Worlds page allows authenticated users to:
- View and manage their repository collections
- Visualize collections as an overworld map with custom regions
- Explore individual repositories using File City visualization
- Switch between **Manage** and **Explore** modes

## Page Architecture

### Key Files
- `src/app/worlds/page.tsx` - Main page component
- `src/app/worlds/CollectionsPageContent.tsx` - Content layout with panels
- `src/contexts/WorldsPageProvider.tsx` - Page-level context and data hydration

### Panel Layout
| Mode | Left Panel | Middle Panel | Right Panel |
|------|------------|--------------|-------------|
| Manage | User Profile | Collection Map | Starred/Projects/Search (tabs) |
| Explore | User Profile | Collection Map | File City |

## Workflows

### 1. Page Initialization (`page-init.workflow.json`)
Handles the initial page load sequence:
1. Check authentication status
2. Load user's collections from GitHub
3. Auto-select collection (from URL or first available)
4. Initialize page with selected collection

### 2. Overworld Map Data (`overworld-map-data.workflow.json`)
Data hydration that feeds the **Overworld Map Panel** - repo details and packages.

**Consumer:** Overworld Map Panel

**Data flow:**
```
hydrate-repo-details ──writes──► collectionRepoDetails ──subscribes──► Overworld Map
                                                                              ▲
hydrate-packages ──writes──► packagesData ────────────────subscribes──────────┘
```

**Key behaviors:**
- Repos appear on the map **as they load** (progressive rendering)
- Package data affects **sprite sizing** on the overworld map
- Both detail and package loading happen **in parallel**
- Collection switch **re-triggers** hydration for new repos

### 3. GitHub Repos Hydration (`github-repos-hydration.workflow.json`)
Load user's GitHub repositories (owned, starred, orgs).

**Consumer:** Add Repository picker (Starred/Projects/Search tabs in right panel)

```
Auth Check ──► GitHub Repos Start ──► GitHub Repos Success
                                      (ownedCount, starredCount, orgCount)
```

This data is separate from the Overworld Map data - it powers the repository picker for adding repos to collections

### 4. Repository Selection (`repository-select.workflow.json`)
When user clicks a repository on the overworld map:
1. Emit selection event
2. Load repository file tree
3. Display in File City panel (Explore mode)

### 5. Collection Switch (`collection-switch.workflow.json`)
When user selects a different collection:
1. Update URL with new collection ID
2. Load collection's repositories
3. Re-trigger data hydration for new repos
4. Refresh overworld map

### 6. Mode Switch (`mode-switch.workflow.json`)
Toggle between Manage and Explore modes:
- **Manage**: Right panel shows search/starred repos for adding to collection
- **Explore**: Right panel shows File City for selected repository

### 7. Region Management (`region-management.workflow.json`)
Custom regions on the overworld map:
1. Create new regions
2. Assign repositories to regions
3. Batch initialize layout (auto-layout)

## Event Naming Convention

All events follow the pattern: `worlds.<domain>.<action>`

| Domain | Description |
|--------|-------------|
| `page` | Page-level lifecycle events |
| `hydrate` | Data loading/hydration events |
| `state` | State store updates |
| `panel` | Panel render events |
| `repository` | Repository selection/loading |
| `collection` | Collection switching |
| `mode` | View mode changes |
| `region` | Map region management |

## Edge Types

| Type | Description |
|------|-------------|
| `flow` | Standard sequential flow |
| `error` | Error/failure path |
| `user-action` | Triggered by user interaction |
| `progressive` | Per-item progressive loading (repeats) |
| `data-flow` | State writes and subscriptions |

## Loading State Summary

| Loading State | Source | Used By |
|---------------|--------|---------|
| `githubReposLoading` | WorldsPageProvider | Starred/Owned repos panel |
| `collectionRepoDetailsLoading` | WorldsPageProvider | Overworld map sprites |
| `packagesLoading` | WorldsPageProvider | Sprite sizing (not tracked) |
| `fileTreeLoading` | WorldsPageProvider | File City panel |
| `activeFileLoading` | WorldsPageProvider | File content viewer |

## Related Canvases

- `.principal-views/collections/collections.otel.canvas` - Backend collection operations (load, create, import)
