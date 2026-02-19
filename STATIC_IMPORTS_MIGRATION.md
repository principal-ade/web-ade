# Static Imports Migration Plan

## Overview

Migrate all panels from dynamic imports to static imports to enable **compile-time type safety**. Dynamic imports with `next/dynamic` return `ComponentType<any>`, losing all generic type information and preventing TypeScript from catching type mismatches between providers and panels.

## Benefits of Static Imports

- ✅ **Compile-time type checking** - catch context/slice mismatches at build time
- ✅ **Better developer experience** - autocomplete and type hints work correctly
- ✅ **Prevents runtime errors** - type issues caught before deployment
- ✅ **Simpler code** - no need for `as React.ComponentType<any>` casts

## Trade-offs

- ⚠️ **Larger initial bundle** - all panels loaded upfront (estimated ~500KB increase)
- ✅ **Still code-split at page level** - Next.js handles page-level splitting
- ✅ **Acceptable for dev IDE** - users expect to load the full IDE

---

## Migration Status

### ✅ ALL PANELS MIGRATED! (8/8 - 100%)

All panels in the worlds page have been successfully migrated from dynamic imports to static imports.

### Alexandria Panels (`@industry-theme/alexandria-panels`)

#### ✅ Completed (3/3)

| Panel | File | Status | Issues Found | Notes |
|-------|------|--------|--------------|-------|
| UserCollectionsPanel | `CollectionsPageContent.tsx:65` | ✅ **DONE** | Fixed 3 type mismatches | v0.1.45 published |
| GitHubStarredPanel | `CollectionsPageContent.tsx:66` | ✅ **DONE** | Optional→Required slice | Made githubStarred required |
| GitHubProjectsPanel | `CollectionsPageContent.tsx:67` | ✅ **DONE** | Optional→Required slice | Made githubProjects required |

**Changes Made:**
1. Imported `GitHubStarredSlice` and `GitHubProjectsSlice` types from alexandria-panels
2. Updated `WorldsPageContextType` to use imported types instead of inline types
3. Made `githubStarred` and `githubProjects` required (not optional)
4. Updated context construction to remove `| undefined` casts

---

### GitHub Panels (`@industry-theme/github-panels`)

#### ✅ Completed (1/1)

| Panel | File | Status | Issues Found | Notes |
|-------|------|--------|--------------|-------|
| GitHubSearchPanel | `CollectionsPageContent.tsx:68` | ✅ **DONE** | None | No type issues |

**Changes Made:**
1. Changed from dynamic import to static import
2. No context type changes needed (panel uses generic context)

---

### Principal View Panels (`@industry-theme/principal-view-panels`)

#### ✅ Completed (1/1)

| Panel | File | Status | Issues Found | Notes |
|-------|------|--------|--------------|-------|
| PrincipalViewPanel (panels[0]) | `CollectionsPageContent.tsx:71` | ✅ **DONE** | None | Imported full panels array |

**Changes Made:**
1. Changed from dynamic import to static import of panels array
2. Assigned `panels[0].component` directly

---

### File City Panel (`@industry-theme/file-city-panel`)

#### ✅ Completed (1/1)

| Panel | File | Status | Issues Found | Notes |
|-------|------|--------|--------------|-------|
| FileCityPanel (panels[0]) | `CollectionsPageContent.tsx:72` | ✅ **DONE** | None | Imported full panels array |

**Changes Made:**
1. Changed from dynamic import to static import of panels array
2. Assigned `panels[0].component` directly

---

### Repository Composition Panels (`@industry-theme/repository-composition-panels`)

#### ✅ Completed (2/2)

| Panel | File | Status | Issues Found | Notes |
|-------|------|--------|--------------|-------|
| PackageCompositionPanel | `CollectionsPageContent.tsx:73` | ✅ **DONE** | None | Direct component import |
| CollectionMapPanel | `CollectionsPageContent.tsx:74` | ✅ **DONE** | None | Direct component import |

**Changes Made:**
1. Changed from dynamic imports to static imports
2. No context type changes needed

---

## Migration Workflow

### Step-by-Step Process

1. **Check Panel Package**
   ```bash
   # Verify panel exports typed context interfaces
   grep -r "export.*Context" node_modules/@industry-theme/PACKAGE/dist/
   ```

2. **Update Panel Package (if needed)**
   - Export context interface from panel types file
   - Export slice types from panel types file
   - Bump version and publish

3. **Update WorldsPageProvider**
   ```typescript
   // Import slice types from panel package
   import type {
     PanelSlice,
     PanelContext
   } from '@industry-theme/panel-package';

   // Update WorldsPageContextType to use imported types
   export interface WorldsPageContextType {
     panelSlice: DataSlice<PanelSlice>; // Required if panel requires it
     // OR
     panelSlice?: DataSlice<PanelSlice>; // Optional if panel doesn't require it
   }

   // Update context construction
   const context: PanelContextValue<WorldsPageContextType> = useMemo(
     () => ({
       // ...
       panelSlice: slicesRef.current.get('panelSlice') as DataSlice<PanelSlice>,
     }),
     [...]
   );
   ```

4. **Update CollectionsPageContent**
   ```typescript
   // Replace:
   const PanelLoader = dynamic(
     () => import('@industry-theme/package').then((mod) => mod.Panel),
     { ssr: false }
   ) as React.ComponentType<any>;

   // With:
   import { Panel } from '@industry-theme/package';
   const PanelLoader = Panel;
   ```

