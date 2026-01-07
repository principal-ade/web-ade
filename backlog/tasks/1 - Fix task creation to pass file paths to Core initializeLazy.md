---
status: To Do
priority: high
labels: [bug, core-integration]
createdDate: 2026-01-06
---

# Fix task creation to pass file paths to Core initializeLazy

## Description

The task creation API endpoint currently calls `core.initializeLazy([])` with an empty array, which prevents Core from building a proper task index. This causes two critical bugs:

1. **Duplicate Task IDs**: All created tasks get ID "1" because Core can't see existing tasks
2. **Poor Performance**: Empty initialization defeats the purpose of lazy loading

## Root Cause

**File:** `src/app/api/backlog/tasks/create/route.ts`
**Line:** 99

```typescript
// CURRENT (BROKEN):
await core.initializeLazy([]);  // ❌ Empty array!

// Core needs file paths to build taskIndex for ID generation
```

When `initializeLazy([])` receives an empty array:
- `this.taskIndex` remains empty
- `createTask()` can't determine existing IDs
- Every call generates ID "1" (since it sees no existing tasks)
- Later calls overwrite earlier tasks with duplicate IDs

## Impact

- **Severity:** High
- **Affected Feature:** GitHub issue → Backlog task creation
- **User Impact:** Users lose tasks due to duplicate IDs, only the last created task shows in kanban panel
- **Data Loss Risk:** Yes - tasks are overwritten by duplicate IDs

## Solution

### Option 1: Use Full Initialization (Recommended for GitHub context)

```typescript
// Replace line 99 with:
await core.initialize();
```

**Pros:**
- Simple, one-line change
- Guarantees all existing tasks are loaded
- Works reliably with GitHubBacklogAdapter

**Cons:**
- Loads all task files (but GitHub adapter caches, so impact is minimal)

### Option 2: Get File Paths from Adapter

```typescript
// More complex but maintains lazy loading benefits
const allFiles = await getAllFilesFromGitHub(fs, owner, repo, branch);
const relativePaths = allFiles.map(f => f.path);
await core.initializeLazy(relativePaths);
```

**Pros:**
- Maintains lazy loading optimization
- Only reads file metadata, not content

**Cons:**
- Requires additional GitHub API call to list repository files
- More complex implementation

## Acceptance Criteria

- [ ] Core is initialized with existing task file paths
- [ ] New tasks get unique, sequential IDs (not all "1")
- [ ] Multiple tasks created in sequence have different IDs
- [ ] Task creation performance is acceptable (< 2 seconds)
- [ ] Unit test added to verify ID generation with existing tasks

## Implementation Notes

The Core library has been updated (v0.3.5+) to:
1. Use `taskIndex` instead of `tasks` for ID generation (fixes the root cause)
2. Validate status values against configured statuses
3. Update taskIndex when creating tasks in lazy mode

However, web-ade still needs to pass file paths to enable proper initialization.

## References

- Related issue: Duplicate task IDs in Backlog-Core repository
- Core library fix: `Core.ts:1103` now checks `taskIndex` for ID generation
- GitHubBacklogAdapter: `src/lib/server/GitHubBacklogAdapter.ts`

## Testing

1. Create a task from a GitHub issue
2. Create another task from a different issue
3. Verify both tasks appear in kanban panel
4. Verify tasks have sequential IDs (1, 2) not duplicate IDs (1, 1)
