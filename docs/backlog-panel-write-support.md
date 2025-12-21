# Backlog Panel Write Support

## Overview

The `@industry-theme/backlogmd-kanban-panel` v1.0.1 added an "Initialize Backlog.md" button that creates a new backlog project. This requires file system write access that web-ade doesn't currently provide to panels.

## Current State

### What the panel expects

The kanban panel checks for write capability via:

```typescript
const canInitialize = Boolean(
  context.adapters?.fileSystem?.writeFile &&
  context.adapters?.fileSystem?.createDir &&
  context.currentScope.repository?.path
);
```

### What web-ade provides

1. **`context.adapters`** - Only has `readFile` and `matchesPath`, no `fileSystem` object
2. **`actions.writeFile`** - Exists in `EditorLayout.tsx` enhanced actions, but:
   - Only works for **existing files** (requires SHA from prior read)
   - Not exposed via `context.adapters.fileSystem`

## Required Changes

### 1. Add `fileSystem` adapter to PanelContext

In `src/contexts/PanelContext.tsx`, the adapters need to include a `fileSystem` object:

```typescript
adapters: {
  fileSystem: {
    exists: async (path: string) => boolean,
    readFile: async (path: string) => string,
    writeFile: async (path: string, content: string) => void,  // NEW
    createDir: async (path: string) => void,                   // NEW
    // ... other methods
  },
  // existing adapters...
}
```

### 2. Implement GitHub file creation API

The current `writeFile` in `EditorLayout.tsx` uses the pending changes system which requires a SHA. For **new files**, we need to use GitHub's "create or update file" API:

```typescript
// PUT /repos/{owner}/{repo}/contents/{path}
await octokit.repos.createOrUpdateFileContents({
  owner,
  repo,
  path: 'backlog/config.yml',
  message: 'Initialize Backlog.md project',
  content: Buffer.from(configContent).toString('base64'),
  branch: 'main', // or current branch
});
```

### 3. Handle directory creation

GitHub doesn't track empty directories. `createDir` can be a no-op since the directory is implicitly created when `writeFile` creates a file inside it.

```typescript
createDir: async (path: string) => {
  // No-op for GitHub - directories are created implicitly with files
  console.log('[GitHub] Directory will be created with first file:', path);
}
```

### 4. Add API route for file creation

Create or update `src/app/api/github/repo/[owner]/[name]/route.ts` to handle file creation:

```typescript
// Handle action=createFile
if (action === 'createFile') {
  const { path, content, message } = await request.json();

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo: name,
    path,
    message: message || `Create ${path}`,
    content: Buffer.from(content).toString('base64'),
    branch: branch || 'main',
  });

  return NextResponse.json({ success: true });
}
```

### 5. Wire up to panel context

In `EditorLayout.tsx` or `PanelContext.tsx`:

```typescript
const fileSystemAdapter = useMemo(() => ({
  exists: async (path: string) => {
    // Use existing readFile logic, return false on 404
  },
  readFile: async (path: string) => {
    // Existing implementation
  },
  writeFile: async (path: string, content: string) => {
    // Check if file exists (has SHA) -> use pending changes
    // If new file -> use createFile API
    const metadata = getFileMetadata(path);
    if (metadata) {
      addPendingChangeFromWrite(path, content);
    } else {
      await createFileOnGitHub(path, content);
    }
  },
  createDir: async () => {
    // No-op for GitHub
  },
  join: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
}), [/* deps */]);

// Add to context
adapters: {
  ...existingAdapters,
  fileSystem: fileSystemAdapter,
}
```

## Testing

1. Open a GitHub repo that is NOT a Backlog.md project
2. Navigate to the Kanban panel
3. Should see "Initialize Backlog.md" button
4. Click it -> should create `backlog/config.yml` on GitHub
5. Refresh -> should show empty kanban board

## Files to modify

- `src/contexts/PanelContext.tsx` - Add fileSystem to adapters type and value
- `src/components/EditorLayout.tsx` - Implement fileSystem adapter with write support
- `src/app/api/github/repo/[owner]/[name]/route.ts` - Add createFile action
- `src/lib/server/GitHubFileSystemAdapter.ts` - Optional: add async write methods

## Related

- Panel: `@industry-theme/backlogmd-kanban-panel@1.0.1`
- Core: `@backlog-md/core@0.1.1` (has `initProject()` method)
- GitHub API: [Create or update file contents](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
