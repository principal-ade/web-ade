# Dynamic Slice Migration Tracker

**Goal:** Migrate all panel contexts from Map-based dynamic slices to explicit typed slices.

**Status:** 3/5 contexts complete (60%)

---

## Migration Pattern

### Old Pattern (Map-based):
```typescript
const slices = useMemo(() => new Map([
  ['userCollections', {
    scope: 'global',
    name: 'userCollections',
    data: { collections, memberships },
    loading: collectionsLoading,
    error: null,
    refresh: fetchCollections,
  }],
  // ... more slices
]), [dependencies]);

// Usage in panels:
const slice = context.getSlice('userCollections');
await context.refresh(undefined, 'userCollections');
```

### New Pattern (Explicit):
```typescript
// Create explicit slice objects
const userCollectionsSlice = useMemo<DataSlice<UserCollectionsSlice>>(
  () => ({
    scope: 'global',
    name: 'userCollections',
    data: { collections, memberships },
    loading: collectionsLoading,
    error: null,
    refresh: async () => { /* no-op */ },
  }),
  [collections, memberships, collectionsLoading],
);

// Empty Map (required by interface)
const slices = useMemo(() => new Map(), []);

// Make legacy methods no-ops
getSlice: () => undefined,
hasSlice: () => false,
isSliceLoading: () => false,
refresh: async () => { /* no-op */ },

// Add to context as typed property
const context: PanelContextValue<MyContextType> = {
  // ... other props
  userCollections: userCollectionsSlice,  // Direct typed access!
}

// Usage in panels:
const data = context.userCollections.data;  // Typed!
await actions.createCollection(...)  // Action handles refresh
```

---

## Architecture Principles

1. **Actions handle refreshing** - Not `context.refresh()`
2. **React handles reactivity** - State changes trigger re-renders automatically
3. **Typed properties** - Direct access: `context.userCollections` not `context.getSlice('userCollections')`
4. **Legacy methods are no-ops** - Required by interface, but do nothing

---

## Contexts to Migrate

### ✅ 1. WorldsPageProvider (COMPLETE - 14/14 slices migrated)
- **Location:** `src/contexts/WorldsPageProvider.tsx`
- **Status:** ✅ FULLY MIGRATED (100%)
- **Total slices:** 14
- **All slices migrated:**
  - ✅ `userCollections` → explicit slice
  - ✅ `workspace` → explicit slice
  - ✅ `workspaceRepositories` → explicit slice
  - ✅ `packages` → explicit slice
  - ✅ `githubStarred` → explicit slice
  - ✅ `githubProjects` → explicit slice
  - ✅ `github-repositories` → explicit slice
  - ✅ `fileTree` → explicit slice
  - ✅ `fileCityColorModes` → explicit slice
  - ✅ `quality` → explicit slice
  - ✅ `active-file` → explicit slice
  - ✅ `commitFiles` → explicit slice
  - ✅ `storyboardContext` → explicit slice
  - ✅ `selectedCollectionView` → already explicit state (special case)
- **Used by:** /worlds page (main collections view)
- **Complexity:** High - 14 slices total
- **Notes:**
  - ✅ COMPLETE! All slices migrated to explicit pattern
  - Empty Map - no dynamic slices remaining
  - Started 2025-02-20, completed 2025-02-20
  - Fixed API response check bug (data.success → data.isAuthenticated)

---

### ✅ 2. RepositoryPageProvider (COMPLETE - 13/13 slices migrated)
- **Location:** `src/contexts/RepositoryPageProvider.tsx`
- **Status:** ✅ FULLY MIGRATED (100%)
- **Total slices:** 13
- **All slices migrated:**
  - ✅ `fileTree` → explicit slice
  - ✅ `active-file` / `activeFile` → explicit slice (required, aliased)
  - ✅ `commits` → explicit slice
  - ✅ `quality` → explicit slice
  - ✅ `lensResults` → explicit slice
  - ✅ `packages` → explicit slice
  - ✅ `github-messages` → explicit slice
  - ✅ `repoCapabilities` → explicit slice
  - ✅ `storyboardContext` → explicit slice
  - ✅ `telemetry` → explicit slice
  - ✅ `schematics` → explicit slice
  - ✅ `fileCityColorModes` → explicit slice
  - ✅ `commitFiles` → explicit slice
