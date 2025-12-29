# ZenFS Integration Plan

## Overview

This document outlines the integration of [ZenFS](https://github.com/zen-fs/core) as a virtual filesystem layer to solve the pending files problem and provide a unified file operations API.

## Problem Recap

When panels write files that haven't been committed to GitHub:

1. FileTree updates optimistically (file appears in tree)
2. Panel tries to read the file → GitHub API returns 404
3. Content exists in `PendingChangesContext` but `readFile` doesn't check there

**Current workaround**: Scattered checks and event-based coordination between contexts.

## Solution: ZenFS with CopyOnWrite Backend

ZenFS provides an **overlay filesystem** pattern where:
- Reads check a writable layer first, then fall back to a readable layer
- Writes always go to the writable layer
- The layers can be synced/committed independently

```
┌─────────────────────────────────────────┐
│              Panel Code                  │
│         (reads/writes files)            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│            ZenFS VFS Layer              │
│    Unified API: read, write, stat       │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────────────┐
│ Writable     │  │ Readable Layer       │
│ Layer        │  │ (GitHub/Local)       │
│ (In-Memory)  │  │                      │
│              │  │ - GitHubBackend      │
│ Pending      │  │ - LocalFSBackend     │
│ changes live │  │                      │
│ here         │  │ Falls back here      │
└──────────────┘  └──────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│           Commit Flow                    │
│  Flush writable layer → GitHub API       │
│  Clear writable layer on success         │
└──────────────────────────────────────────┘
```

## Package Selection

```bash
npm install @zenfs/core
```

We only need `@zenfs/core` which includes:
- `InMemory` backend (for writable/pending layer)
- `CopyOnWrite` backend (for overlay behavior)
- Full Node.js `fs` API emulation

We'll create a custom `GitHubBackend` that implements ZenFS's backend interface to read from GitHub.

## Architecture

### New Files

```
src/
├── lib/
│   └── vfs/
│       ├── index.ts                 # Main exports
│       ├── VirtualFileSystem.ts     # VFS class wrapping ZenFS
│       ├── GitHubBackend.ts         # Custom ZenFS backend for GitHub API
│       └── types.ts                 # Shared types
├── contexts/
│   └── VFSContext.tsx               # React context for VFS
```

### Modified Files

```
src/
├── contexts/
│   ├── PanelContext.tsx             # Use VFS instead of direct GitHub calls
│   └── PendingChangesContext.tsx    # Simplified - VFS handles content
├── components/
│   └── EditorLayout.tsx             # Initialize VFS, handle commits
```

### Consumer Compatibility

**The VFS is a transparent layer** - FileTree consumers (panels, components) are NOT affected:

| Consumer | Path Format | Before Migration | After Migration |
|----------|-------------|------------------|-----------------|
| FileTree | `['src/file.ts', 'Backlog.md']` | Same | Same |
| Panel readFile | `readFile('src/file.ts')` | GitHub API | VFS → GitHub API |
| Panel writeFile | `writeFile('path', content)` | Event + Pending | VFS (pending layer) |
| File explorer | Iterates `fileTree.allFiles` | Same paths | Same paths |

**Key points:**
- Paths remain unprefixed (`src/file.ts`, not `/working/src/file.ts`)
- FileTree structure unchanged
- Panel adapter signatures unchanged
- VFS is internal plumbing, not a consumer-facing change

**What changes internally:**
```typescript
// Before: PanelContext directly calls GitHub
const content = await fetchFromGitHub(owner, repo, path);

// After: PanelContext calls VFS, which handles the routing
const content = await vfs.readFile(path);  // Same path format
```

## Implementation

### 1. Types (`src/lib/vfs/types.ts`)

```typescript
export interface VFSConfig {
  mode: 'github' | 'local';
  github?: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
  };
  localHandle?: FileSystemDirectoryHandle;
}

export interface PendingFile {
  path: string;
  content: string;
  isNewFile: boolean;
  originalSha?: string;
  modifiedAt: Date;
}

export interface VFSStats {
  pendingCount: number;
  pendingPaths: string[];
  mountedAt: Date;
}
```

### 2. GitHub Backend (`src/lib/vfs/GitHubBackend.ts`)

```typescript
import { Backend, InMemory, type StoreFS } from '@zenfs/core';

interface GitHubBackendConfig {
  owner: string;
  repo: string;
  branch: string;
  getToken: () => string | null;
}

/**
 * Read-only ZenFS backend that fetches files from GitHub API.
 * Used as the "readable" layer in CopyOnWrite configuration.
 */
export class GitHubBackend extends Backend {
  private config: GitHubBackendConfig;
  private cache: Map<string, { content: string; sha: string }> = new Map();

  constructor(config: GitHubBackendConfig) {
    super();
    this.config = config;
  }

  get name() {
    return 'GitHubBackend';
  }

  // ZenFS Backend interface implementation
  async ready(): Promise<void> {
    // Could pre-fetch file tree here if needed
  }

  async stat(path: string): Promise<Stats> {
    const normalPath = this.normalizePath(path);

    // Check cache first
    if (this.cache.has(normalPath)) {
      const cached = this.cache.get(normalPath)!;
      return new Stats({
        mode: 0o644,
        size: cached.content.length,
        // ... other stat fields
      });
    }

    // Fetch from GitHub to check existence
    try {
      await this.fetchFile(normalPath);
      const cached = this.cache.get(normalPath)!;
      return new Stats({
        mode: 0o644,
        size: cached.content.length,
      });
    } catch (e) {
      throw new ErrnoError(Errno.ENOENT);
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const normalPath = this.normalizePath(path);

    // Check cache
    if (this.cache.has(normalPath)) {
      return new TextEncoder().encode(this.cache.get(normalPath)!.content);
    }

    // Fetch from GitHub
    const result = await this.fetchFile(normalPath);
    return new TextEncoder().encode(result.content);
  }

  // Read-only: writes throw
  async writeFile(): Promise<void> {
    throw new ErrnoError(Errno.EROFS, 'GitHubBackend is read-only');
  }

  async unlink(): Promise<void> {
    throw new ErrnoError(Errno.EROFS, 'GitHubBackend is read-only');
  }

  // Helper methods
  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private async fetchFile(path: string): Promise<{ content: string; sha: string }> {
    const token = this.config.getToken();
    if (!token) throw new Error('No GitHub token available');

    const { owner, repo, branch } = this.config;
    const url = `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(path)}&ref=${branch}`;

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new ErrnoError(Errno.ENOENT);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const content = atob(data.content); // Base64 decode
    const sha = data.sha;

    // Cache the result
    this.cache.set(path, { content, sha });

    return { content, sha };
  }

  /**
   * Get the SHA for a file (needed for commits)
   */
  getSha(path: string): string | undefined {
    return this.cache.get(this.normalizePath(path))?.sha;
  }

  /**
   * Clear cache (after commit or branch switch)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
```

