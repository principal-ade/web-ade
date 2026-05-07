# Local Filesystem Access

This document describes the local filesystem access feature that lets web-ade read and write the active file directly from a local folder instead of going through the GitHub API.

## Overview

The local filesystem feature uses the browser's [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) to provide direct access to a local directory chosen by the user. Useful for:

- Viewing private repositories you have cloned locally
- Editing files without committing through GitHub
- Working offline on the active file
- Faster read/write of the active file (no API latency)

**Browser Support:** Chrome and Edge only. Firefox and Safari do not support the File System Access API.

> **Scope note:** Local mode is **not** a full filesystem replacement. Only the active file's read/write goes through the local adapter. The file tree, README, packages list, and other repository-wide data still come from the GitHub API. See "What is NOT local-aware" below.

## User Flow

1. Navigate to a repository page (`/owner/repo`).
2. If the GitHub access check fails (no auth, private repo, missing permissions), the **Access Notice** screen appears.
3. On that screen there's a `GitHub | Local` segmented toggle. Click **Local**.
4. The browser shows a directory picker — select your local clone.
5. The app reads `.git/config` to detect the GitHub remote.
6. **If the folder matches the current repo:** attaches the folder and switches to local mode.
7. **If the folder is for a different repo:** prompts to switch to that repo's page.
8. **If no git remote is found:** prompts to attach the folder anyway.

Once attached, the URL stays the same (`/owner/repo`) but local mode bypasses the GitHub access check, so the editor opens.

## Features in Local Mode

| Feature | GitHub Mode | Local Mode |
|---------|-------------|------------|
| Active file read | GitHub API (base64) | Direct file read via adapter |
| Active file write | Stored as pending change | Written directly to disk |
| Commit UI / pending count | Visible | Hidden (writes are instant) |
| GitHub activity feed | Visible | Hidden |
| Access check | Required (`accessStatus === 'granted'`) | Bypassed |
| File tree | GitHub API | **Still GitHub API** |
| README auto-load | GitHub API | **Still GitHub API** |
| Packages, commits, issues, PRs | GitHub API | **Still GitHub API** |

## What is NOT local-aware

The following all hit the GitHub API even when a local folder is attached:

- Repository file tree (`RepositoryPageProvider.fetchFileTree` → `trpc.github.getTree`)
- README auto-load (`trpc.github.readFile`)
- Packages summary, commit history, issues, PRs, and every other repo-wide data fetch

If you open a file from the tree in local mode, the **tree entry** comes from GitHub but the **file content read** goes through the local adapter, so a file that exists on disk but not in the GitHub tree won't be reachable from the tree UI.

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/client/handleStorage.ts` | IndexedDB utilities for persisting folder handles |
| `src/lib/client/gitConfigParser.ts` | Parses `.git/config` to extract the GitHub remote |
| `src/lib/client/LocalFileSystemAdapter.ts` | File operations via File System Access API |
| `src/contexts/LocalFileSystemContext.tsx` | React context + `useLocalFileSystem()` hook |
| `src/components/LocalFolderButton.tsx` | `GitHub \| Local` toggle, picker, confirmation dialogs |
| `src/components/AccessNotice.tsx` | Hosts the `LocalFolderButton` (line ~161) |
| `src/types/file-system-access.d.ts` | TypeScript declarations for the File System Access API |

### LocalFileSystemAdapter

```typescript
class LocalFileSystemAdapter {
  // Read/write
  readFileAsync(path: string): Promise<string>
  writeFileAsync(path: string, content: string): Promise<void>
  readBinaryFileAsync(path: string): Promise<Uint8Array>
  writeBinaryFileAsync(path: string, content: Uint8Array): Promise<void>

  // Directory operations
  readDirAsync(path: string): Promise<string[]>
  createDirAsync(path: string): Promise<void>
  deleteFileAsync(path: string): Promise<void>
  deleteDirAsync(path: string): Promise<void>