5. **Build and Fix Type Errors**
   ```bash
   npm run build
   # Fix any type mismatches reported by TypeScript
   ```

6. **Test**
   - Verify panel renders correctly
   - Check that all context/actions/events work
   - Ensure no runtime errors

7. **Commit**
   ```bash
   git add -A
   git commit -m "feat: migrate PanelName to static import for type safety"
   git push
   ```

---

## Type Issues Discovered

### From UserCollectionsPanel Migration (v0.1.45)

1. **Missing Type Export**
   - `WorkspaceSlice` wasn't exported from alexandria-panels
   - **Fix**: Added export in index.tsx

2. **Type Mismatch: Collections Data**
   - Provider used inline object types instead of `Collection[]`
   - **Fix**: Imported `UserCollectionsSlice` type from panel package

3. **Optional vs Required**
   - Provider marked slice as optional, panel required it
   - **Fix**: Made `userCollections: DataSlice<UserCollectionsSlice>` (no `?`)

---

## Expected Issues for Other Panels

Based on UserCollectionsPanel migration, expect similar issues:

### GitHubStarredPanel
- **Slice types**: `GitHubStarredSlice` may need export
- **Context match**: Provider has `githubStarred?: DataSlice<{ starred, isAuthenticated }>`
- **Action**: Import proper type from alexandria-panels

### GitHubProjectsPanel
- **Slice types**: `GitHubProjectsSlice` may need export
- **Context match**: Provider has inline type for projects
- **Action**: Import proper type from alexandria-panels

### PackageCompositionPanel
- **Slice types**: Provider uses `PackagesSliceData` from codebase-composition
- **Context match**: Check if panel expects same type
- **Action**: Align types between provider and panel

### CollectionMapPanel
- **Slice types**: Multiple slices (quality, packages, fileTree)
- **Context match**: Verify all required slices are non-optional
- **Action**: May need to import CollectionMapPanelContext type

---

## Testing Checklist

For each migrated panel:

- [ ] Panel renders without errors
- [ ] Context data is received correctly
- [ ] Actions work as expected
- [ ] Events are emitted/received
- [ ] Loading states display correctly
- [ ] Error states handled properly
- [ ] No console errors or warnings
- [ ] Type errors caught at build time (test by commenting out required slices)

---

## Progress Tracking

**Overall Progress**: 8/8 panels migrated (100%) ✅

- ✅ UserCollectionsPanel
- ✅ GitHubStarredPanel
- ✅ GitHubProjectsPanel
- ✅ GitHubSearchPanel
- ✅ PrincipalViewPanel
- ✅ FileCityPanel
- ✅ PackageCompositionPanel
- ✅ CollectionMapPanel

**Target**: ✅ COMPLETED - All 8 panels migrated to static imports

**Actual Effort**: ~30 minutes total (2026-02-18)

### Bundle Size Impact

**Before** (dynamic imports):
- `/worlds` route: ~238 KB

**After** (static imports):
- `/worlds` route: ~2.11 MB

**Analysis**:
- Bundle size increase: ~1.87 MB
- This is acceptable for a developer IDE where users expect the full application
- Next.js still does page-level code splitting, so other routes remain unaffected
- Trade-off: Larger initial load for complete compile-time type safety

---

## Notes

- After all panels migrated, remove `next/dynamic` imports from CollectionsPageContent.tsx
- Update EditorLayout.tsx similarly if it uses dynamic panel imports
- Consider creating a lint rule to prevent future dynamic panel imports
- Document the static import pattern for new panels

---

## Related Files

- `/src/app/worlds/CollectionsPageContent.tsx` - Panel imports
- `/src/contexts/WorldsPageProvider.tsx` - Context provider with type definitions
- `/Users/griever/Developer/web-ade/industry-themed-alexandria-entry-panels/src/index.tsx` - Alexandria panels exports

---

## Migration Summary

### ✅ MIGRATION COMPLETE (2026-02-18)

All 8 panels in the worlds page have been successfully migrated from dynamic imports to static imports.

### Key Achievements

1. **Full Type Safety**: All panels now have compile-time type checking between provider context and panel requirements
2. **Type Issues Caught**: Found and fixed 3 type mismatches during migration that would have been runtime errors
3. **Simplified Code**: Removed all `as React.ComponentType<any>` casts and dynamic import complexity
4. **Better DX**: Developers now get autocomplete and type hints for all panel props

### Changes Summary

**Files Modified:**
- `src/app/worlds/CollectionsPageContent.tsx`: Converted all 8 dynamic imports to static
- `src/contexts/WorldsPageProvider.tsx`:
  - Imported slice types from alexandria-panels
  - Made `githubStarred` and `githubProjects` required (not optional)
  - Updated type casts to use imported types

**Packages Updated:**
- `@industry-theme/alexandria-panels@^0.1.45`: Added WorkspaceSlice export

### Type Safety Verification

To verify type safety is working, we tested by making required slices optional:
- ✅ TypeScript correctly caught the mismatch at build time
- ✅ Build fails if context doesn't match panel requirements
- ✅ No runtime type checking needed - caught at compile time

### Next Steps

- ✅ All worlds page panels migrated
- 🔄 Consider migrating EditorLayout.tsx panels similarly
- 🔄 Create lint rule to prevent future dynamic panel imports
- 🔄 Document static import pattern for new panels

---

Last Updated: 2026-02-18 (COMPLETED)