### 3. VirtualFileSystem Class (`src/lib/vfs/VirtualFileSystem.ts`)

```typescript
import { configure, fs, InMemory, CopyOnWrite } from '@zenfs/core';
import { GitHubBackend } from './GitHubBackend';
import type { VFSConfig, PendingFile, VFSStats } from './types';

export class VirtualFileSystem {
  private config: VFSConfig;
  private backends: Map<string, GitHubBackend> = new Map();
  private pendingLayer: Map<string, PendingFile> = new Map();
  private initialized = false;
  private mountedAt: Date | null = null;
  private primaryBranch: string | null = null;

  constructor(config: VFSConfig) {
    this.config = config;
  }

  /**
   * Factory for creating GitHubBackend instances
   * Enables future multi-branch support
   */
  private createGitHubBackend(branch: string): GitHubBackend {
    if (!this.config.github) {
      throw new Error('GitHub config required');
    }
    return new GitHubBackend({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      branch,
      getToken: () => this.config.github?.token ?? null,
    });
  }

  /**
   * Get the primary branch backend (for SHA lookups, etc.)
   */
  private getPrimaryBackend(): GitHubBackend | undefined {
    if (!this.primaryBranch) return undefined;
    return this.backends.get(this.primaryBranch);
  }

  /**
   * Initialize the filesystem with ZenFS
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.mode === 'github' && this.config.github) {
      // Create and store the primary branch backend
      const branch = this.config.github.branch;
      const backend = this.createGitHubBackend(branch);
      this.backends.set(branch, backend);
      this.primaryBranch = branch;

      await configure({
        mounts: {
          '/': {
            backend: CopyOnWrite,
            readable: backend,
            writable: InMemory,
          },
        },
      });
    } else {
      // Local mode - just use InMemory for now
      // Could integrate with File System Access API later
      await configure({
        mounts: {
          '/': InMemory,
        },
      });
    }

    this.initialized = true;
    this.mountedAt = new Date();
  }

  /**
   * Read a file - ZenFS handles the overlay logic
   */
  async readFile(path: string): Promise<string> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    try {
      const content = await fs.promises.readFile(`/${normalPath}`, 'utf8');
      return content;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        throw new Error(`File not found: ${path}`);
      }
      throw e;
    }
  }

  /**
   * Write a file - goes to writable layer automatically
   */
  async writeFile(path: string, content: string): Promise<void> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    // Check if file exists in readable layer (for SHA tracking)
    let originalSha: string | undefined;
    let isNewFile = true;

    try {
      await fs.promises.stat(`/${normalPath}`);
      isNewFile = false;
      originalSha = this.getPrimaryBackend()?.getSha(normalPath);
    } catch {
      // File doesn't exist - it's new
    }

    // Ensure parent directories exist
    const dir = normalPath.split('/').slice(0, -1).join('/');
    if (dir) {
      await fs.promises.mkdir(`/${dir}`, { recursive: true });
    }

    // Write to filesystem (goes to writable layer)
    await fs.promises.writeFile(`/${normalPath}`, content, 'utf8');

    // Track in pending files
    this.pendingLayer.set(normalPath, {
      path: normalPath,
      content,
      isNewFile,
      originalSha,
      modifiedAt: new Date(),
    });
  }

  /**
   * Check if a file exists
   */
  async exists(path: string): Promise<boolean> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    try {
      await fs.promises.stat(`/${normalPath}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file
   */
  async unlink(path: string): Promise<void> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);
    await fs.promises.unlink(`/${normalPath}`);

    // Track deletion as pending change
    this.pendingLayer.set(normalPath, {
      path: normalPath,
      content: '', // Empty content signals deletion
      isNewFile: false,
      originalSha: this.getPrimaryBackend()?.getSha(normalPath),
      modifiedAt: new Date(),
    });
  }

  /**
   * List directory contents
   */
  async readdir(path: string): Promise<string[]> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path) || '.';
    return fs.promises.readdir(`/${normalPath}`);
  }

  /**
   * Get all pending changes for commit
   */
  getPendingChanges(): PendingFile[] {
    return Array.from(this.pendingLayer.values());
  }

  /**
   * Check if there are pending changes
   */
  hasPendingChanges(): boolean {
    return this.pendingLayer.size > 0;
  }

  /**
   * Get pending change for a specific path
   */
  getPendingChange(path: string): PendingFile | undefined {
    return this.pendingLayer.get(this.normalizePath(path));
  }

  /**
   * Clear specific pending changes (after commit)
   */
  clearPendingChanges(paths: string[]): void {
    for (const path of paths) {
      this.pendingLayer.delete(this.normalizePath(path));
    }
  }

  /**
   * Clear all pending changes (discard all)
   */
  clearAllPendingChanges(): void {
    this.pendingLayer.clear();
    // Also need to reset ZenFS writable layer
    // This might require re-initialization or a custom clear method
  }

  /**
   * Get VFS statistics
   */
  getStats(): VFSStats {
    return {
      pendingCount: this.pendingLayer.size,
      pendingPaths: Array.from(this.pendingLayer.keys()),
      mountedAt: this.mountedAt ?? new Date(),
    };
  }

  /**
   * Refresh from remote (clear caches, re-read)
   */
  async refresh(): Promise<void> {
    // Clear cache on all mounted backends
    for (const backend of this.backends.values()) {
      backend.clearCache();
    }
  }

  // Private helpers
  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('VirtualFileSystem not initialized. Call initialize() first.');
    }
  }
}
```

### 4. React Context (`src/contexts/VFSContext.tsx`)

```typescript
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { VirtualFileSystem } from '@/lib/vfs/VirtualFileSystem';
import type { VFSConfig, PendingFile, VFSStats } from '@/lib/vfs/types';

