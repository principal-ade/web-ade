# Local Filesystem Access

This document describes the local filesystem access feature that allows web-ade to read and write files directly from a local folder instead of using the GitHub API.

## Overview

The local filesystem feature uses the browser's [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) to provide direct access to local directories. This is useful for:

- Viewing private repositories you have cloned locally
- Testing changes without committing to GitHub
- Working offline with local files
- Faster file access (no API latency)

**Browser Support:** Chrome and Edge only. Firefox and Safari do not support the File System Access API.

## User Flow

1. Navigate to any repository page (`/owner/repo`)
2. Click the "Open Local Folder" button in the header
3. Browser shows a directory picker - select your local clone
4. The app reads `.git/config` to detect the GitHub remote
5. **If the folder matches the current repo:** Attaches the local folder and switches to local mode
6. **If the folder is for a different repo:** Prompts to switch to that repo's page
7. **If no git remote is found:** Prompts to attach the folder anyway

Once attached, the URL stays the same (`/owner/repo`) but all file operations use the local filesystem instead of the GitHub API.

## Features in Local Mode

| Feature | GitHub Mode | Local Mode |
|---------|-------------|------------|
| File tree | Fetched from GitHub API | Built from local filesystem |
| Read files | GitHub API (base64) | Direct file read |
| Write files | Stored as pending changes | Written directly to disk |
| Commit button | Shows pending changes count | Hidden (writes are instant) |
| README | Fetched from GitHub | Read from local README.md |

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/client/handleStorage.ts` | IndexedDB utilities for persisting folder handles |
| `src/lib/client/gitConfigParser.ts` | Parses `.git/config` to extract GitHub remote URL |
| `src/lib/client/LocalFileSystemAdapter.ts` | File operations via File System Access API |
| `src/contexts/LocalFileSystemContext.tsx` | React context for local filesystem state |
| `src/components/LocalFolderButton.tsx` | UI button with folder picker and dialogs |
| `src/types/file-system-access.d.ts` | TypeScript declarations for File System Access API |

### LocalFileSystemAdapter

The adapter provides these methods:

```typescript
class LocalFileSystemAdapter {
  // Read/write operations
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
  buildFileTree(): Promise<string[]>

  // Path utilities
  join(...paths: string[]): string
  dirname(path: string): string
  basename(path: string, ext?: string): string
  extname(path: string): string
}
```

### Persistence

Folder handles are stored in IndexedDB keyed by repository ID (`owner/repo`). On subsequent visits:

1. The app checks IndexedDB for a stored handle
2. If found, requests permission (File System Access API requires re-permission each session)
3. If permission granted, automatically enters local mode

```typescript
// Store handle
await storeRepoHandle('owner/repo', directoryHandle);

// Retrieve handle
const handle = await getRepoHandle('owner/repo');
if (handle && await verifyPermission(handle)) {
  // Enter local mode
}

// Remove handle
await removeRepoHandle('owner/repo');
```

### Git Config Parsing

The `gitConfigParser.ts` utility extracts the GitHub remote from `.git/config`:

```typescript
// Supported URL formats:
// - git@github.com:owner/repo.git (SSH)
// - https://github.com/owner/repo.git (HTTPS)
// - https://github.com/owner/repo (HTTPS without .git)

const info = await getGitRemoteFromHandle(directoryHandle);
// Returns: { owner: 'owner', repo: 'repo', fullName: 'owner/repo' }
```

## Integration Points

### EditorLayout

The `EditorLayout` component checks for local mode at two points:

1. **Access check bypass:** If a local folder is attached, the GitHub access check is skipped
2. **Header integration:** Shows `LocalFolderButton` and hides commit UI in local mode

### PanelContext

The `PanelContext` is modified to route file operations through the local adapter:

- `readFile` / `openFile` actions check `isLocalMode` first
- `fetchFileTree` builds tree from local filesystem
- `fetchReadme` reads from local README.md
- `readFileFromGitHub` helper uses local adapter when available

### File Tree Building

In local mode, the file tree is built by walking the directory:

```typescript
const filePaths = await localAdapter.buildFileTree();
const builder = new PathsFileTreeBuilder();
const tree = builder.build({
  files: filePaths,
  rootPath: `/${owner}/${repo}`,
});
```

Default ignored directories: `node_modules`, `.git`, `.next`, `.turbo`, `dist`, `build`, `.cache`, `coverage`, etc.

## Limitations

1. **Browser support:** Chrome/Edge only
2. **Permission re-request:** Each browser session requires re-granting permission
3. **No file watching:** External changes aren't detected automatically (refresh required)
4. **No git operations:** This is filesystem access only, not git integration
5. **GitHub-specific features disabled:** Commit history, issues, PRs, etc. still use GitHub API

## Security Considerations

- The File System Access API requires explicit user consent via a picker dialog
- Handles are stored in IndexedDB but require re-permission each session
- The app can only access the selected directory and its contents
- No network access to local files - all operations are client-side
