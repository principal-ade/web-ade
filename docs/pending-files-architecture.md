# Pending Files Architecture

## Problem Statement

When files are created/modified via panels (e.g., Backlog.md initialization, task creation), they exist as "pending changes" that haven't been committed to GitHub yet. Currently:

1. **FileTree is updated optimistically** - New file paths are added to the fileTree state
2. **File reads fail** - When panels try to read the file content, they call the GitHub API which returns 404
3. **Content is lost** - The pending file content exists in `PendingChangesContext` but `readFile` doesn't check there first

### Current Flow (Broken)

```
Panel writes file
    │
    ▼
writeFile() called
    │
    ├─► PendingChangesContext stores content
    │
    └─► fileTree updated (file path added)
           │
           ▼
    Panel sees file in fileTree
           │
           ▼
    Panel calls readFile()
           │
           ▼
    GitHub API returns 404 ❌
```

## Proposed Solution

### Architecture: Pending-Aware File Reading

The `readFile` function should check `PendingChangesContext` first before falling back to the GitHub API.

```
Panel writes file
    │
    ▼
writeFile() called
    │
    ├─► PendingChangesContext stores { path, content, isNewFile }
    │
    └─► fileTree updated (file path added)
           │
           ▼
    Panel sees file in fileTree
           │
           ▼
    Panel calls readFile()
           │
           ▼
    Check PendingChangesContext first
           │
           ├─► Found? Return pending content ✓
           │
           └─► Not found? Call GitHub API
```

### Implementation Options

#### Option A: Pass Pending Changes to PanelContext

**Pros:**
- Clean separation - PanelContext has access to pending changes
- readFile can check pending changes internally

**Cons:**
- PanelContext is defined outside PendingChangesProvider
- Would need to restructure provider hierarchy or use events

#### Option B: Event-Based Content Resolution

**Pros:**
- Works with current provider structure
- Already using events for writes

**Cons:**
- More complex event flow
- Potential for race conditions

#### Option C: Global Pending Content Store (Recommended)

Create a simple in-memory store that both contexts can access:

```typescript
// pendingContentStore.ts
const pendingContent = new Map<string, string>();

export function setPendingContent(path: string, content: string) {
  pendingContent.set(normalizePath(path), content);
}

export function getPendingContent(path: string): string | undefined {
  return pendingContent.get(normalizePath(path));
}

export function clearPendingContent(path: string) {
  pendingContent.delete(normalizePath(path));
}

export function clearAllPendingContent() {
  pendingContent.clear();
}
```

**Pros:**
- Simple, no provider restructuring needed
- Both PanelContext and PendingChangesContext can access it
- Easy to clear after commit

**Cons:**
- Global state (but scoped and simple)
- Need to ensure cleanup after commit

### Recommended Implementation

#### 1. Create Pending Content Store

```typescript
// src/lib/pendingContentStore.ts

type PendingFile = {
  content: string;
  isNewFile: boolean;
  modifiedAt: Date;
};

const pendingFiles = new Map<string, PendingFile>();

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

export const pendingContentStore = {
  set(path: string, content: string, isNewFile: boolean = false) {
    pendingFiles.set(normalizePath(path), {
      content,
      isNewFile,
      modifiedAt: new Date(),
    });
  },

  get(path: string): PendingFile | undefined {
    return pendingFiles.get(normalizePath(path));
  },

  has(path: string): boolean {
    return pendingFiles.has(normalizePath(path));
  },

  delete(path: string) {
    pendingFiles.delete(normalizePath(path));
  },

  clear() {
    pendingFiles.clear();
  },

  getAll(): Map<string, PendingFile> {
    return new Map(pendingFiles);
  },
};
```

#### 2. Update writeFile in PanelContext

```typescript
const writeFileImpl = async (path: string, content: string): Promise<void> => {
  const cleanPath = cleanFilePath(path);

  // Store content in pending store for later reads
  pendingContentStore.set(cleanPath, content, true);

  // ... existing write logic ...

  // Update fileTree
  addFileToTree(cleanPath);
};
```

#### 3. Update readFile in PanelContext

```typescript
const readFileFromGitHub = useCallback(async (path: string): Promise<string> => {
  const cleanPath = cleanFilePath(path);

  // Check pending content store first
  const pending = pendingContentStore.get(cleanPath);
  if (pending) {
    console.log('[PanelContext] Returning pending content for:', cleanPath);
    return pending.content;
  }

  // Fall back to GitHub API
  // ... existing API logic ...
}, [/* deps */]);
```

#### 4. Update PendingChangesContext

When adding a pending change, also update the store:

```typescript
const addPendingChange = (change: PendingFileChange) => {
  // Update local state
  setPendingChanges(prev => new Map(prev).set(change.path, change));

  // Update global store for cross-context access
  pendingContentStore.set(change.path, change.newContent, change.isNewFile);
};
```

#### 5. Clear Store After Commit

```typescript
const commitChanges = async () => {
  // ... commit logic ...

  // Clear pending content store
  pendingContentStore.clear();

  // Refresh fileTree from GitHub to get committed state
  await refreshFileTree();
};
```

### File Locations

```
src/
├── lib/
│   └── pendingContentStore.ts      # New: Global pending content store
├── contexts/
│   ├── PanelContext.tsx            # Update: Use store in readFile/writeFile
│   └── PendingChangesContext.tsx   # Update: Sync with store
└── components/
    └── EditorLayout.tsx            # Update: Clear store after commit
```

### Edge Cases to Handle

1. **File modified multiple times** - Store should always have latest content
2. **File deleted then recreated** - Handle in store appropriately
3. **Commit fails** - Keep pending content in store
4. **Page refresh** - Pending content is lost (acceptable - matches current behavior)
5. **Multiple tabs** - Each tab has its own store (acceptable)

### Testing Checklist

- [ ] Initialize Backlog.md project, board appears immediately
- [ ] Create task via modal, task appears in kanban
- [ ] Create milestone via modal, milestone appears in list
- [ ] Edit existing task, changes visible immediately
- [ ] Commit changes, data persists after refresh
- [ ] Cancel/discard changes, files revert to committed state

### Migration Path

1. Create `pendingContentStore.ts`
2. Update `PanelContext.tsx` to use store in readFile
3. Update `writeFileImpl` to store content
4. Update `PendingChangesContext` to sync with store
5. Update commit flow to clear store
6. Test all scenarios
7. Remove old workarounds if any

## Alternative: Content Cache in PendingChangesContext

If we want to avoid a global store, we could:

1. Move `PendingChangesProvider` to wrap `PanelContextProvider`
2. Pass pending changes down to PanelContext
3. Check pending changes in readFile

This is cleaner architecturally but requires restructuring the provider hierarchy.

## Decision

**Recommended: Option C (Global Pending Content Store)**

Reasons:
- Minimal changes to existing provider structure
- Simple and focused solution
- Easy to understand and debug
- Can be refactored later if needed
