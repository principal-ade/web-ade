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

### Alexandria Panels (`@industry-theme/alexandria-panels`)

#### ✅ Completed (1/3)

| Panel | File | Status | Issues Found | Notes |
|-------|------|--------|--------------|-------|
| UserCollectionsPanel | `CollectionsPageContent.tsx:60-61` | ✅ **DONE** | Fixed 3 type mismatches | v0.1.45 published |

#### 🔄 In Progress (0/3)

| Panel | File | Status | Estimated Effort | Priority |
|-------|------|--------|------------------|----------|
| - | - | - | - | - |

#### 📋 Todo (2/3)

| Panel | File | Current Line | Package Version | Priority |
|-------|------|--------------|-----------------|----------|
| GitHubStarredPanel | `CollectionsPageContent.tsx:65-69` | `@industry-theme/alexandria-panels@^0.1.45` | High |
| GitHubProjectsPanel | `CollectionsPageContent.tsx:71-75` | `@industry-theme/alexandria-panels@^0.1.45` | High |

**Required Actions:**
1. Import types from alexandria-panels (already exported in v0.1.44+)
2. Update WorldsPageProvider context types
3. Make required slices non-optional
4. Build and fix any type errors
5. Test runtime behavior

---

### GitHub Panels (`@industry-theme/github-panels`)

#### 📋 Todo (1/1)

| Panel | File | Current Line | Package Version | Priority |
|-------|------|--------------|-----------------|----------|
| GitHubSearchPanel | `CollectionsPageContent.tsx:77-81` | TBD | Medium |

**Required Actions:**
1. Check if github-panels exports typed context interfaces
2. If not, create types in github-panels package first
3. Update WorldsPageProvider to import and use types
4. Migrate to static import

---

### Principal View Panels (`@industry-theme/principal-view-panels`)

#### 📋 Todo (1/1)

| Panel | File | Current Line | Package Version | Priority |
|-------|------|--------------|-----------------|----------|
| PrincipalViewPanel (panels[0]) | `CollectionsPageContent.tsx:84-87` | TBD | Medium |

**Required Actions:**
1. Identify which panel is panels[0] (likely StoryboardListPanel or similar)
2. Check for typed exports in principal-view-panels
3. Update provider types
4. Migrate to static import

---

### File City Panel (`@industry-theme/file-city-panel`)

#### 📋 Todo (1/1)

| Panel | File | Current Line | Package Version | Priority |
|-------|------|--------------|-----------------|----------|
| FileCityPanel (panels[0]) | `CollectionsPageContent.tsx:89-92` | TBD | Medium |

**Required Actions:**
1. Check if file-city-panel exports typed context
2. Update WorldsPageProvider with fileCityColorModes types
3. Migrate to static import

---

### Repository Composition Panels (`@industry-theme/repository-composition-panels`)

#### 📋 Todo (2/2)

| Panel | File | Current Line | Package Version | Priority |
|-------|------|--------------|-----------------|----------|
| PackageCompositionPanel | `CollectionsPageContent.tsx:94-98` | TBD | Medium |
| CollectionMapPanel | `CollectionsPageContent.tsx:100-104` | TBD | High |

**Required Actions:**
1. Check for typed exports in repository-composition-panels
2. Update WorldsPageProvider with packages, quality types
3. Migrate to static imports

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

**Overall Progress**: 1/8 panels migrated (12.5%)

- ✅ UserCollectionsPanel
- ⏳ GitHubStarredPanel
- ⏳ GitHubProjectsPanel
- ⏳ GitHubSearchPanel
- ⏳ PrincipalViewPanel
- ⏳ FileCityPanel
- ⏳ PackageCompositionPanel
- ⏳ CollectionMapPanel

**Target**: Migrate all 8 panels to static imports

**Estimated Effort**: 1-2 hours (based on 15-20 minutes per panel after first one)

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

Last Updated: 2026-02-18
