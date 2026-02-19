# Static Imports Full Migration Plan

## Overview

This document tracks the migration of ALL pages and components in web-ade from dynamic imports to static imports for complete compile-time type safety.

**Last Updated**: 2026-02-18

---

## Migration Status Summary

| Page/Component | Panels Count | Status | Priority |
|----------------|--------------|--------|----------|
| ✅ Worlds Page (Collections) | 8 | **COMPLETED** | High |
| 🟡 Owner Page | 5/6 | **MOSTLY DONE** | Medium |
| 📋 EditorLayout | 26 | Todo | **CRITICAL** |
| 📋 Activity Page | 2 | Todo | Low |
| 📋 Worlds/Username Page | 1 | Todo | Low |

**Overall Progress**: 13/42 panels migrated (31.0%)

---

## ✅ COMPLETED: Worlds Page (Collections)

**File**: `src/app/worlds/CollectionsPageContent.tsx`

**Status**: ✅ 100% Complete (2026-02-18)

**Panels Migrated** (8):
- UserCollectionsPanel
- GitHubStarredPanel
- GitHubProjectsPanel
- GitHubSearchPanel
- PrincipalViewPanel
- FileCityPanel
- PackageCompositionPanel
- CollectionMapPanel

**Results**:
- Bundle size: 238 KB → 2.11 MB (+1.87 MB)
- Found and fixed 5 type mismatches
- Full compile-time type safety achieved

**Documentation**: See `STATIC_IMPORTS_MIGRATION.md` for detailed migration notes.

---

## 📋 TODO: EditorLayout Component

**File**: `src/components/EditorLayout.tsx`

**Status**: ⏳ Not Started

**Priority**: **CRITICAL** (Most panels, most used component)

**Panels to Migrate** (26):

### Markdown & Documentation Panels (2)
1. MarkdownPanelLoader → `@industry-theme/markdown-panels`
2. AlexandriaDocsPanelLoader → `@industry-theme/alexandria-docs-panel`

### Visualization Panels (1)
3. FileCityPanelLoader → `@industry-theme/file-city-panel`

### Backlog.md Panels (2)
4. KanbanPanelLoader → `@industry-theme/backlogmd-kanban-panel`
5. TaskDetailPanelLoader → `@industry-theme/backlogmd-kanban-panel`

### Principal View / OTEL Panels (6)
6. PrincipalViewPanelLoader → `@industry-theme/principal-view-panels`
7. StoryboardListPanelLoader → `@industry-theme/principal-view-panels`
8. CanvasEditorPanelLoader → `@industry-theme/principal-view-panels`
9. WorkflowScenariosPanelLoader → `@industry-theme/principal-view-panels`
10. TraceListPanelLoader → `@industry-theme/principal-view-panels`
11. TraceDetailsPanelLoader → `@industry-theme/principal-view-panels`

### Code Quality Panels (2)
12. QualityHexagonPanelLoader → `@principal-ade/code-quality-panels`
13. LensDataDebugPanelLoader → `@principal-ade/code-quality-panels`

### Agent Panels (3)
14. EventBusPanelLoader → `@industry-theme/agent-driven-ui-panels`
15. AgentToolsPanelLoader → `@industry-theme/agent-driven-ui-panels`
16. SkillsListPanelLoader → `@industry-theme/agent-panels`
17. SkillDetailPanelLoader → `@industry-theme/agent-panels`

### Repository Composition Panels (2)
18. GitChangesPanelLoader → `@industry-theme/repository-composition-panels`
19. PackageCompositionPanelLoader → `@industry-theme/repository-composition-panels`

### Git Panels (2)
20. GitCommitHistoryPanelLoader → `@industry-theme/git-panels`
21. GitCommitDetailPanelLoader → `@industry-theme/git-panels`

### GitHub Panels (1)
22. GitHubMessagesPanelLoader → `@industry-theme/github-panels`

### Theme Editor Panel (1)
23. ThemeEditorPanelLoader → `@industry-theme/theme-editor-panel`

### File Editing Panels (3)
24. FileEditorPanelLoader → `@industry-theme/file-editing-panels`
25. GitDiffPanelLoader → `@industry-theme/file-editing-panels`
26. MDXEditorPanelLoader → `@industry-theme/file-editing-panels`

### Estimated Impact
- **Bundle size increase**: ~3-5 MB (acceptable for dev IDE)
- **Type safety**: Will catch context mismatches for repository panel usage
- **Effort**: 2-3 hours (most complex component)

### Migration Strategy
1. Start with panels that have existing typed exports
2. Update EditorPanelProvider context types as needed
3. Migrate in groups by package for efficiency
4. Test thoroughly as this is the most critical component

---

## 🟡 MOSTLY COMPLETE: Owner Page

**File**: `src/app/[owner]/OwnerPageContent.tsx`

**Status**: 🟡 5/6 panels migrated (2026-02-18)

**Priority**: Medium

### ✅ Migrated Panels (5):