interface VFSContextValue {
  // Core operations
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;

  // Pending changes
  getPendingChanges: () => PendingFile[];
  hasPendingChanges: () => boolean;
  clearPendingChanges: (paths: string[]) => void;
  clearAllPendingChanges: () => void;

  // State
  isInitialized: boolean;
  stats: VFSStats | null;

  // Lifecycle
  initialize: (config: VFSConfig) => Promise<void>;
  refresh: () => Promise<void>;
}

const VFSContext = createContext<VFSContextValue | null>(null);

export function VFSProvider({ children }: { children: React.ReactNode }) {
  const [vfs, setVfs] = useState<VirtualFileSystem | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [stats, setStats] = useState<VFSStats | null>(null);

  const initialize = useCallback(async (config: VFSConfig) => {
    const instance = new VirtualFileSystem(config);
    await instance.initialize();
    setVfs(instance);
    setIsInitialized(true);
    setStats(instance.getStats());
  }, []);

  const readFile = useCallback(async (path: string) => {
    if (!vfs) throw new Error('VFS not initialized');
    return vfs.readFile(path);
  }, [vfs]);

  const writeFile = useCallback(async (path: string, content: string) => {
    if (!vfs) throw new Error('VFS not initialized');
    await vfs.writeFile(path, content);
    setStats(vfs.getStats());
  }, [vfs]);

  const exists = useCallback(async (path: string) => {
    if (!vfs) throw new Error('VFS not initialized');
    return vfs.exists(path);
  }, [vfs]);

  const unlink = useCallback(async (path: string) => {
    if (!vfs) throw new Error('VFS not initialized');
    await vfs.unlink(path);
    setStats(vfs.getStats());
  }, [vfs]);

  const readdir = useCallback(async (path: string) => {
    if (!vfs) throw new Error('VFS not initialized');
    return vfs.readdir(path);
  }, [vfs]);

  const getPendingChanges = useCallback(() => {
    return vfs?.getPendingChanges() ?? [];
  }, [vfs]);

  const hasPendingChanges = useCallback(() => {
    return vfs?.hasPendingChanges() ?? false;
  }, [vfs]);

  const clearPendingChanges = useCallback((paths: string[]) => {
    vfs?.clearPendingChanges(paths);
    setStats(vfs?.getStats() ?? null);
  }, [vfs]);

  const clearAllPendingChanges = useCallback(() => {
    vfs?.clearAllPendingChanges();
    setStats(vfs?.getStats() ?? null);
  }, [vfs]);

  const refresh = useCallback(async () => {
    await vfs?.refresh();
  }, [vfs]);

  return (
    <VFSContext.Provider
      value={{
        readFile,
        writeFile,
        exists,
        unlink,
        readdir,
        getPendingChanges,
        hasPendingChanges,
        clearPendingChanges,
        clearAllPendingChanges,
        isInitialized,
        stats,
        initialize,
        refresh,
      }}
    >
      {children}
    </VFSContext.Provider>
  );
}