- **Used by:** /[owner]/[repo] page (main repository view)
- **Complexity:** Very High - 13 slices (most critical context!)
- **Notes:**
  - ✅ COMPLETE! All slices migrated to explicit pattern
  - Most heavily used context in the app
  - Two core slices are required (active-file, fileTree)
  - Has alias: activeFile → 'active-file'
  - Empty Map - no dynamic slices remaining
  - Started 2025-02-20, completed 2025-02-21

---

### ✅ 3. OwnerPageProvider (COMPLETE - 9/9 slices migrated)
- **Location:** `src/contexts/OwnerPageProvider.tsx`
- **Status:** ✅ FULLY MIGRATED (100%)
- **Total slices:** 9
- **All slices migrated:**
  - ✅ `ownerRepositories` / `owner-repositories` → explicit slice (required, aliased)
  - ✅ `selectedCollectionView` → explicit slice (required)
  - ✅ `fileTree` → explicit slice
  - ✅ `fileCityColorModes` → explicit slice
  - ✅ `quality` → explicit slice
  - ✅ `active-file` → explicit slice
  - ✅ `packages` → explicit slice (required)
  - ✅ `commitFiles` → explicit slice
  - ✅ `storyboardContext` → explicit slice
- **Used by:** /[owner] page (owner profile view)
- **Complexity:** High - 9 slices
- **Notes:**
  - ✅ COMPLETE! All slices migrated to explicit pattern
  - Has alias: ownerRepositories → 'owner-repositories'
  - selectedCollectionView is used by CollectionMapPanel
  - Empty Map - no dynamic slices remaining
  - Completed 2025-02-21

---

### ❌ 4. ActivityPageProvider (NOT STARTED)
- **Location:** `src/contexts/ActivityPageProvider.tsx`
- **Status:** ❌ Not Started
- **Slices to migrate:**
  - ❌ `fileTree` (optional)
  - ❌ `fileCityColorModes` (optional)
  - ❌ `quality` (optional)
  - ❌ `active-file` (optional)
  - ❌ `packages` (optional)
  - ❌ `commitFiles` (optional)
  - ❌ `storyboardContext` (optional)
  - ❌ `github-messages` (optional)
- **Used by:** Activity page
- **Complexity:** Medium - 8 slices (all optional)
- **Notes:**
  - All slices are optional
  - Simpler than other contexts

---

### ❌ 5. HomePageProvider (NOT STARTED)
- **Location:** `src/contexts/HomePageProvider.tsx`
- **Status:** ❌ Not Started
- **Slices to migrate:**
  - ❌ `github-repositories` (optional)
  - ❌ `owner-repositories` (optional)
  - ❌ `githubStarred` (optional)
- **Used by:** Home page
- **Complexity:** Low - 3 slices (all optional)
- **Notes:**
  - Smallest context
  - Good candidate for early migration after WorldsPageProvider

---

## Migration Checklist (Per Context)

### Phase 1: Analysis
- [ ] List all slices in the Map
- [ ] Identify slice data types
- [ ] Find all panels that use this context
- [ ] Grep for `context.getSlice()`, `context.refresh()`, `context.hasSlice()` usage

### Phase 2: Create Explicit Slices
- [ ] Create explicit slice objects with `useMemo`
- [ ] Define proper TypeScript types for each slice
- [ ] Ensure dependencies are correct in `useMemo`
- [ ] Empty the slices Map: `new Map()`

### Phase 3: Update Context Interface
- [ ] Add typed properties to context interface (e.g., `userCollections: DataSlice<UserCollectionsSlice>`)
- [ ] Update context value to use explicit slices
- [ ] Update context dependencies in `useMemo`

### Phase 4: Make Legacy Methods No-ops
- [ ] `getSlice()` → return `undefined`
- [ ] `hasSlice()` → return `false`
- [ ] `isSliceLoading()` → return `false`
- [ ] `refresh()` → no-op with comment
- [ ] Add clear migration comments

### Phase 5: Verify
- [ ] Run typecheck: `npm run typecheck`
- [ ] Test in UI - ensure data loads
- [ ] Verify panels access typed properties
- [ ] Check that actions handle refreshing

---

## External Dependencies

