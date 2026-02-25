# Collection Map Reload Issue Investigation

**Date:** 2024-02-24
**Status:** Investigated, awaiting fix
**Affected Pages:** `/worlds`, `/worlds/[username]`, `/[owner]`

## Problem Statement

When a user adds a region to the collection map, the entire map reloads/resets instead of incrementally updating. This creates a jarring user experience where:
- The map visually resets
- Any pan/zoom state is lost
- Repository positions animate back to their locations

## Data Flow Analysis

### Current Architecture

```
UserCollectionsContext (source of truth)
    ↓
WorldsPageProvider (subscribes via useUserCollections())
    ↓
useEffect rebuilds selectedCollectionView (lines 817-923)
    ↓
CollectionMapPanel receives new repositories array
    ↓
useMemo recomputes nodes (line 529-624)
    ↓
useEffect re-runs layout (line 676-820)
    ↓
Full map re-render
```

### The Trigger Chain

1. **User Action:** Click "Add Region" in CollectionMapPanel
2. **Action Handler:** `onRegionCreated` in WorldsPageProvider (lines 1101-1134)
3. **State Update:** Calls `userCollections.updateCollection()`
4. **Context Update:** `UserCollectionsContext` calls `setCollections(newCollections)`
5. **Re-render Cascade:** WorldsPageProvider re-renders because `useUserCollections()` returns new reference
6. **Effect Trigger:** Large useEffect runs because `userCollections` is in dependency array
7. **Data Rebuild:** Entire `selectedCollectionView` rebuilt, including new `repositories` array
8. **Panel Update:** CollectionMapPanel receives new data, re-initializes

## Root Cause

### The Problematic useEffect

Location: `src/contexts/WorldsPageProvider.tsx` lines 817-923

```typescript
useEffect(() => {
  // ... rebuilds entire selectedCollectionView
  const repositories: AlexandriaEntryWithMetrics[] = selectedMemberships.map(membership => {
    // ... creates new repository objects
  });

  setSelectedCollectionView({
    // ... new slice with new repositories array
  });
}, [
  userCollections,  // ← PROBLEM: entire object, not granular
  collectionId,
  workspace,
  collectionRepoDetails,
  collectionRepoPackages,
  // ... many more dependencies
]);
```

### Why This Is Problematic

1. **Object Reference Comparison:** `userCollections` is an entire object. When any property changes (including metadata like regions), React sees it as a new reference.

2. **Over-broad Dependencies:** The effect depends on `userCollections` when it only needs specific parts of it.

3. **Full Rebuild on Metadata Change:** Even a small metadata change (adding a region) triggers a complete rebuild of the repositories array.

4. **No Separation of Concerns:** Collection data, repository data, and layout metadata are all intertwined.

## Affected Operations

All of these operations trigger the full reload:
- Creating a region
- Updating a region (name, color, bounds)
- Deleting a region
- Assigning a repository to a region
- Updating a repository's position
- Switching layout modes
- Batch layout initialization

## Potential Solutions

### Solution 1: Granular Selectors (Low effort)

Change the dependency from the entire `userCollections` object to specific properties:

```typescript
const { collections } = useUserCollections();
const selectedCollection = collections.find(c => c.id === collectionId);

useEffect(() => {
  // ...
}, [
  selectedCollection?.members,  // Only react to member changes
  // NOT the entire userCollections object
]);
```

**Pros:** Minimal changes, quick win
**Cons:** Still coupled, may need multiple selectors

### Solution 2: Separate Region/Layout Context (Medium effort)

Create a dedicated context for layout metadata:

```typescript
// New context: CollectionLayoutContext
interface CollectionLayoutState {
  regions: Map<string, CustomRegion[]>;
  repositoryPositions: Map<string, Position>;
  layoutMode: LayoutMode;
}
```

**Pros:** Clean separation, layout updates don't affect collection state
**Cons:** Need to sync with collection on load, more contexts to manage

### Solution 3: Optimistic UI with Local State (Medium effort)

Keep region state local in the panel, sync to backend asynchronously:

```typescript
// In CollectionMapPanel
const [localRegions, setLocalRegions] = useState<CustomRegion[]>([]);

// Update locally first (instant)
const handleRegionCreated = (region) => {
  setLocalRegions(prev => [...prev, region]);
  // Then sync to backend
  actions.onRegionCreated(region);
};
```

**Pros:** Instant UI updates, no full re-render
**Cons:** Complexity in syncing local and remote state

### Solution 4: Memoize Repository Array (Low effort)

Prevent unnecessary repository array recreation:

```typescript
const repositories = useMemo(() => {
  return selectedMemberships.map(membership => ({
    // ... build repository
  }));
}, [selectedMemberships, collectionRepoDetails]); // NOT userCollections
```

**Pros:** Prevents cascade when only metadata changes
**Cons:** Need to identify correct dependencies

### Solution 5: Use React Query or Similar (Higher effort)

Replace manual state management with React Query:

```typescript
const { data: collection } = useQuery({
  queryKey: ['collection', collectionId],
  queryFn: () => fetchCollection(collectionId),
});

const mutation = useMutation({
  mutationFn: updateRegion,
  onMutate: async (newRegion) => {
    // Optimistic update - no full re-render
    queryClient.setQueryData(['collection', collectionId], old => ({
      ...old,
      regions: [...old.regions, newRegion]
    }));
  },
});
```

**Pros:** Built-in optimistic updates, caching, proper invalidation
**Cons:** Larger refactor, new dependency

## Recommended Approach

Start with **Solution 1 + Solution 4** (granular selectors + memoization) as they're low effort and address the immediate issue. Then consider **Solution 2** (separate context) for a cleaner long-term architecture.

## Files to Modify

1. `src/contexts/WorldsPageProvider.tsx` - Main fix location
2. `src/contexts/UserCollectionsContext.tsx` - May need granular selectors
3. `src/contexts/SharedCollectionsProvider.tsx` - Same pattern applies
4. `src/contexts/OwnerPageProvider.tsx` - Same pattern applies

## Testing the Fix

1. Open `/worlds` page
2. Select a collection with repositories
3. Add a region
4. **Expected:** Region appears without map resetting
5. **Verify:** Pan/zoom state preserved, no visual flash

## Related Code References

- `WorldsPageProvider.tsx:817-923` - The problematic useEffect
- `WorldsPageProvider.tsx:1101-1134` - onRegionCreated handler
- `UserCollectionsContext.tsx:89` - setCollections call
- `CollectionMapPanel.tsx:529-624` - Node computation useMemo
- `CollectionMapPanel.tsx:676-820` - Layout useEffect
