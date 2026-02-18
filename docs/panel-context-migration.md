# Panel Context Migration: Monolithic to Page-Specific Providers

**Status:** In Progress
**Started:** 2026-02-17
**Goal:** Replace the monolithic `PanelContext` with page-specific providers that only include the slices each page needs.

## Problem Statement

The current `PanelContext` (`src/contexts/PanelContext.tsx`) is a monolithic provider that:
- Registers **25+ data slices** for all pages
- Fetches data for all slices regardless of whether a page uses them
- Provides the same massive context type to every page
- Is ~3700 lines long
- Makes it unclear what data each page actually depends on

### Example Issues

- **Home page** gets all 25 slices but only uses `github-repositories`, `owner-repositories`, `githubStarred`
- **Activity page** gets all 25 slices but only needs `current-projects`, `telemetry`, `github-messages`, `fileTree`
- **Worlds page** gets all 25 slices but only needs collections-related and explore mode slices
- Every page pays the performance cost of fetching and managing unused data

## Solution

Create **page-specific providers** that:
1. Only register the slices that page actually uses
2. Only fetch data for those specific slices
3. Provide typed contexts with only the needed slices
4. Follow the pattern established in `desktop-app/electron-app`

### Key Principles

1. **Actions, not Events** - Callbacks like `onRegionCreated` are provided as actions, not event listeners
2. **Metadata Structure** - Store custom data (like `customRegions`, `layoutMode`) in `collection.metadata`
3. **Typed Contexts** - Each provider exports its own context type with only the slices it provides
4. **No Breaking Changes** - Original `PanelContext` remains until all pages are migrated

## Migration Status

### ✅ Completed

#### WorldsPageProvider (`src/contexts/WorldsPageProvider.tsx`)
- **Created:** 2026-02-17
- **Slices:** 13 total
  - `userCollections` - User's collections
  - `selectedCollectionView` - Selected collection with repos
  - `workspaceRepositories` - Repository details in collection
  - `workspace` - Workspace metadata
  - `githubStarred` - Starred repositories
  - `githubProjects` - User's GitHub projects
  - `github-repositories` - All GitHub repos
  - `fileTree` - File tree (for file-city panel)
  - `fileCityColorModes` - Color mode options
  - `quality` - Code quality metrics
  - `active-file` - Currently open file
  - `packages` - Package information
  - `commitFiles`, `storyboardContext` - File City extras
- **Actions:** Implements `CollectionMapPanelActions` for region management
  - `onInitializeDefaultRegions`
  - `onSwitchLayoutMode`
  - `onRegionCreated`
  - `onRegionUpdated`
  - `onRegionDeleted`
  - `onRepositoryAssigned`
  - `onRepositoryPositionUpdated`
  - `onBatchLayoutInitialized`
- **Pages Using:** `/worlds`, `/worlds/[username]`
- **Build Status:** ✅ Compiles successfully

### 🔲 Pending

#### HomePage Provider
- **Route:** `/`
- **Estimated Slices Needed:**
  - `github-repositories` - For showing user's repos
  - `owner-repositories` - For recent owners
  - `githubStarred` - For starred repos
- **Current:** Still using monolithic `PanelContext`

#### ActivityPageProvider
- **Route:** `/activity`
- **Estimated Slices Needed:**
  - `current-projects` - Presence data
  - `telemetry` - OTEL traces
  - `github-messages` - GitHub notifications/timeline
  - `fileTree` - File tree for file-city panel
  - `fileCityColorModes` - Color modes
- **Current:** Still using monolithic `PanelContext`

#### OwnerPageProvider (`src/contexts/OwnerPageProvider.tsx`)
- **Created:** 2026-02-17
- **Route:** `/[owner]`
- **Slices:** 8 total
  - `owner-repositories` - Owner's GitHub repositories
  - `fileTree` - File tree (for previewed repo)
  - `fileCityColorModes` - Color modes (for file-city panel)
  - `quality` - Quality metrics (for quality panel and file-city)
  - `active-file` - Active file (for file-city panel)
  - `packages` - Packages (for package-composition panel)
  - `commitFiles` - Commit files (for file-city panel)
  - `storyboardContext` - Storyboard context (for visual-validation panel)
- **Pages Using:** `/[owner]`
- **Build Status:** ✅ Compiles successfully