### Panels Using These Contexts (industry-themed-alexandria-entry-panels)
Located at: `/Users/griever/Developer/web-ade/industry-themed-alexandria-entry-panels`

**Current usage:**
- `UserCollectionsPanel` - calls `context.refresh(undefined, 'userCollections')`
- `LocalProjectsPanel` - calls `context.refresh('repository', 'alexandriaRepositories')` heavily
- `WorkspacesListPanel` - calls `context.refresh('workspace', 'workspaces')`
- Panel registration - uses `hasSlice()` and `isSliceLoading()` extensively

**Migration path for external panels:**
1. **Short term:** No-op stubs in contexts allow existing panel code to work (calls do nothing)
2. **Medium term:** Update panels to access typed properties directly
3. **Long term:** Remove all `context.refresh()` calls - rely on action-based refreshing

**Note:** We control this package and can update it after contexts are migrated.

---

## Testing Strategy

1. **Per-context testing:**
   - Verify UI loads correctly
   - Test all panels using that context
   - Check network requests (ensure no duplicate fetches)
   - Verify optimistic updates work

2. **Integration testing:**
   - Test interactions between panels
   - Verify event-driven updates
   - Check that actions properly update state

3. **Regression testing:**
   - Compare behavior before/after migration
   - Ensure no data loss
   - Verify all user workflows still work

---

## Related Documentation