| Panel | Package | Status | Issues Found |
|-------|---------|--------|--------------|
| OwnerRepositoriesPanel | `@industry-theme/github-panels` | ✅ **DONE** | Fixed null→undefined for selectedRepository |
| PrincipalViewPanel | `@industry-theme/principal-view-panels` | ✅ **DONE** | None |
| CodeQualityPanel | `@principal-ade/code-quality-panels` | ✅ **DONE** | None |
| FileCityPanel | `@industry-theme/file-city-panel` | ✅ **DONE** | None |
| PackageCompositionPanel | `@industry-theme/repository-composition-panels` | ✅ **DONE** | None |

### ⏸️ Deferred (1):

| Panel | Package | Reason |
|-------|---------|--------|
| CollectionMapPanelContent | `@industry-theme/repository-composition-panels` | Needs proper integration - missing required RegionCallbacks, incorrect data types |

**CollectionMapPanelContent Issues**:
- Requires `AlexandriaEntryWithMetrics[]` with `ValidatedRepositoryPath` (branded type)
- Needs complete `RegionCallbacks` implementation (6 callbacks)
- Current mock data doesn't match expected types
- Kept as dynamic import - will migrate in separate PR with proper implementation

### Type Safety Issues Found

1. **OwnerRepositoriesPanel**: `selectedRepository` prop type mismatch
   - Provider passed: `string | null`
   - Panel expected: `string | undefined`
   - **Fix**: Changed `{previewedRepo}` to `{previewedRepo ?? undefined}`

2. **CollectionMapPanelContent**: Multiple integration issues
   - Missing `path: ValidatedRepositoryPath` in repository objects
   - Missing `hasViews`, `viewCount`, `views` fields
   - Missing `regionCallbacks` prop with 6 required callbacks
   - **Decision**: Defer to later (needs proper implementation)

### Results
- **Bundle size**: Minimal increase (panels already loaded elsewhere)
- **Type safety**: 5/6 panels now have compile-time verification
- **Bugs caught**: 1 type mismatch, 1 integration issue discovered
- **Effort**: 45 minutes

---

## 📋 TODO: Activity Page

**File**: `src/app/activity/page.tsx`

**Status**: ⏳ Not Started

**Priority**: Low

**Panels to Migrate** (2):

1. **FeedCodeCityPanel** → `@industry-theme/file-city-panel` (panels[1])
   - Context: Activity feed data
   - Type exports: Check if FeedCodeCityPanel has typed context
   - Note: Uses panels[1], not panels[0]

2. **GitHubMessagesPanel** → `@industry-theme/github-panels` (panels[6])
   - Context: GitHub messages/notifications
   - Type exports: Check availability
   - Note: Uses panels[6]

### Required Actions
1. Identify the provider/context for activity page
2. Check if FeedCodeCityPanel and GitHubMessagesPanel export types
3. May need to add type exports to those packages
4. Update context type definitions
5. Migrate to static imports

### Estimated Impact
- **Bundle size increase**: ~500 KB - 1 MB
- **Type safety**: Will ensure activity feed provides correct data
- **Effort**: 20-30 minutes

---

## 📋 TODO: Worlds/Username Page

**File**: `src/app/worlds/[username]/page.tsx`

**Status**: ⏳ Not Started

**Priority**: Low

**Panels to Migrate** (1):

1. **WorkspaceCollectionPanel** → `@industry-theme/alexandria-panels`
   - Context: Workspace data, repositories
   - Type exports: Already available from alexandria-panels v0.1.45
   - Should be straightforward migration

### Required Actions
1. Import WorkspaceCollectionPanel from alexandria-panels
2. Import context types (WorkspaceCollectionPanelContext)
3. Update page provider context types
4. Migrate to static import

### Estimated Impact
- **Bundle size increase**: ~200-300 KB
- **Type safety**: Will ensure workspace context is correct
- **Effort**: 15-20 minutes

---

## Migration Workflow (Standard Process)

### Step 1: Analyze Current State
```bash
# Find all dynamic imports in the file
grep -A 5 "dynamic(" path/to/file.tsx

# Identify packages and panel names
```

### Step 2: Check Type Exports
```bash
# Check if panel package exports types
grep -r "export.*Context" node_modules/@package/dist/

# Check for slice type exports
grep -r "export.*Slice" node_modules/@package/dist/
```

### Step 3: Update Panel Package (if needed)
If types aren't exported:
1. Add exports to panel package's `src/index.tsx`
2. Build and publish new version
3. Update web-ade to use new version

### Step 4: Update Provider/Context
```typescript
// Import slice types
import type {
  PanelSlice,
  PanelContext,
} from '@package/panel';

// Update context type
export interface PageContextType {
  panelSlice: DataSlice<PanelSlice>; // Required if panel needs it
  // or
  panelSlice?: DataSlice<PanelSlice>; // Optional if panel doesn't require it
}

// Update context construction
const context = useMemo(
  () => ({
    // ...
    panelSlice: slicesRef.current.get('panelSlice') as DataSlice<PanelSlice>,
  }),
  [...]
);
```

