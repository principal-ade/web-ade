# Alexandria Workspace Panel - Architecture & Design Document

> **Reference Implementation:** Alexandria Workspace List Panel (desktop-app/electron-app)
> **Target Platform:** Web (Next.js) with Panel Framework Core
> **Package:** `@principal-ade/alexandria-workspace-panel`

---

## Table of Contents

1. [Overview](#overview)
2. [Reference Implementation Analysis](#reference-implementation-analysis)
3. [Adaptations for Web Platform](#adaptations-for-web-platform)
4. [Component Structure](#component-structure)
5. [Data Flow & State Management](#data-flow--state-management)
6. [API Integration](#api-integration)
7. [User Interaction Flows](#user-interaction-flows)
8. [Panel Framework Integration](#panel-framework-integration)
9. [Storage & Persistence](#storage--persistence)
10. [Implementation Plan](#implementation-plan)

---

## Overview

The Alexandria Workspace Panel provides workspace management for organizing repositories/projects into logical groups. It enables users to create, edit, and manage workspaces, add/remove repositories, and navigate between different workspace contexts.

### Core Responsibilities

1. **Display and manage workspaces** - List all workspaces with metadata
2. **Workspace CRUD operations** - Create, read, update, delete workspaces
3. **Repository membership management** - Add/remove repositories to/from workspaces
4. **Workspace selection** - Allow users to select active workspace
5. **Emit panel events** when workspace context changes
6. **Integrate with panel framework** data slices and actions

### What is a Workspace?

A **workspace** is a logical grouping of repositories/projects that belong together. Think of it as:
- A collection of related projects (e.g., "Frontend Projects", "Client Work")
- A suggested location for cloning new repositories
- A way to organize and filter repositories
- A context for panel views (show only repos in selected workspace)

---

## Reference Implementation Analysis

Based on the desktop-app Alexandria workspace system at `/Users/griever/Developer/desktop-app/electron-app`:

### Key Components

1. **WorkspacesListPanel.tsx**
   - Displays all workspaces in a scrollable list
   - Inline editing of workspace names
   - Create new workspace button
   - Default workspace badge
   - Color-coded workspace icons
   - Real-time updates via subscriptions

2. **WorkspaceEntriesPanel.tsx**
   - Shows repositories belonging to selected workspace
   - Add repository modal
   - Home directory management (suggested clone path)
   - Empty states for no workspace/no repositories

3. **CreateWorkspaceModal.tsx**
   - Form for creating new workspaces
   - Fields: name, description, color, suggested clone path
   - Directory browser for clone path selection

4. **AddRepositoryToWorkspaceModal.tsx**
   - Search and filter all repositories
   - Exclude already-added repositories
   - One-click add with loading state

### Data Structures

```typescript
// From @a24z/core-library
interface Workspace {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  suggestedClonePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceMembership {
  workspaceId: string;
  repositoryId: string;
  addedAt: Date;
  metadata?: Record<string, unknown>;
}

interface AlexandriaEntry {
  name: string;
  path: string;
  remoteUrl?: string;
  github?: {
    id?: string;
    owner?: string;
    description?: string;
  };
}
```

### Architecture Pattern (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer Process (React Components)                         │
│                                                              │
│  WorkspacesListPanel                                        │
│  WorkspaceEntriesPanel                                      │
│         │                                                    │
│         └─> WorkspaceService (IPC wrapper)                 │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │ IPC Events
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Main Process (Node.js)                                      │
│                                                              │
│  WorkspaceApiEventHandler                                   │
│         │                                                    │
│         └─> AlexandriaRegistryService                      │
│                     │                                        │
│                     └─> AlexandriaOutpostManager            │
│                             │                                │
│                             └─> JSON file storage           │
└─────────────────────────────────────────────────────────────┘
```

### Key Features from Desktop

✅ **Inline editing** - Click edit icon, Enter to save, Esc to cancel
✅ **Event-driven updates** - All windows update when workspace changes
✅ **Default workspace** - One workspace marked as default
✅ **Color coding** - Each workspace has a color for visual distinction
✅ **Suggested clone paths** - Workspace specifies where to clone repos
✅ **Repository membership** - Many-to-many relationship (repos can be in multiple workspaces)
✅ **Real-time sync** - Changes broadcast to all open windows
✅ **Empty states** - Clear messaging when no workspaces/repositories
✅ **Search/filter repositories** - When adding to workspace
✅ **Optimistic UI updates** - Immediate feedback with rollback on error

---

## Adaptations for Web Platform

### Key Differences: Desktop vs Web

| Aspect | Desktop (Electron) | Web (Next.js) |
|--------|-------------------|---------------|
| **Data Storage** | Local JSON files via AlexandriaOutpostManager | Database (Postgres/MongoDB) + Session |
| **Real-time Updates** | IPC event broadcast to all windows | Server-Sent Events / Polling / WebSockets |
| **Authentication** | OS-level (single user) | Multi-user with OAuth |
| **File System Access** | Direct via Node.js | None (browser sandbox) |
| **Clone Path** | Local filesystem path | Server-side path or user preference |
| **State Management** | React hooks + IPC subscriptions | React hooks + SWR/React Query |
| **API Communication** | Electron IPC | REST/GraphQL API |

### Web-Specific Design Decisions

1. **Multi-User Architecture**
   - Each user has their own workspaces
   - Workspaces stored in database per user
   - Future: Shared/team workspaces

2. **No Direct File System**
   - Suggested clone path is a preference (text field)
   - Server can use it for server-side cloning
   - Client-side cloning not possible (browser limitation)

3. **Real-time Updates**
   - **Option A (Simple):** SWR polling every 10-30s
   - **Option B (Better UX):** Server-Sent Events for instant updates
   - **Option C (Advanced):** WebSockets for real-time collaboration

4. **Repository References**
   - Desktop: Links to local filesystem paths (AlexandriaEntry)
   - Web: Links to GitHub repositories OR user's repository registry
   - Hybrid: User can add both GitHub repos and custom entries

5. **Persistence**
   - Database schema with `workspaces` and `workspace_memberships` tables
   - User association via `userId` foreign key
   - Caching in IndexedDB for offline capability (optional)

---

## Component Structure

### Directory Layout

```
packages/alexandria-workspace-panel/
├── src/
│   ├── components/
│   │   ├── WorkspacePanel.tsx                # Main workspace list panel
│   │   ├── WorkspaceCard.tsx                 # Individual workspace card
│   │   ├── WorkspaceList.tsx                 # Scrollable list
│   │   ├── WorkspaceHeader.tsx               # Header with create button
│   │   ├── WorkspaceEntriesPanel.tsx         # Repositories in workspace
│   │   ├── RepositoryCard.tsx                # Repository display in workspace
│   │   ├── CreateWorkspaceModal.tsx          # Modal for creating workspace
│   │   ├── EditWorkspaceModal.tsx            # Modal for editing workspace
│   │   ├── AddRepositoryModal.tsx            # Modal for adding repos
│   │   ├── DeleteWorkspaceConfirm.tsx        # Confirmation dialog
│   │   ├── EmptyWorkspaceState.tsx           # Empty state component
│   │   └── WorkspaceColorPicker.tsx          # Color selection component
│   ├── hooks/
│   │   ├── useWorkspaces.ts                  # Main hook for workspaces
│   │   ├── useWorkspaceMembers.ts            # Hook for workspace repos
│   │   ├── useWorkspaceMutations.ts          # CRUD operations
│   │   └── useWorkspaceSelection.ts          # Selected workspace state
│   ├── services/
│   │   ├── WorkspaceService.ts               # API abstraction layer
│   │   └── WorkspaceMembershipService.ts     # Membership operations
│   ├── types/
│   │   ├── Workspace.ts                      # Type definitions
│   │   ├── WorkspaceMembership.ts            # Membership types
│   │   ├── WorkspacePanelProps.ts            # Component props
│   │   └── PanelEvents.ts                    # Event type definitions
│   ├── utils/
│   │   ├── workspaceColors.ts                # Predefined color palette
│   │   ├── sortWorkspaces.ts                 # Sorting utilities
│   │   └── validateWorkspace.ts              # Validation logic
│   ├── styles/
│   │   └── alexandria-workspace-panel.css    # Optional CSS
│   └── index.ts                               # Main exports
├── package.json
├── tsconfig.json
├── README.md
├── DESIGN.md                                  # This file
├── API.md                                     # API reference
└── EXAMPLES.md                                # Usage examples
```

### Component Hierarchy

```
WorkspacePanel (Main workspace list)
├── WorkspaceHeader
│   └── Create Workspace Button → CreateWorkspaceModal
├── WorkspaceList
│   └── WorkspaceCard[] (map over workspaces)
│       ├── Color Indicator
│       ├── Workspace Icon
│       ├── Workspace Name (inline editable)
│       ├── Default Badge (if default workspace)
│       ├── Repository Count
│       ├── Description
│       └── Actions Menu
│           ├── Edit → EditWorkspaceModal
│           ├── Set as Default
│           └── Delete → DeleteWorkspaceConfirm
└── EmptyWorkspaceState (if no workspaces)

WorkspaceEntriesPanel (Repositories in selected workspace)
├── Header
│   ├── Workspace Name
│   ├── Add Repository Button → AddRepositoryModal
│   └── Workspace Settings Button
├── Home Directory Display
│   ├── Current Path
│   └── Change/Clear Buttons
├── RepositoryList
│   └── RepositoryCard[] (map over members)
│       ├── Repository Avatar/Icon
│       ├── Repository Name
│       ├── Repository Owner
│       ├── Repository Path/URL
│       ├── Repository Metadata
│       └── Remove Button
└── EmptyRepositoryState (if no repos in workspace)
```

---

## Data Flow & State Management

### State Architecture

```typescript
// Global workspace context (via PanelProvider)
interface WorkspaceContextValue {
  // Current user's workspaces
  workspaces: Workspace[];
  workspacesLoading: boolean;
  workspacesError: string | null;

  // Selected workspace (for filtering)
  selectedWorkspace: Workspace | null;
  setSelectedWorkspace: (workspace: Workspace | null) => void;

  // Default workspace
  defaultWorkspace: Workspace | null;

  // Operations
  createWorkspace: (data: CreateWorkspaceInput) => Promise<Workspace>;
  updateWorkspace: (id: string, data: UpdateWorkspaceInput) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  setDefaultWorkspace: (id: string) => Promise<void>;

  // Membership operations
  addRepositoryToWorkspace: (workspaceId: string, repositoryId: string) => Promise<void>;
  removeRepositoryFromWorkspace: (workspaceId: string, repositoryId: string) => Promise<void>;
  getWorkspaceRepositories: (workspaceId: string) => Promise<Repository[]>;

  // Refresh
  refreshWorkspaces: () => Promise<void>;
}
```

### Hook: useWorkspaces

```typescript
export interface UseWorkspacesReturn {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  defaultWorkspace: Workspace | null;
  refresh: () => Promise<void>;
  createWorkspace: (data: CreateWorkspaceInput) => Promise<Workspace>;
  updateWorkspace: (id: string, data: UpdateWorkspaceInput) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  setDefaultWorkspace: (id: string) => Promise<void>;
}

export function useWorkspaces(): UseWorkspacesReturn {
  const { user } = useAuth();

  // Fetch workspaces with SWR
  const {
    data: workspaces = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Workspace[]>(
    user ? '/api/workspaces' : null,
    WorkspaceService.getWorkspaces,
    {
      refreshInterval: 30000, // Poll every 30s
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  // Find default workspace
  const defaultWorkspace = useMemo(
    () => workspaces.find(w => w.isDefault) ?? null,
    [workspaces]
  );

  // Mutation functions with optimistic updates
  const createWorkspace = useCallback(async (data: CreateWorkspaceInput) => {
    const newWorkspace = await WorkspaceService.createWorkspace(data);
    await mutate(); // Refresh list
    return newWorkspace;
  }, [mutate]);

  const updateWorkspace = useCallback(async (id: string, data: UpdateWorkspaceInput) => {
    // Optimistic update
    mutate(
      workspaces.map(w => w.id === id ? { ...w, ...data } : w),
      false
    );

    try {
      const updated = await WorkspaceService.updateWorkspace(id, data);
      await mutate(); // Revalidate
      return updated;
    } catch (error) {
      await mutate(); // Revert on error
      throw error;
    }
  }, [workspaces, mutate]);

  const deleteWorkspace = useCallback(async (id: string) => {
    // Optimistic update
    mutate(
      workspaces.filter(w => w.id !== id),
      false
    );

    try {
      await WorkspaceService.deleteWorkspace(id);
      await mutate(); // Revalidate
    } catch (error) {
      await mutate(); // Revert on error
      throw error;
    }
  }, [workspaces, mutate]);

  const setDefaultWorkspace = useCallback(async (id: string) => {
    // Optimistic update
    mutate(
      workspaces.map(w => ({ ...w, isDefault: w.id === id })),
      false
    );

    try {
      await WorkspaceService.setDefaultWorkspace(id);
      await mutate(); // Revalidate
    } catch (error) {
      await mutate(); // Revert on error
      throw error;
    }
  }, [workspaces, mutate]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    workspaces,
    loading: isLoading,
    error: error?.message ?? null,
    defaultWorkspace,
    refresh,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setDefaultWorkspace,
  };
}
```

### Hook: useWorkspaceMembers

```typescript
export interface UseWorkspaceMembersReturn {
  repositories: Repository[];
  loading: boolean;
  error: string | null;
  addRepository: (repositoryId: string) => Promise<void>;
  removeRepository: (repositoryId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useWorkspaceMembers(workspaceId: string | null): UseWorkspaceMembersReturn {
  const {
    data: repositories = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Repository[]>(
    workspaceId ? `/api/workspaces/${workspaceId}/repositories` : null,
    () => WorkspaceMembershipService.getRepositories(workspaceId!),
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  const addRepository = useCallback(async (repositoryId: string) => {
    if (!workspaceId) return;

    try {
      await WorkspaceMembershipService.addRepository(workspaceId, repositoryId);
      await mutate(); // Refresh list
    } catch (error) {
      console.error('Failed to add repository:', error);
      throw error;
    }
  }, [workspaceId, mutate]);

  const removeRepository = useCallback(async (repositoryId: string) => {
    if (!workspaceId) return;

    // Optimistic update
    mutate(
      repositories.filter(r => r.id !== repositoryId),
      false
    );

    try {
      await WorkspaceMembershipService.removeRepository(workspaceId, repositoryId);
      await mutate(); // Revalidate
    } catch (error) {
      await mutate(); // Revert on error
      throw error;
    }
  }, [workspaceId, repositories, mutate]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    repositories,
    loading: isLoading,
    error: error?.message ?? null,
    addRepository,
    removeRepository,
    refresh,
  };
}
```

---

## API Integration

### Database Schema

```sql
-- Workspaces table
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7), -- Hex color code
  icon VARCHAR(50),
  suggested_clone_path TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX idx_workspaces_is_default ON workspaces(is_default);

-- Workspace memberships (many-to-many with repositories)
CREATE TABLE workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  repository_id VARCHAR(255) NOT NULL, -- Can be GitHub ID or local ID
  added_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, repository_id)
);

CREATE INDEX idx_memberships_workspace_id ON workspace_memberships(workspace_id);
CREATE INDEX idx_memberships_repository_id ON workspace_memberships(repository_id);

-- Repositories table (optional - for storing repo metadata)
CREATE TABLE repositories (
  id VARCHAR(255) PRIMARY KEY, -- GitHub ID or generated ID
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  description TEXT,
  url TEXT,
  clone_url TEXT,
  local_path TEXT, -- If cloned locally
  default_branch VARCHAR(255),
  language VARCHAR(100),
  stars INTEGER DEFAULT 0,
  private BOOLEAN DEFAULT FALSE,
  github_data JSONB, -- Store full GitHub API response
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_repositories_name ON repositories(name);
```

### API Routes Structure

```
app/api/
├── workspaces/
│   ├── route.ts                              # GET (list), POST (create)
│   ├── [workspaceId]/
│   │   ├── route.ts                          # GET (details), PATCH (update), DELETE
│   │   ├── repositories/
│   │   │   ├── route.ts                      # GET (list members), POST (add member)
│   │   │   └── [repositoryId]/
│   │   │       └── route.ts                  # DELETE (remove member)
│   │   └── default/
│   │       └── route.ts                      # POST (set as default)
│   └── default/
│       └── route.ts                          # GET (get default workspace)
└── repositories/
    ├── route.ts                              # GET (list all user's repos)
    └── [repositoryId]/
        └── route.ts                          # GET (repo details)
```

### API Route Implementations

#### GET /api/workspaces

```typescript
// app/api/workspaces/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const workspaces = await db.workspace.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: [
        { isDefault: 'desc' }, // Default workspace first
        { name: 'asc' }, // Then alphabetically
      ],
    });

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const data = await request.json();
    const { name, description, color, suggestedClonePath, isDefault } = data;

    // Validation
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.workspace.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const workspace = await db.workspace.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        description: description?.trim(),
        color: color || '#3b82f6',
        suggestedClonePath: suggestedClonePath?.trim(),
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error('Error creating workspace:', error);
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500 }
    );
  }
}
```

#### PATCH /api/workspaces/[workspaceId]

```typescript
// app/api/workspaces/[workspaceId]/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { workspaceId } = params;
    const data = await request.json();

    // Verify ownership
    const existing = await db.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await db.workspace.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await db.workspace.update({
      where: { id: workspaceId },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim(),
        color: data.color,
        suggestedClonePath: data.suggestedClonePath?.trim(),
        isDefault: data.isDefault,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json(
      { error: 'Failed to update workspace' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { workspaceId } = params;

    // Verify ownership
    const existing = await db.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Prevent deleting default workspace (optional - or allow and auto-set another)
    if (existing.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete default workspace' },
        { status: 400 }
      );
    }

    // Delete workspace (cascade will delete memberships)
    await db.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return NextResponse.json(
      { error: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
}
```

#### GET /api/workspaces/[workspaceId]/repositories

```typescript
// app/api/workspaces/[workspaceId]/repositories/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { workspaceId } = params;

    // Verify workspace ownership
    const workspace = await db.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get memberships with repository details
    const memberships = await db.workspaceMembership.findMany({
      where: { workspaceId },
      include: {
        repository: true, // Include full repository data
      },
      orderBy: { addedAt: 'desc' },
    });

    // Extract repositories
    const repositories = memberships.map(m => m.repository);

    return NextResponse.json(repositories);
  } catch (error) {
    console.error('Error fetching workspace repositories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { workspaceId } = params;
    const { repositoryId } = await request.json();

    // Verify workspace ownership
    const workspace = await db.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Verify repository ownership/access
    const repository = await db.repository.findFirst({
      where: { id: repositoryId, userId: session.user.id },
    });

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // Check if already a member
    const existing = await db.workspaceMembership.findFirst({
      where: { workspaceId, repositoryId },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Repository already in workspace' },
        { status: 400 }
      );
    }

    // Create membership
    const membership = await db.workspaceMembership.create({
      data: {
        workspaceId,
        repositoryId,
      },
    });

    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    console.error('Error adding repository to workspace:', error);
    return NextResponse.json(
      { error: 'Failed to add repository' },
      { status: 500 }
    );
  }
}
```

---

## User Interaction Flows

### 1. Viewing Workspaces

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: View Workspaces                                  │
└─────────────────────────────────────────────────────────────┘

1. User opens web-ade editor
   └─> WorkspacePanel renders
       └─> useWorkspaces() hook called
           ├─> Check authentication
           ├─> Fetch workspaces via SWR: GET /api/workspaces
           └─> Display workspace list

2. Workspaces displayed
   ├─> Default workspace shown first
   ├─> Other workspaces sorted alphabetically
   ├─> Each card shows:
   │   ├─> Color indicator
   │   ├─> Workspace name
   │   ├─> Repository count
   │   └─> Actions menu
   └─> Empty state if no workspaces
```

### 2. Creating a Workspace

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Create Workspace                                 │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Create Workspace" button
   └─> CreateWorkspaceModal opens

2. User fills form
   ├─> Name (required)
   ├─> Description (optional)
   ├─> Color picker (defaults to blue)
   └─> Suggested clone path (optional text field)

3. User submits
   └─> Validation runs
       ├─> Name required and not empty
       └─> Color is valid hex code
   └─> If valid:
       ├─> Call createWorkspace() from useWorkspaces
       ├─> POST /api/workspaces
       ├─> SWR mutates cache (adds new workspace)
       ├─> Modal closes
       ├─> Success notification
       └─> Emit panel event: 'workspace:created'
   └─> If error:
       └─> Show error message in modal
```

### 3. Editing Workspace (Inline)

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Inline Edit Workspace Name                       │
└─────────────────────────────────────────────────────────────┘

1. User clicks edit icon on workspace card
   └─> setIsEditing(true)
       └─> Name becomes editable input
           └─> Input auto-focuses

2. User types new name
   └─> State updates: setEditedName(value)

3. User presses Enter OR clicks save button
   └─> Validation: name not empty
   └─> If valid:
       ├─> Call updateWorkspace(id, { name: editedName })
       ├─> PATCH /api/workspaces/[id]
       ├─> Optimistic update: SWR mutates cache immediately
       ├─> setIsEditing(false)
       └─> Success feedback
   └─> If error:
       ├─> Revert to original name
       └─> Show error notification

4. User presses Escape OR clicks cancel
   └─> setEditedName(originalName)
   └─> setIsEditing(false)
```

### 4. Setting Default Workspace

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Set Default Workspace                            │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Set as Default" in actions menu
   └─> Confirmation dialog (optional)

2. User confirms
   └─> Call setDefaultWorkspace(workspaceId)
       ├─> POST /api/workspaces/[id]/default
       ├─> Backend:
       │   ├─> Unset isDefault on all workspaces
       │   └─> Set isDefault=true on selected workspace
       ├─> SWR optimistic update
       ├─> UI updates:
       │   ├─> Old default loses badge
       │   ├─> New default shows badge
       │   └─> List re-sorts (default first)
       └─> Emit panel event: 'workspace:default-changed'
```

### 5. Adding Repository to Workspace

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Add Repository to Workspace                      │
└─────────────────────────────────────────────────────────────┘

1. User opens WorkspaceEntriesPanel for selected workspace
   └─> Shows current repositories in workspace

2. User clicks "Add Repository" button
   └─> AddRepositoryModal opens
       ├─> Fetches all user's repositories
       ├─> Filters out repositories already in workspace
       └─> Shows searchable list

3. User searches/browses repositories
   └─> Search input filters list in real-time

4. User clicks repository or "Add" button
   └─> Loading state shown on that card
   └─> Call addRepository(repositoryId)
       ├─> POST /api/workspaces/[id]/repositories
       ├─> Backend creates membership
       ├─> SWR mutates workspace repositories cache
       ├─> Repository disappears from modal list
       └─> Success feedback

5. Modal stays open for adding more
   └─> User can add multiple repos
   └─> Close button or click outside to close

6. WorkspaceEntriesPanel updates
   └─> New repository appears in list
   └─> Repository count increments
```

### 6. Removing Repository from Workspace

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Remove Repository from Workspace                 │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Remove" button on repository card
   └─> Confirmation dialog shows
       └─> "Remove [repo name] from [workspace name]?"

2. User confirms
   └─> Call removeRepository(repositoryId)
       ├─> DELETE /api/workspaces/[id]/repositories/[repoId]
       ├─> Optimistic update: SWR removes from cache
       ├─> Repository immediately disappears from UI
       └─> If error: Repository reappears + error message

3. Workspace updates
   └─> Repository count decrements
   └─> If last repo removed: show empty state
```

### 7. Deleting Workspace

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Delete Workspace                                 │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Delete" in workspace actions menu
   └─> Confirmation dialog shows
       ├─> "Delete [workspace name]?"
       ├─> Warning: "All repository memberships will be removed"
       └─> Note: "Repositories themselves will not be deleted"

2. User confirms
   └─> Call deleteWorkspace(workspaceId)
       ├─> DELETE /api/workspaces/[id]
       ├─> Optimistic update: SWR removes from cache
       ├─> Workspace immediately disappears from UI
       ├─> Emit panel event: 'workspace:deleted'
       └─> If error: Workspace reappears + error message

3. If deleted workspace was selected
   └─> Clear selection: setSelectedWorkspace(null)
   └─> WorkspaceEntriesPanel shows "No workspace selected"

4. If deleted workspace was default
   └─> Backend option A: Prevent deletion (error)
   └─> Backend option B: Auto-set first remaining as default
```

---

## Panel Framework Integration

### Panel Registration

```typescript
// In web-ade application: src/app/editor/page.tsx
import { WorkspacePanel, WorkspaceEntriesPanel } from '@principal-ade/alexandria-workspace-panel';
import { EditableConfigurablePanelLayout } from '@principal-ade/panel-layouts';

const panelDefinitions = [
  {
    id: 'workspaces-list',
    label: 'Workspaces',
    icon: <Layers size={16} />,
    component: WorkspacePanel,
    defaultWidth: 300,
    minWidth: 250,
    maxWidth: 500,
  },
  {
    id: 'workspace-entries',
    label: 'Workspace Repositories',
    icon: <FolderGit2 size={16} />,
    component: WorkspaceEntriesPanel,
    defaultWidth: 350,
    minWidth: 300,
    maxWidth: 600,
  },
  // ... other panels
];

const defaultLayout = {
  left: {
    type: 'tabs',
    panels: ['workspaces-list', 'git-repos'],
    defaultActiveTab: 0,
  },
  middle: {
    type: 'tabs',
    panels: ['workspace-entries', 'file-tree'],
  },
  right: {
    type: 'tabs',
    panels: ['editor'],
  },
};
```

### Event Types Definition

```typescript
// src/types/PanelEvents.ts
import type { PanelEvent } from '@principal-ade/panel-framework-core';

export interface WorkspaceCreatedEvent extends PanelEvent {
  type: 'workspace:created';
  payload: {
    workspace: Workspace;
  };
}

export interface WorkspaceUpdatedEvent extends PanelEvent {
  type: 'workspace:updated';
  payload: {
    workspace: Workspace;
    changes: Partial<Workspace>;
  };
}

export interface WorkspaceDeletedEvent extends PanelEvent {
  type: 'workspace:deleted';
  payload: {
    workspaceId: string;
  };
}

export interface WorkspaceSelectedEvent extends PanelEvent {
  type: 'workspace:selected';
  payload: {
    workspace: Workspace | null;
  };
}

export interface WorkspaceDefaultChangedEvent extends PanelEvent {
  type: 'workspace:default-changed';
  payload: {
    previousDefaultId: string | null;
    newDefaultId: string;
  };
}

export interface WorkspaceMembershipChangedEvent extends PanelEvent {
  type: 'workspace:membership-changed';
  payload: {
    workspaceId: string;
    repositoryId: string;
    action: 'added' | 'removed';
  };
}

export type WorkspacePanelEvent =
  | WorkspaceCreatedEvent
  | WorkspaceUpdatedEvent
  | WorkspaceDeletedEvent
  | WorkspaceSelectedEvent
  | WorkspaceDefaultChangedEvent
  | WorkspaceMembershipChangedEvent;
```

### Emitting Events

```typescript
// In WorkspacePanel component
const { actions } = usePanelProvider();

const handleWorkspaceSelect = (workspace: Workspace) => {
  setSelectedWorkspace(workspace);

  actions.notifyPanels({
    type: 'workspace:selected',
    source: 'alexandria-workspace-panel',
    timestamp: Date.now(),
    payload: { workspace },
  });
};

const handleWorkspaceCreated = (workspace: Workspace) => {
  actions.notifyPanels({
    type: 'workspace:created',
    source: 'alexandria-workspace-panel',
    timestamp: Date.now(),
    payload: { workspace },
  });
};
```

### Subscribing to Events

```typescript
// In another panel that needs to react to workspace changes
import { usePanelProvider } from '@/contexts/PanelContext';

const MyPanel = () => {
  const { events } = usePanelProvider();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    const unsubscribe = events.on('workspace:selected', (event) => {
      const { workspace } = event.payload;
      setCurrentWorkspace(workspace);
      console.log('Workspace changed:', workspace?.name);

      // Filter content by workspace
      if (workspace) {
        loadWorkspaceContent(workspace.id);
      }
    });

    return unsubscribe; // Cleanup
  }, [events]);

  // ... rest of component
};
```

### Data Slice Integration

```typescript
// In PanelContext.tsx (web-ade application)
const [workspacesSlice, setWorkspacesSlice] = useState<DataSlice<Workspace[]>>({
  scope: 'workspace',
  name: 'workspaces',
  data: null,
  loading: false,
  error: null,
  refresh: async () => {
    setWorkspacesSlice(prev => ({ ...prev, loading: true }));
    try {
      const workspaces = await WorkspaceService.getWorkspaces();
      setWorkspacesSlice(prev => ({
        ...prev,
        data: workspaces,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setWorkspacesSlice(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load workspaces',
      }));
    }
  },
});

const [selectedWorkspaceSlice, setSelectedWorkspaceSlice] = useState<DataSlice<Workspace | null>>({
  scope: 'workspace',
  name: 'selected-workspace',
  data: null,
  loading: false,
  error: null,
  refresh: async () => {
    // No-op or refresh workspace details
  },
});

// Register slices
slices.set('workspaces', workspacesSlice);
slices.set('selected-workspace', selectedWorkspaceSlice);

// Update selected workspace when event is emitted
useEffect(() => {
  const unsubscribe = events.on('workspace:selected', (event) => {
    setSelectedWorkspaceSlice(prev => ({
      ...prev,
      data: event.payload.workspace,
    }));
  });

  return unsubscribe;
}, [events]);
```

---

## Storage & Persistence

### Session Storage

```typescript
// Store selected workspace in session for persistence across page loads
export async function getSession() {
  return getIronSession<SessionData>(cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: 'web-ade-session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    },
  });
}

export interface SessionData {
  user?: {
    id: string;
    // ... user fields
  };
  selectedWorkspaceId?: string; // Persist selected workspace
  workspacePreferences?: {
    sortBy?: 'name' | 'recent' | 'repos';
    viewMode?: 'list' | 'grid';
  };
}
```

### Client-Side Caching (Optional)

```typescript
// Using IndexedDB for offline capability
import { openDB, DBSchema } from 'idb';

interface WorkspaceDB extends DBSchema {
  workspaces: {
    key: string;
    value: Workspace;
    indexes: { 'by-name': string; 'by-updated': string };
  };
  memberships: {
    key: string;
    value: WorkspaceMembership;
    indexes: { 'by-workspace': string; 'by-repository': string };
  };
}

const dbPromise = openDB<WorkspaceDB>('alexandria-workspace-cache', 1, {
  upgrade(db) {
    const workspaceStore = db.createObjectStore('workspaces', { keyPath: 'id' });
    workspaceStore.createIndex('by-name', 'name');
    workspaceStore.createIndex('by-updated', 'updatedAt');

    const membershipStore = db.createObjectStore('memberships', { keyPath: 'id' });
    membershipStore.createIndex('by-workspace', 'workspaceId');
    membershipStore.createIndex('by-repository', 'repositoryId');
  },
});

export async function cacheWorkspaces(workspaces: Workspace[]) {
  const db = await dbPromise;
  const tx = db.transaction('workspaces', 'readwrite');
  await Promise.all([
    ...workspaces.map(workspace => tx.store.put(workspace)),
    tx.done,
  ]);
}

export async function getCachedWorkspaces(): Promise<Workspace[]> {
  const db = await dbPromise;
  return db.getAllFromIndex('workspaces', 'by-name');
}
```

### Real-Time Updates Strategy

#### Option A: Polling with SWR (Simple)

```typescript
// Already implemented via refreshInterval in useSWR
const { data } = useSWR('/api/workspaces', fetcher, {
  refreshInterval: 30000, // Poll every 30 seconds
});
```

#### Option B: Server-Sent Events (Better UX)

```typescript
// app/api/workspaces/events/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode('event: connected\ndata: {"status":"connected"}\n\n'));

      // Subscribe to workspace changes for this user
      const subscription = subscribeToWorkspaceChanges(session.user.id, (event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
      });

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        subscription.unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

```typescript
// Client-side SSE connection
useEffect(() => {
  const eventSource = new EventSource('/api/workspaces/events');

  eventSource.addEventListener('workspace:created', (event) => {
    const { workspace } = JSON.parse(event.data);
    mutate(); // Refresh workspaces
  });

  eventSource.addEventListener('workspace:updated', (event) => {
    const { workspace } = JSON.parse(event.data);
    mutate(); // Refresh workspaces
  });

  eventSource.addEventListener('workspace:deleted', (event) => {
    const { workspaceId } = JSON.parse(event.data);
    mutate(); // Refresh workspaces
  });

  return () => {
    eventSource.close();
  };
}, [mutate]);
```

#### Option C: WebSockets (Advanced - for collaboration)

For real-time collaboration features in the future.

---

## Implementation Plan

### Phase 1: Core Functionality (MVP)

**Goal:** Basic workspace management with CRUD operations

**Tasks:**
1. ✅ Create package structure and documentation
2. ⬜ Set up database schema
   - Create migrations for workspaces and memberships tables
   - Set up Prisma/Drizzle ORM
3. ⬜ Implement API routes
   - GET/POST /api/workspaces
   - PATCH/DELETE /api/workspaces/[id]
   - GET/POST /api/workspaces/[id]/repositories
   - DELETE /api/workspaces/[id]/repositories/[repoId]
4. ⬜ Build core components
   - WorkspacePanel (main list)
   - WorkspaceCard
   - WorkspaceList
   - CreateWorkspaceModal
   - EmptyWorkspaceState
5. ⬜ Implement hooks
   - useWorkspaces (CRUD operations)
   - useWorkspaceSelection (selected state)
6. ⬜ Basic styling with theme integration
7. ⬜ Panel framework integration
   - Event emission
   - Data slice registration

**Deliverables:**
- Functional workspace list
- Create/edit/delete workspaces
- Default workspace selection
- Working example in web-ade

**Timeline:** 2 weeks

---

### Phase 2: Repository Membership

**Goal:** Add repositories to workspaces

**Tasks:**
1. ⬜ Build WorkspaceEntriesPanel
   - Display repositories in selected workspace
   - Empty state when no workspace selected
2. ⬜ Build AddRepositoryModal
   - List all user's repositories
   - Search and filter
   - Exclude already-added repos
3. ⬜ Build RepositoryCard (for workspace view)
   - Show repo metadata
   - Remove button
4. ⬜ Implement useWorkspaceMembers hook
   - Add/remove operations
   - Optimistic updates
5. ⬜ Repository filtering
   - Filter main repo list by selected workspace
   - Show workspace badge on repo cards
6. ⬜ Emit membership events
   - workspace:membership-changed

**Deliverables:**
- Full workspace-repository association
- Add/remove repositories
- Workspace-based filtering

**Timeline:** 1-2 weeks

---

### Phase 3: Enhanced UX

**Goal:** Polish and improve user experience

**Tasks:**
1. ⬜ Inline editing
   - Workspace name editing
   - Keyboard shortcuts (Enter/Esc)
2. ⬜ Workspace color picker
   - Predefined color palette
   - Custom color option
3. ⬜ Drag and drop (optional)
   - Drag repos into workspace cards
   - Drag to reorder workspaces
4. ⬜ Workspace icons/emojis (optional)
   - Icon picker
   - Emoji picker
5. ⬜ Suggested clone path
   - Text input with validation
   - Directory browser (if server-side file access available)
6. ⬜ Loading states
   - Skeleton loaders
   - Button loading indicators
7. ⬜ Error handling
   - Validation errors
   - Network errors
   - Rollback on failure
8. ⬜ Keyboard navigation
   - Arrow keys to navigate list
   - Enter to select
   - Shortcuts for actions

**Deliverables:**
- Polished, professional UI
- Great user experience
- Comprehensive error handling

**Timeline:** 1-2 weeks

---

### Phase 4: Advanced Features

**Goal:** Additional functionality and optimizations

**Tasks:**
1. ⬜ Workspace templates
   - Predefined workspace structures
   - Quick workspace creation
2. ⬜ Repository statistics
   - Show commit activity
   - Show last updated
   - Show contributors
3. ⬜ Bulk operations
   - Add multiple repos at once
   - Remove multiple repos
   - Move repos between workspaces
4. ⬜ Workspace sharing (future)
   - Share workspace with team
   - Permission levels
5. ⬜ Import/export
   - Export workspace config
   - Import from JSON
6. ⬜ Search workspaces
   - Search by name/description
   - Filter by criteria
7. ⬜ Workspace analytics
   - Usage statistics
   - Repository distribution

**Deliverables:**
- Advanced workspace features
- Team collaboration foundation
- Analytics and insights

**Timeline:** 2-3 weeks

---

### Phase 5: Performance & Polish

**Goal:** Optimize and prepare for production

**Tasks:**
1. ⬜ Performance optimization
   - Virtualized lists for large workspace counts
   - Memoization
   - Bundle size optimization
2. ⬜ Real-time updates
   - Server-Sent Events implementation
   - Instant sync across tabs
3. ⬜ Offline support
   - IndexedDB caching
   - Optimistic updates
   - Sync on reconnect
4. ⬜ Accessibility
   - ARIA labels
   - Keyboard navigation
   - Screen reader support
5. ⬜ Testing
   - Unit tests (components, hooks)
   - Integration tests (API routes)
   - E2E tests (user flows)
6. ⬜ Storybook documentation
   - Component stories
   - Interactive examples
7. ⬜ Error boundaries
   - Graceful degradation
   - Error reporting

**Deliverables:**
- Production-ready package
- Comprehensive test coverage
- Full documentation

**Timeline:** 2 weeks

---

## Technical Specifications

### Browser Support

- Chrome/Edge: >= 90
- Firefox: >= 88
- Safari: >= 14

### Dependencies

**Core:**
- `react` >= 19.0.0
- `@principal-ade/panel-framework-core` >= 0.1.0
- `@a24z/industry-theme` >= 0.1.2

**Additional:**
- `lucide-react` >= 0.553.0
- `swr` >= 2.0.0 (for data fetching)
- `iron-session` >= 8.0.0 (for session management)
- `prisma` or `drizzle-orm` (for database access)

**Dev:**
- `typescript` >= 5.0.0
- `esbuild` >= 0.25.0
- `storybook` >= 10.0.0

### Bundle Size Target

- Main bundle: < 60KB (gzipped)
- With all dependencies: < 180KB (gzipped)

### Performance Metrics

- First Contentful Paint: < 1s
- Time to Interactive: < 2s
- Workspace list render: < 100ms (50 workspaces)

---

## Conclusion

This design document outlines the architecture for `@principal-ade/alexandria-workspace-panel`, a web-based workspace management panel based on the Alexandria system from the desktop-app.

The package provides:
- **Workspace CRUD** - Full create, read, update, delete operations
- **Repository membership** - Add/remove repositories to/from workspaces
- **Workspace selection** - Active workspace context for filtering
- **Panel integration** - Events and data slices for inter-panel communication
- **Multi-user support** - Database-backed with user authentication
- **Real-time updates** - SSE or polling for instant synchronization

Key adaptations for web:
- Database storage instead of local JSON files
- Multi-user authentication and authorization
- API routes instead of Electron IPC
- SWR for data fetching and caching
- Optional SSE for real-time updates
- Session-based selected workspace persistence

The phased implementation plan allows for incremental delivery starting with core CRUD functionality and building up to advanced features and optimizations.

---

**Document Version:** 1.0.0
**Last Updated:** 2025-01-13
**Author:** Principal ADE Team
**Status:** Planning / Not Started
