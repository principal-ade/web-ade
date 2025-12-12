# web-ade Workspaces Implementation Guide

**Version:** 1.0
**Date:** 2025-12-11
**Author:** Principal AI Engineering Team
**Status:** Implementation Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Implementation Guide](#implementation-guide)
5. [API Reference](#api-reference)
6. [React Integration](#react-integration)
7. [Migration Path to Database](#migration-path-to-database)
8. [Examples](#examples)

---

## Overview

This document describes how to implement workspace functionality in web-ade using the `@principal-ai/alexandria-core-library/browser` module. Workspaces allow users to group GitHub repositories together for better organization.

### Key Features

- **LocalStorage Persistence**: Data persists in browser localStorage
- **Shared Types**: Same `Workspace` and `WorkspaceMembership` types as electron-app
- **Repository Grouping**: Group repositories by `owner/repo` identifiers
- **Future-Proof**: Designed for easy migration to database storage

### Architecture Alignment

```
┌─────────────────────────────────────────────────────────────────┐
│                        Both Apps Use                            │
│                                                                 │
│    ┌─────────────────────────────────────────────────────┐     │
│    │              WorkspaceManager                        │     │
│    │         (from alexandria-core-library)               │     │
│    └─────────────────────────────────────────────────────┘     │
│                            │                                    │
│              uses FileSystemAdapter interface                   │
│                            │                                    │
│         ┌──────────────────┴──────────────────┐                │
│         ▼                                      ▼                │
│  ┌─────────────────┐                ┌─────────────────────┐    │
│  │NodeFileSystem   │                │LocalStorageFileSystem│    │
│  │Adapter          │                │Adapter               │    │
│  │(electron-app)   │                │(web-ade)             │    │
│  └────────┬────────┘                └──────────┬──────────┘    │
│           ▼                                    ▼                │
│  ┌─────────────────┐                ┌─────────────────────┐    │
│  │~/.alexandria/   │                │   localStorage      │    │
│  │*.json           │                │                     │    │
│  └─────────────────┘                └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Installation

The browser adapter is already included in `@principal-ai/alexandria-core-library`. Update to the latest version:

```bash
npm install @principal-ai/alexandria-core-library@latest
# or
bun add @principal-ai/alexandria-core-library@latest
```

---

## Implementation Guide

### Step 1: Create the Workspace Store

Create a new file at `src/lib/client/workspaceStore.ts`:

```typescript
import {
  LocalStorageFileSystemAdapter,
  WorkspaceManager,
  type Workspace,
  type WorkspaceMembership,
} from '@principal-ai/alexandria-core-library/browser';

// Singleton instance
let workspaceManager: WorkspaceManager | null = null;
let fsAdapter: LocalStorageFileSystemAdapter | null = null;

/**
 * Initialize the workspace manager
 * Call this once when the app loads (client-side only)
 */
export function initWorkspaceStore(): WorkspaceManager {
  if (workspaceManager) {
    return workspaceManager;
  }

  // Create localStorage adapter with web-ade prefix
  fsAdapter = new LocalStorageFileSystemAdapter({
    prefix: 'web-ade-workspaces',
  });

  // Create workspace manager
  // The path simulates a home directory structure
  workspaceManager = new WorkspaceManager('/user/.alexandria', fsAdapter);

  return workspaceManager;
}

/**
 * Get the workspace manager instance
 * Throws if not initialized
 */
export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) {
    return initWorkspaceStore();
  }
  return workspaceManager;
}

/**
 * Clear all workspace data (useful for logout/reset)
 */
export function clearWorkspaceData(): void {
  if (fsAdapter) {
    fsAdapter.clear();
  }
  workspaceManager = null;
  fsAdapter = null;
}

// Re-export types for convenience
export type { Workspace, WorkspaceMembership };
```

### Step 2: Create React Context

Create `src/contexts/WorkspaceContext.tsx`:

```typescript
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  getWorkspaceManager,
  type Workspace,
  type WorkspaceMembership,
} from '@/lib/client/workspaceStore';

interface WorkspaceContextValue {
  // State
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;

  // Workspace CRUD
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  setCurrentWorkspace: (workspace: Workspace | null) => void;

  // Repository management
  addRepository: (workspaceId: string, repoKey: string) => Promise<void>;
  removeRepository: (workspaceId: string, repoKey: string) => Promise<void>;
  getWorkspaceRepositories: (workspaceId: string) => Promise<string[]>;

  // Refresh
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load workspaces on mount
  useEffect(() => {
    refreshWorkspaces();
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const manager = getWorkspaceManager();
      const loaded = await manager.getWorkspaces();
      setWorkspaces(loaded);

      // Restore current workspace from localStorage
      const savedCurrentId = localStorage.getItem('web-ade-current-workspace');
      if (savedCurrentId) {
        const current = loaded.find((w) => w.id === savedCurrentId);
        setCurrentWorkspace(current ?? null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(
    async (name: string, description?: string): Promise<Workspace> => {
      const manager = getWorkspaceManager();
      const workspace = await manager.createWorkspace({
        name,
        description,
      });
      await refreshWorkspaces();
      return workspace;
    },
    [refreshWorkspaces]
  );

  const updateWorkspace = useCallback(
    async (id: string, updates: Partial<Workspace>) => {
      const manager = getWorkspaceManager();
      await manager.updateWorkspace(id, updates);
      await refreshWorkspaces();
    },
    [refreshWorkspaces]
  );

  const deleteWorkspace = useCallback(
    async (id: string) => {
      const manager = getWorkspaceManager();
      await manager.deleteWorkspace(id);

      // Clear current if deleted
      if (currentWorkspace?.id === id) {
        setCurrentWorkspace(null);
        localStorage.removeItem('web-ade-current-workspace');
      }

      await refreshWorkspaces();
    },
    [currentWorkspace, refreshWorkspaces]
  );

  const handleSetCurrentWorkspace = useCallback((workspace: Workspace | null) => {
    setCurrentWorkspace(workspace);
    if (workspace) {
      localStorage.setItem('web-ade-current-workspace', workspace.id);
    } else {
      localStorage.removeItem('web-ade-current-workspace');
    }
  }, []);

  const addRepository = useCallback(
    async (workspaceId: string, repoKey: string) => {
      const manager = getWorkspaceManager();
      // repoKey format: "owner/repo"
      await manager.addRepositoryToWorkspace(repoKey, workspaceId);
    },
    []
  );

  const removeRepository = useCallback(
    async (workspaceId: string, repoKey: string) => {
      const manager = getWorkspaceManager();
      await manager.removeRepositoryFromWorkspace(repoKey, workspaceId);
    },
    []
  );

  const getWorkspaceRepositories = useCallback(
    async (workspaceId: string): Promise<string[]> => {
      const manager = getWorkspaceManager();
      const memberships = await manager.getWorkspaceMemberships(workspaceId);
      return memberships.map((m) => m.repositoryId);
    },
    []
  );

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        isLoading,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        setCurrentWorkspace: handleSetCurrentWorkspace,
        addRepository,
        removeRepository,
        getWorkspaceRepositories,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaces must be used within a WorkspaceProvider');
  }
  return context;
}
```

### Step 3: Add Provider to App Layout

In `src/app/layout.tsx` or your providers file:

```typescript
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <WorkspaceProvider>
          {/* Other providers */}
          {children}
        </WorkspaceProvider>
      </body>
    </html>
  );
}
```

---

## API Reference

### WorkspaceManager Methods

| Method | Description |
|--------|-------------|
| `createWorkspace(data)` | Create a new workspace |
| `getWorkspace(id)` | Get workspace by ID |
| `getWorkspaces()` | Get all workspaces |
| `updateWorkspace(id, updates)` | Update workspace properties |
| `deleteWorkspace(id)` | Delete workspace and memberships |
| `addRepositoryToWorkspace(repoId, wsId)` | Add repo to workspace |
| `removeRepositoryFromWorkspace(repoId, wsId)` | Remove repo from workspace |
| `getWorkspaceMemberships(wsId)` | Get all repos in workspace |
| `getRepositoryWorkspaces(repoId)` | Get all workspaces containing repo |
| `isRepositoryInWorkspace(repoId, wsId)` | Check membership |
| `getDefaultWorkspace()` | Get default workspace |
| `setDefaultWorkspace(wsId)` | Set default workspace |

### Workspace Type

```typescript
interface Workspace {
  id: string;                      // Auto-generated: "ws-{timestamp}-{random}"
  name: string;                    // Required
  description?: string;
  theme?: string;                  // Color theme
  icon?: string;                   // Icon identifier
  isDefault?: boolean;             // Default workspace flag
  suggestedClonePath?: string;     // For future clone integration
  metadata?: Record<string, unknown>;
  createdAt: number;               // Unix timestamp
  updatedAt: number;               // Unix timestamp
}
```

### WorkspaceMembership Type

```typescript
interface WorkspaceMembership {
  repositoryId: string;            // "owner/repo" format
  workspaceId: string;
  addedAt: number;                 // Unix timestamp
  metadata?: Record<string, unknown>;
}
```

---

## React Integration

### Example: Workspace Selector Component

```typescript
'use client';

import { useWorkspaces } from '@/contexts/WorkspaceContext';

export function WorkspaceSelector() {
  const { workspaces, currentWorkspace, setCurrentWorkspace, isLoading } = useWorkspaces();

  if (isLoading) {
    return <div>Loading workspaces...</div>;
  }

  return (
    <select
      value={currentWorkspace?.id ?? ''}
      onChange={(e) => {
        const ws = workspaces.find((w) => w.id === e.target.value);
        setCurrentWorkspace(ws ?? null);
      }}
    >
      <option value="">All Repositories</option>
      {workspaces.map((ws) => (
        <option key={ws.id} value={ws.id}>
          {ws.name}
        </option>
      ))}
    </select>
  );
}
```

### Example: Create Workspace Modal

```typescript
'use client';

import { useState } from 'react';
import { useWorkspaces } from '@/contexts/WorkspaceContext';

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const { createWorkspace } = useWorkspaces();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createWorkspace(name, description || undefined);
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal">
      <h2>Create Workspace</h2>
      <input
        type="text"
        placeholder="Workspace name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button onClick={handleCreate} disabled={isCreating || !name.trim()}>
        {isCreating ? 'Creating...' : 'Create'}
      </button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
}
```

### Example: Add Repository to Workspace

```typescript
'use client';

import { useWorkspaces } from '@/contexts/WorkspaceContext';

interface AddToWorkspaceButtonProps {
  owner: string;
  repo: string;
}

export function AddToWorkspaceButton({ owner, repo }: AddToWorkspaceButtonProps) {
  const { workspaces, addRepository } = useWorkspaces();
  const repoKey = `${owner}/${repo}`;

  const handleAdd = async (workspaceId: string) => {
    await addRepository(workspaceId, repoKey);
  };

  return (
    <div className="dropdown">
      <button>Add to Workspace</button>
      <div className="dropdown-menu">
        {workspaces.map((ws) => (
          <button key={ws.id} onClick={() => handleAdd(ws.id)}>
            {ws.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Migration Path to Database

When ready to migrate to database storage, the architecture allows for a clean transition:

### Phase 1: Current (localStorage)

```typescript
const fsAdapter = new LocalStorageFileSystemAdapter({ prefix: 'web-ade' });
const workspaces = new WorkspaceManager('/user/.alexandria', fsAdapter);
```

### Phase 2: Future (Database via API)

Create a `DatabaseStorageAdapter` that makes API calls:

```typescript
// Future: src/lib/client/DatabaseStorageAdapter.ts
class DatabaseStorageAdapter implements FileSystemAdapter {
  constructor(private apiClient: ApiClient) {}

  readFile(path: string): string {
    // This would need to be async in practice
    // Could use a sync cache layer or refactor to async
  }

  writeFile(path: string, content: string): void {
    this.apiClient.post('/api/workspaces/sync', { path, content });
  }

  // ... other methods
}
```

### Phase 3: Hybrid (localStorage cache + Database sync)

```typescript
class SyncedStorageAdapter implements FileSystemAdapter {
  constructor(
    private localStorage: LocalStorageFileSystemAdapter,
    private apiClient: ApiClient
  ) {}

  writeFile(path: string, content: string): void {
    // Write to localStorage immediately (optimistic)
    this.localStorage.writeFile(path, content);

    // Sync to database in background
    this.apiClient.post('/api/workspaces/sync', { path, content });
  }

  readFile(path: string): string {
    // Read from localStorage (fast)
    return this.localStorage.readFile(path);
  }
}
```

---

## Examples

### Full Workspaces Page

```typescript
// src/app/workspaces/page.tsx
'use client';

import { useWorkspaces } from '@/contexts/WorkspaceContext';
import { useState, useEffect } from 'react';

export default function WorkspacesPage() {
  const {
    workspaces,
    isLoading,
    createWorkspace,
    deleteWorkspace,
    getWorkspaceRepositories,
  } = useWorkspaces();

  const [workspaceRepos, setWorkspaceRepos] = useState<Record<string, string[]>>({});

  useEffect(() => {
    // Load repos for each workspace
    workspaces.forEach(async (ws) => {
      const repos = await getWorkspaceRepositories(ws.id);
      setWorkspaceRepos((prev) => ({ ...prev, [ws.id]: repos }));
    });
  }, [workspaces, getWorkspaceRepositories]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Workspaces</h1>

      <button
        onClick={() => createWorkspace('New Workspace')}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Create Workspace
      </button>

      <div className="grid gap-4">
        {workspaces.map((ws) => (
          <div key={ws.id} className="border rounded p-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">{ws.name}</h2>
              <button
                onClick={() => deleteWorkspace(ws.id)}
                className="text-red-600"
              >
                Delete
              </button>
            </div>
            {ws.description && (
              <p className="text-gray-600">{ws.description}</p>
            )}
            <div className="mt-2">
              <strong>Repositories:</strong>
              <ul className="list-disc ml-6">
                {(workspaceRepos[ws.id] ?? []).map((repo) => (
                  <li key={repo}>{repo}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## localStorage Keys

The adapter uses the following key format:

```
{prefix}:{path}
```

Example keys:
```
web-ade-workspaces:/user/.alexandria/workspaces.json
web-ade-workspaces:/user/.alexandria/workspace-memberships.json
web-ade-workspaces:/user/.alexandria/.dir
```

To inspect stored data in browser DevTools:
```javascript
// List all web-ade workspace keys
Object.keys(localStorage).filter(k => k.startsWith('web-ade-workspaces:'))

// View workspaces data
JSON.parse(localStorage.getItem('web-ade-workspaces:/user/.alexandria/workspaces.json'))
```

---

## Notes

1. **Client-Side Only**: The `LocalStorageFileSystemAdapter` only works in browser environments. Use dynamic imports or client components.

2. **Storage Limits**: localStorage has a ~5MB limit. For large datasets, consider IndexedDB or migrate to database earlier.

3. **No Cross-Tab Sync**: Changes in one tab won't automatically reflect in others. Consider using `storage` events or a state management solution for multi-tab support.

4. **User Data**: Data is stored per-browser. Users won't see their workspaces on different devices until database migration is complete.