### Step 5: Update Component
```typescript
// Before:
const PanelLoader = dynamic(
  () => import('@package').then((mod) => mod.Panel),
  { ssr: false }
) as React.ComponentType<any>;

// After:
import { Panel } from '@package';
const PanelLoader = Panel;
```

### Step 6: Build and Test
```bash
npm run build
# Fix any type errors
# Test in browser
```

### Step 7: Commit
```bash
git add -A
git commit -m "feat: migrate [ComponentName] panels to static imports

Migrated X panels from dynamic to static imports:
- PanelA
- PanelB

Changes:
- Import types from panel packages
- Update context types
- Remove dynamic imports

Bundle size impact: +X MB"
git push
```

---

## Type Issues Tracking

### Known Issues from Previous Migrations

1. **Missing Type Exports**
   - Some panel packages don't export context/slice types
   - **Solution**: Add exports and publish new version

2. **Optional vs Required Slices**
   - Provider marks slices as optional, panel requires them
   - **Solution**: Analyze panel code to determine if required, update provider

3. **Inline Type Definitions**
   - Provider uses inline types instead of importing from panel package
   - **Solution**: Import types from panel package for consistency

4. **Array Index Access**
   - Some panels use `panels[N]` instead of named exports
   - **Solution**: Import full panels array, access by index

### Expected Issues for Remaining Migrations

#### EditorLayout
- Many panels, complex provider
- May need to update multiple context types
- Some panels may not have type exports yet
- **Risk**: High complexity, high value

#### Owner Page
- GitHub-specific context
- May need GitHub API types
- **Risk**: Medium

#### Activity Page
- Uses non-standard panel indices (panels[1], panels[6])
- May need custom types
- **Risk**: Low

#### Worlds/Username Page
- Should be straightforward (alexandria-panels already typed)
- **Risk**: Very low

---

## Testing Checklist

For each page/component migrated:

### Build-Time Tests
- [ ] `npm run build` succeeds without errors
- [ ] No TypeScript errors
- [ ] No ESLint warnings related to types
- [ ] Comment out required slices to verify type errors appear

### Runtime Tests
- [ ] Page loads without errors
- [ ] All panels render correctly
- [ ] Panel context data is received
- [ ] Panel actions work
- [ ] Panel events emit/receive correctly
- [ ] Loading states work
- [ ] Error states work
- [ ] No console errors or warnings

### Bundle Analysis
- [ ] Check bundle size impact
- [ ] Verify no duplicate dependencies
- [ ] Confirm page-level code splitting still works

---

## Progress Timeline

| Date | Component | Panels | Status |
|------|-----------|--------|--------|
| 2026-02-18 | Worlds Page | 8/8 | ✅ Complete |
| 2026-02-18 | Owner Page | 5/6 | 🟡 Mostly Complete (1 deferred) |
| TBD | EditorLayout | 26 | ⏳ Planned |
| TBD | Activity Page | 2 | ⏳ Planned |
| TBD | Worlds/Username | 1 | ⏳ Planned |

---

## Bundle Size Tracking

| Component | Before | After | Increase | % Increase |
|-----------|--------|-------|----------|------------|
| Worlds Page | 238 KB | 2.11 MB | +1.87 MB | +786% |
| EditorLayout | TBD | TBD | TBD | TBD |
| Owner Page | TBD | TBD | TBD | TBD |
| Activity Page | TBD | TBD | TBD | TBD |
| Worlds/Username | TBD | TBD | TBD | TBD |

**Total Expected Increase**: ~6-8 MB (estimated)

**Analysis**: Acceptable for a developer IDE where users expect the full application loaded. Other pages remain code-split.

---

## Recommendations

### Immediate Next Steps
1. ✅ **Migrate EditorLayout** - Most critical, most panels, most used
2. Migrate Owner Page - Medium complexity
3. Migrate Activity Page - Low complexity
4. Migrate Worlds/Username Page - Very simple

### Long-Term Improvements
- Create lint rule to prevent future dynamic panel imports
- Document static import pattern in contributing guide
- Consider creating typed panel loader utility
- Add type safety tests to CI/CD

### Alternative Approaches

If bundle size becomes a concern:
1. **Route-based splitting**: Keep page-level code splitting
2. **Lazy initialization**: Load panels on first use (still typed)
3. **Selective migration**: Only migrate panels that need type safety

**Current Recommendation**: Proceed with full migration - bundle size is acceptable for dev IDE.

---

## Related Documents

- `STATIC_IMPORTS_MIGRATION.md` - Worlds page migration details
- Panel package documentation in respective repos
- `@principal-ade/panel-framework-core` - Type definitions

---

## Notes

- All migrations should maintain backward compatibility
- No runtime behavior changes expected
- Only build-time type checking improvements
- Test thoroughly in development before deploying

---

Last Updated: 2026-02-18
Status: 8/41 panels migrated (19.5%)
Next Target: EditorLayout (26 panels)