  // Utilities
  existsAsync(path: string): Promise<boolean>
  isDirectoryAsync(path: string): Promise<boolean>
  buildFileTree(): Promise<string[]>   // not currently called from app code
  getRepositoryId(): string
  canWrite(): boolean

  // Path utilities
  join(...paths: string[]): string
  dirname(path: string): string
  basename(path: string, ext?: string): string
  extname(path: string): string
}
```

`buildFileTree()` exists on the adapter but no caller in `src/` invokes it today — the editor uses the GitHub tree even in local mode.

### Persistence

Folder handles are stored in IndexedDB keyed by repository ID (`owner/repo`):

- DB: `web-ade-local-fs`
- Object store: `repo-handles`
- Stored value: `{ repoId, handle, folderName, attachedAt }`

On page load (`src/app/[owner]/[repo]/page.tsx`), `checkAndRestoreHandle(repoId)` looks up the saved handle and calls `verifyPermission(handle)` — the File System Access API requires re-permission each browser session, so the user gets a permission prompt before local mode resumes.

```typescript
await storeRepoHandle('owner/repo', directoryHandle);
const stored = await getRepoHandle('owner/repo');
if (stored && await verifyPermission(stored.handle)) {
  // Enter local mode
}
await removeRepoHandle('owner/repo');
```

### Git Config Parsing

```typescript
// Supported URL formats:
// - git@github.com:owner/repo.git (SSH)
// - https://github.com/owner/repo.git (HTTPS)
// - https://github.com/owner/repo  (HTTPS without .git)
const info = await getGitRemoteFromHandle(directoryHandle);
// → { owner, repo, fullName } or null
```

## Integration Points

### EditorLayout

Two real integration points (`src/components/EditorLayout.tsx`):

1. **Access check bypass** (line ~2292): `if (accessStatus !== 'granted' && !isLocalMode)` — when a local folder is attached, the GitHub access check is skipped and the editor renders.
2. **Active file read/write** in `enhancedActions`:
   - `readFile` (line ~1336): if `isLocalMode && localAdapter`, calls `localAdapter.readFileAsync(cleanPath)` instead of fetching from GitHub.
   - `writeFile` (line ~1396): if `isLocalMode && localAdapter`, calls `localAdapter.writeFileAsync(cleanPath, content)` directly to disk; otherwise the change is staged as a pending change for commit.
3. **UI gating**:
   - `pendingChangesCount={isLocalMode ? 0 : effectivePendingChangesCount}` — hides the commit count
   - `{repositoryInfo && !isLocalMode && ...}` — hides the GitHub activity feed in local mode

### Provider wiring

`LocalFileSystemProvider` (mounted in `src/components/Providers.tsx`) exposes `useLocalFileSystem()`. The repo page (`src/app/[owner]/[repo]/page.tsx`) calls `checkAndRestoreHandle(repoId)` on mount to auto-restore an attached folder. `EditorLayout` reads `const { adapter: localAdapter } = useLocalFileSystem()` and derives `isLocalMode = !!localAdapter`.

### Default ignored directories

When `buildFileTree()` is invoked on the adapter (today only by ad-hoc callers), these are skipped:

```
node_modules, .git, .next, .turbo, dist, build,
.cache, coverage, .nyc_output, __pycache__,
.pytest_cache, target, vendor
```

## Limitations

1. **Browser support:** Chrome/Edge only.
2. **Permission re-request:** each browser session requires re-granting permission (File System Access API rule).
3. **No file watching:** external changes aren't detected automatically — refresh required.
4. **No git operations:** filesystem access only, not git integration.
5. **GitHub data still flows through the API:** file tree, README, packages, commit history, issues, PRs, etc. are not local-aware.
6. **Tree/disk drift:** files that exist on disk but not in the GitHub tree won't appear in the tree UI.

## Security Considerations

- The File System Access API requires explicit user consent via a picker dialog
- Handles persist in IndexedDB but require re-permission each session via `verifyPermission()`
- The app can only access the directory the user picks
- All operations are client-side — no network access to local files