- Desktop app reference: `/Users/griever/Developer/desktop-app/electron-app/DYNAMIC_SLICE_MIGRATION.md`
- [panel-framework-core](https://github.com/principal-ade/panel-framework-core) - Core panel framework

---

## Progress Log

### 2025-02-20: WorldsPageProvider - Partial Migration (2/14 slices)
- Migrated `githubStarred` and `githubProjects` to explicit pattern
- Fixed API response check bug (data.success → data.isAuthenticated)
- Fixed data structure mismatches for GitHubStarredSlice and GitHubProjectsSlice
- Made legacy methods (getSlice, getWorkspaceSlice, getRepositorySlice, hasSlice, isSliceLoading, refresh) no-ops
- Verified typecheck passes

**Key challenges:**
- API response didn't have `success` field - changed to `isAuthenticated`
- Panels expected different data structures than context provided
- Had to build `orgRepositories` map from organizations array

**Impact:**
- Fixed empty starred repos and user repos panels in worlds page
- 2 out of 14 slices migrated (14% complete for this context)
- Pattern established for remaining slices in this context

---

### 2025-02-20: WorldsPageProvider - COMPLETE! All slices migrated (14/14 slices) ✅
- Migrated all 7 remaining optional slices to explicit pattern:
  - `github-repositories`, `fileTree`, `fileCityColorModes`, `quality`, `active-file`, `commitFiles`, `storyboardContext`
- Removed all Map initialization code
- Removed all Map updating code
- Empty Map - no dynamic slices remaining
- Updated context to use explicit slices directly
- Updated context dependencies with all explicit slices
- Verified typecheck passes

**Key changes:**
- fileTree: repository scope, tracks loading and error states
- active-file: conditional data based on activeFileContent and githubRepo, builds ActiveFileSlice with source
- quality: repository scope, quality metrics data
- fileCityColorModes: combines enabledModes, selectedColorMode, and qualityData
- github-repositories: global scope, GitHub repos data
- commitFiles: repository scope, commit file details
- storyboardContext: repository scope, storyboard data

**Impact:**
- ✅ WorldsPageProvider is 100% complete!
- All 14 slices have full type safety
- React handles all reactivity automatically through useMemo
- Map is empty - ready for complete removal in future

---

### 2025-02-20: WorldsPageProvider - Migrated Required Slices (6/14 slices)
- Migrated `userCollections`, `workspace`, `workspaceRepositories`, and `packages` to explicit pattern
- All required slices now migrated ✅
- Created explicit useMemo slices with proper dependencies
- Removed Map initialization and updating code
- Updated context to use explicit slices directly
- Verified typecheck passes

**Key changes:**
- userCollections: includes collections, memberships, loading, saving, gitHubRepoExists, gitHubRepoUrl
- workspace: conditional data based on collectionId and workspace props
- workspaceRepositories: uses collectionRepoDetails and loading state
- packages: uses packagesData, packagesLoading, packagesError state

**Impact:**
- All required slices have full type safety
- 6 out of 14 slices migrated (43% complete for this context)
- 7 optional slices remaining (all related to File City and other panels)

**Next steps for WorldsPageProvider:**
- Migrate optional slices as needed for specific panels

---

### 2025-02-20: RepositoryPageProvider - Started Migration (1/13 slices)
- Migrated `fileTree` to explicit pattern
- Created explicit useMemo slice with proper dependencies
- Removed Map initialization and updating code for fileTree
- Updated context to use explicit slice directly
- Verified typecheck passes

**Key changes:**
- Created explicit fileTree slice with data, loading, and error state
- No-op refresh function for interface compatibility
- React handles reactivity through useMemo dependencies

**Impact:**
- File tree now has full type safety
- 1 out of 13 slices migrated (8% complete for this context)
- Most critical context - used by main repository view

**Next steps for RepositoryPageProvider:**
- ✅ COMPLETE! All slices migrated

---

### 2025-02-21: RepositoryPageProvider - COMPLETE! All slices migrated (13/13 slices) ✅
- Migrated all 13 slices to explicit pattern:
  - `fileTree`, `active-file`/`activeFile`, `commits`, `quality`, `lensResults`, `packages`, `github-messages`, `repoCapabilities`, `storyboardContext`, `telemetry`, `schematics`, `fileCityColorModes`, `commitFiles`
- Removed all Map initialization code
- Removed all Map updating code (useEffect)
- Empty Map - no dynamic slices remaining
- Updated context to use explicit slices directly
- Made legacy methods (getSlice, getWorkspaceSlice, getRepositorySlice, hasSlice, isSliceLoading, refresh) no-ops
- Verified typecheck passes

**Key changes:**
- All 13 slices now use useMemo with proper dependencies
- Core slices: fileTree (repository scope), active-file (repository scope with alias)
- Optional slices: commits, quality, lensResults, packages, github-messages, repoCapabilities, storyboardContext, telemetry, schematics, fileCityColorModes, commitFiles
- React handles all reactivity automatically through useMemo dependencies

**Impact:**
- ✅ RepositoryPageProvider is 100% complete!
- All 13 slices have full type safety
- Most critical context in the app now uses explicit slice pattern
- Map is empty - ready for complete removal in future

---

### 2025-02-21: OwnerPageProvider - COMPLETE! All slices migrated (9/9 slices) ✅
- Migrated all 9 slices to explicit pattern:
  - `owner-repositories`/`ownerRepositories`, `selectedCollectionView`, `fileTree`, `fileCityColorModes`, `quality`, `active-file`, `packages`, `commitFiles`, `storyboardContext`
- Removed all Map initialization code
- Removed all Map updating code (useEffect)
- Empty Map - no dynamic slices remaining
- Updated context to use explicit slices directly
- Made legacy methods (getSlice, getWorkspaceSlice, getRepositorySlice, hasSlice, isSliceLoading, refresh) no-ops
- Verified typecheck passes

**Key changes:**
- All 9 slices now use useMemo with proper dependencies
- Required slices: ownerRepositories, packages, selectedCollectionView
- Optional slices: fileTree, fileCityColorModes, quality, active-file, commitFiles, storyboardContext
- React handles all reactivity automatically through useMemo dependencies

**Impact:**
- ✅ OwnerPageProvider is 100% complete!
- All 9 slices have full type safety
- Owner page now uses explicit slice pattern
- Map is empty - ready for complete removal in future

---

## Next Steps

**Priority order:**
1. ✅ WorldsPageProvider - **COMPLETE!** (14/14 slices)
2. ✅ RepositoryPageProvider - **COMPLETE!** (13/13 slices)
3. ✅ OwnerPageProvider - **COMPLETE!** (9/9 slices)
4. Migrate HomePageProvider (3 slices - simplest)
5. Migrate ActivityPageProvider (8 slices - all optional)

**Estimated effort:**
- ✅ WorldsPageProvider: COMPLETE
- ✅ RepositoryPageProvider: COMPLETE
- ✅ OwnerPageProvider: COMPLETE
- HomePageProvider: 30 minutes (3 slices)
- ActivityPageProvider: 1 hour (8 slices)

**Total remaining:** ~1.5 hours for full migration (2 contexts)