export function useVFS() {
  const context = useContext(VFSContext);
  if (!context) {
    throw new Error('useVFS must be used within a VFSProvider');
  }
  return context;
}
```

### 5. Integration with PanelContext

Update `PanelContext.tsx` to use VFS for file operations:

```typescript
// In PanelContext.tsx

import { useVFS } from '@/contexts/VFSContext';

// Inside the provider component:
const { readFile: vfsReadFile, writeFile: vfsWriteFile, exists: vfsExists } = useVFS();

// Replace readFileFromGitHub with:
const readFileImpl = useCallback(async (path: string): Promise<string> => {
  const cleanPath = cleanFilePath(path);

  // VFS handles the overlay logic - checks pending first, then GitHub
  return vfsReadFile(cleanPath);
}, [vfsReadFile]);

// Replace writeFile implementation with:
const writeFileImpl = useCallback(async (path: string, content: string): Promise<void> => {
  const cleanPath = cleanFilePath(path);

  // VFS handles storing in writable layer
  await vfsWriteFile(cleanPath, content);

  // Update fileTree optimistically
  addFileToTree(cleanPath);
}, [vfsWriteFile, addFileToTree]);
```

### 6. Integration with EditorLayout

Update `EditorLayout.tsx` commit flow:

```typescript
// In EditorLayout.tsx

import { useVFS } from '@/contexts/VFSContext';