#### RepositoryPageProvider (EditorLayout)
- **Route:** `/[owner]/[repo]`
- **Estimated Slices Needed:**
  - `active-file` - Currently open file
  - `fileTree` - Repository file tree
  - `commits` - Git commit history
  - `quality` - Code quality metrics
  - `lensResults` - Lens analysis results
  - `packages` - Package composition
  - `github-messages` - GitHub issues/PRs
  - `repoCapabilities` - Repository capabilities
  - `storyboardContext` - Storyboard data
  - `telemetry` - OTEL traces
  - `schematics` - Versioned workflows
- **Current:** Still using monolithic `PanelContext` via `EditorLayout`
- **Note:** This is the most complex page with the most slices

## How to Create a New Page-Specific Provider

### 1. Analyze the Page

Identify what slices the page actually uses:

```bash
# Find slice usage in the page component
grep -r "getSlice\|context\." src/app/your-page/
```

### 2. Create the Provider File

Create `src/contexts/YourPageProvider.tsx`:

```typescript
import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  DataSlice,
} from '@principal-ade/panel-framework-core';

// Define the specific slices this page needs
export interface YourPageContextType {
  sliceOne?: DataSlice<SliceOneData>;
  sliceTwo?: DataSlice<SliceTwoData>;
  // ... only the slices this page uses
}

// Extend PanelActions with any page-specific actions
interface YourPagePanelActions extends PanelActions {
  // Add page-specific action callbacks here
}

interface YourPageProviderValue {
  context: PanelContextValue<YourPageContextType>;
  actions: YourPagePanelActions;
  events: PanelEventEmitter;
}

const YourPageContext = createContext<YourPageProviderValue | null>(null);

export function YourPageProvider({ children }: { children: ReactNode }) {
  // Initialize only the slices this page needs
  // Provide only the actions this page needs
  // ...
}

export function useYourPageProvider() {
  const context = useContext(YourPageContext);
  if (!context) {
    throw new Error('useYourPageProvider must be used within YourPageProvider');
  }
  return context;
}
```

### 3. Update the Page

Replace `PanelProvider` with your new provider:

```typescript
// Before
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';

// After
import { YourPageProvider, useYourPageProvider } from '@/contexts/YourPageProvider';
```

### 4. Key Patterns to Follow

**✅ DO:**
- Store custom data in `metadata` objects (e.g., `collection.metadata.customRegions`)
- Provide callbacks as **actions**, not event listeners
- Only register slices the page actually uses
- Use typed context interfaces for type safety
- Follow the desktop-app pattern (see `desktop-app/electron-app/src/renderer/contexts/WorldsViewPanelContext.tsx`)

**❌ DON'T:**
- Use `any` types - be explicit about metadata shapes
- Create event listeners for panel callbacks - use actions instead
- Copy all 25 slices from PanelContext - only include what's needed
- Store custom data directly on top-level objects - use metadata

## Reference Implementation

The `WorldsPageProvider` is the reference implementation. Key files:
- `/src/contexts/WorldsPageProvider.tsx` - The provider itself
- `/src/app/worlds/page.tsx` - How the page uses it
- `/Users/griever/Developer/desktop-app/electron-app/src/renderer/contexts/WorldsViewPanelContext.tsx` - Desktop-app reference

## Benefits Achieved

### For WorldsPageProvider

**Before (Monolithic PanelContext):**
- 25+ slices registered
- ~3700 lines of code
- All pages share the same massive context
- Unclear dependencies

**After (WorldsPageProvider):**
- 13 slices (48% reduction)
- ~1200 lines of focused code
- Clear, typed dependencies
- Better performance (less data fetching)

## Timeline

| Date | Milestone |
|------|-----------|
| 2026-02-17 | ✅ WorldsPageProvider created and tested |
| 2026-02-17 | ✅ OwnerPageProvider created and tested |
| TBD | HomePageProvider |
| TBD | ActivityPageProvider |
| TBD | RepositoryPageProvider (most complex) |
| TBD | Remove monolithic PanelContext |

## Notes

- The original `PanelContext` will remain in place until all pages are migrated
- Each page provider can be developed and tested independently
- No breaking changes to existing functionality
- Follow the desktop-app pattern for consistency across Electron and web