const { getPendingChanges, clearPendingChanges, initialize: initializeVFS } = useVFS();

// Initialize VFS when repository changes
useEffect(() => {
  if (repository && repositoryName) {
    initializeVFS({
      mode: 'github',
      github: {
        owner: repositoryName.owner,
        repo: repositoryName.repo,
        branch: repository.default_branch,
        token: getGitHubToken(), // Your token retrieval method
      },
    });
  }
}, [repository, repositoryName]);

// Update handleCommit to use VFS pending changes
const handleCommit = async (message: string, selectedPaths: string[]) => {
  const pendingChanges = getPendingChanges();

  const filesToCommit = pendingChanges
    .filter(p => selectedPaths.includes(p.path))
    .map(p => ({
      path: p.path,
      content: p.content,
      sha: p.originalSha,
    }));

  const response = await fetch(`/api/github/repo/${owner}/${repo}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: filesToCommit, message }),
  });

  if (response.ok) {
    clearPendingChanges(selectedPaths);
    // Refresh file tree...
  }
};
```

## Migration Plan

### Phase 1: Add VFS Layer (Non-Breaking)

1. Install `@zenfs/core`
2. Create `src/lib/vfs/` directory with all new files
3. Create `VFSContext.tsx`
4. Add `VFSProvider` to app providers (wrap existing providers)

### Phase 2: Integrate with PanelContext

1. Update `PanelContext` to optionally use VFS
2. Add feature flag: `useVFS` (default: false)
3. Test with flag enabled
4. Gradually roll out

### Phase 3: Simplify PendingChangesContext

1. Remove content storage from `PendingChangesContext`
2. Keep only UI state (selected files, modal state)
3. Delegate content tracking to VFS

### Phase 4: Cleanup

1. Remove old direct GitHub read logic
2. Remove `pendingContentStore` if it was created
3. Update tests
4. Remove feature flag, make VFS default

## Testing Checklist

- [ ] Initialize new project via Backlog.md panel
- [ ] Board appears immediately after initialization
- [ ] Create task via modal - task appears in kanban
- [ ] Edit existing file - changes visible immediately
- [ ] Read file that was just written (no 404)
- [ ] Commit changes - persists after refresh
- [ ] Discard changes - reverts to committed state
- [ ] Multiple files written before commit
- [ ] Concurrent reads/writes from different panels
- [ ] Branch switching clears pending state correctly
- [ ] Page refresh loses pending changes (expected)

## Design Constraints (Do Not Violate)

These constraints ensure future extensibility, particularly for **branch comparison** and **multi-repo** scenarios.

### 1. GitHubBackend Must Be Branch-Parameterized

```typescript
// ✅ CORRECT - branch is a parameter
new GitHubBackend({ owner, repo, branch: 'main' })
new GitHubBackend({ owner, repo, branch: 'feature-x' })

// ❌ WRONG - hardcoded branch
class GitHubBackend {
  private branch = 'main'; // Never do this
}
```

### 2. VirtualFileSystem Must Support Multiple Backend Instances

```typescript
// ✅ CORRECT - backends stored in a map, not singleton
class VirtualFileSystem {
  private backends: Map<string, GitHubBackend> = new Map();

  async mountBranch(mountPoint: string, branch: string) {
    const backend = new GitHubBackend({ ...this.config, branch });
    this.backends.set(mountPoint, backend);
  }
}

// ❌ WRONG - single backend instance
class VirtualFileSystem {
  private githubBackend: GitHubBackend; // Limits to one branch
}
```

### 3. Path Normalization Must Preserve Mount Points

**Context**: The primary working directory uses unprefixed paths (`src/file.ts`),
same as today. Future branch comparison will use explicit mount points
(`/branches/main/src/file.ts`). Normalization must handle both correctly.

```typescript
// Primary working directory - no change from current behavior
normalizePath('src/file.ts')      → 'src/file.ts'    // Panel paths work as-is
normalizePath('/src/file.ts')     → 'src/file.ts'    // Leading slash stripped

// Future branch mounts - must preserve the mount point prefix
normalizePath('/branches/main/src/file.ts') → 'branches/main/src/file.ts'  ✅
normalizePath('/branches/main/src/file.ts') → 'src/file.ts'                ❌ WRONG
```

**FileTree consumers are NOT affected** - they continue using unprefixed paths.
Branch mount points are only used internally for explicit cross-branch operations.

### 4. No Global ZenFS State Assumptions

```typescript
// ✅ CORRECT - use fs.mount/unmount for dynamic mounts
await fs.mount('/compare/main', mainBackend);
await fs.mount('/compare/feature', featureBackend);

// ❌ WRONG - reconfigure() replaces all mounts
await configure({ mounts: { '/': newBackend } }); // Loses other mounts
```

### 5. Backend Factory Pattern

Prepare for creating backends dynamically:

```typescript
// ✅ CORRECT - factory function
createGitHubBackend(config: { owner, repo, branch, token }): GitHubBackend

// This enables future use like:
const backends = branches.map(b => createGitHubBackend({ ...base, branch: b }));
```

### 6. Keep SHA/Metadata Per-Backend

Each backend instance should track its own file metadata:

```typescript
// ✅ CORRECT - SHA cache is per-instance
class GitHubBackend {
  private cache: Map<string, { content: string; sha: string }> = new Map();
}

// ❌ WRONG - global SHA store
const globalShaCache = new Map(); // Can't distinguish branches
```

---

## Future Enhancements

### Branch Comparison

Mount multiple branches for cross-branch file comparison:

```typescript
class VirtualFileSystem {
  private mountedBranches: Map<string, GitHubBackend> = new Map();

  async mountBranch(branch: string): Promise<string> {
    const mountPoint = `/branches/${branch}`;

    if (!this.mountedBranches.has(branch)) {
      const backend = new GitHubBackend({
        ...this.config.github,
        branch,
      });
      await fs.mount(mountPoint, backend);
      this.mountedBranches.set(branch, backend);
    }

    return mountPoint;
  }

  async readFileFromBranch(path: string, branch: string): Promise<string> {
    const mountPoint = await this.mountBranch(branch);
    return fs.promises.readFile(`${mountPoint}/${path}`, 'utf8');
  }

  async compareFile(path: string, baseBranch: string, headBranch: string) {
    const [base, head] = await Promise.all([
      this.readFileFromBranch(path, baseBranch).catch(() => null),
      this.readFileFromBranch(path, headBranch).catch(() => null),
    ]);

    return { base, head, differs: base !== head };
  }

  async unmountBranch(branch: string): Promise<void> {
    const mountPoint = `/branches/${branch}`;
    if (this.mountedBranches.has(branch)) {
      await fs.unmount(mountPoint);
      this.mountedBranches.delete(branch);
    }
  }
}
```

**Use cases enabled:**
- PR review diffs
- Branch comparison panels
- Merge conflict preview
- File history across commits

### Persistence Layer

Add IndexedDB backend to persist pending changes across refreshes:

```typescript
import { IndexedDB } from '@zenfs/dom';

await configure({
  mounts: {
    '/': {
      backend: CopyOnWrite,
      readable: githubBackend,
      writable: {
        backend: IndexedDB,
        storeName: `pending-${owner}-${repo}`,
      },
    },
  },
});
```

### Conflict Detection

Enhance commit flow to detect conflicts:

```typescript
async commitWithConflictCheck(files: PendingFile[]) {
  for (const file of files) {
    if (file.originalSha) {
      const currentSha = await this.fetchCurrentSha(file.path);
      if (currentSha !== file.originalSha) {
        throw new ConflictError(file.path, file.originalSha, currentSha);
      }
    }
  }
  // Proceed with commit...
}
```

### Offline Support

With IndexedDB persistence, add offline queue:

```typescript
class OfflineQueue {
  async queueCommit(files: PendingFile[], message: string) {
    await db.put('commitQueue', { files, message, queuedAt: new Date() });
  }

  async processQueue() {
    const queued = await db.getAll('commitQueue');
    for (const commit of queued) {
      try {
        await this.commitToGitHub(commit);
        await db.delete('commitQueue', commit.id);
      } catch (e) {
        // Retry later
      }
    }
  }
}
```

## References

- [ZenFS Core](https://github.com/zen-fs/core)
- [ZenFS Documentation](https://zenfs.dev/)
- [CopyOnWrite Backend](https://zenfs.dev/core/classes/CopyOnWrite.html)
- [Original Pending Files Architecture](./pending-files-architecture.md)
