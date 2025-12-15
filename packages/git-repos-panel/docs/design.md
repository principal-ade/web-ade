# Git Repos Panel - Architecture & Design Document

> **Reference Implementation:** Alexandria Workspace List Panel (desktop-app/electron-app)
> **Target Platform:** Web (Next.js) with Panel Framework Core
> **Package:** `@principal-ade/git-repos-panel`

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Patterns from Reference](#architecture-patterns-from-reference)
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

The Git Repos Panel provides a GitHub repository browser for web-based Principal ADE workspaces. It displays repositories for the authenticated user with filtering, sorting, and selection capabilities.

### Core Responsibilities

1. **Display GitHub repositories** for authenticated users
2. **Handle OAuth authentication** flow with GitHub
3. **Enable repository selection** for workspace integration
4. **Emit panel events** when repositories are selected/cloned
5. **Integrate with panel framework** data slices and actions

### Reference Implementation Analysis

The Alexandria Workspace List Panel provides the following patterns we'll adapt:

| Desktop Pattern | Web Adaptation |
|----------------|----------------|
| IPC event-driven updates | Server Actions / API routes with polling |
| Electron service layer | Next.js API routes + React hooks |
| Main process storage | Server-side session storage |
| Window.mainProcess API | fetch() API calls |
| Event subscriptions | SWR/React Query for polling |
| Local file system access | GitHub API via OAuth |

---

## Architecture Patterns from Reference

### 1. Event-Driven Updates Pattern

**Desktop Implementation:**
```typescript
// Renderer subscribes to main process events
const unsubscribe = WorkspaceService.onWorkspaceChange((event) => {
  loadWorkspaces(); // Reload on any change
});
```

**Web Adaptation:**
```typescript
// Use SWR for automatic revalidation
const { data: repos, mutate } = useSWR('/api/github/repos', fetcher, {
  refreshInterval: 30000, // Poll every 30s
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
});

// Manual refresh
const refreshRepos = () => mutate();
```

### 2. Service Layer Abstraction Pattern

**Desktop Implementation:**
```typescript
export class WorkspaceService {
  static async getWorkspaces(): Promise<Workspace[]> {
    return window.mainProcess.workspace.getWorkspaces();
  }

  static onWorkspaceChange(callback: Function): () => void {
    return window.mainProcess.workspace.onWorkspaceChange(callback);
  }
}
```

**Web Adaptation:**
```typescript
export class GitHubRepoService {
  static async getRepositories(): Promise<GitRepository[]> {
    const response = await fetch('/api/github/repos');
    if (!response.ok) throw new Error('Failed to fetch repos');
    return response.json();
  }

  static async selectRepository(repo: GitRepository): Promise<void> {
    const response = await fetch('/api/workspace/select-repo', {
      method: 'POST',
      body: JSON.stringify({ repository: repo }),
    });
    if (!response.ok) throw new Error('Failed to select repo');
  }
}
```

### 3. Inline Editing Pattern

**Reusable from Desktop:**
```typescript
// Same pattern works in both environments
const [isEditing, setIsEditing] = useState(false);
const [editedName, setEditedName] = useState(item.name);

const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') handleSave();
  if (e.key === 'Escape') handleCancel();
};
```

### 4. Optimistic UI Updates Pattern

**Desktop Implementation:**
```typescript
setIsSaving(true);
try {
  await WorkspaceService.updateWorkspace(id, updates);
  setIsEditing(false);
} catch (error) {
  setEditedName(originalName); // Revert
}
```

**Web Adaptation (with SWR):**
```typescript
const { data, mutate } = useSWR('/api/github/repos');

const handleUpdate = async (updates) => {
  // Optimistic update
  mutate(optimisticData, false);

  try {
    await fetch('/api/github/repos', { method: 'PATCH', body: JSON.stringify(updates) });
    mutate(); // Revalidate
  } catch (error) {
    mutate(data); // Revert
  }
};
```

---

## Adaptations for Web Platform

### Key Differences: Desktop vs Web

| Aspect | Desktop (Electron) | Web (Next.js) |
|--------|-------------------|---------------|
| **Authentication** | OS credentials / GitHub App | OAuth 2.0 with PKCE |
| **Data Storage** | Local filesystem (JSON) | Session storage + Database |
| **Real-time Updates** | IPC event broadcast | Polling / Server-Sent Events |
| **API Access** | Direct filesystem / git CLI | REST APIs (GitHub, Backend) |
| **State Management** | React hooks + IPC events | React hooks + SWR/React Query |
| **Panel Communication** | Electron BrowserWindow | Panel Framework EventBus |

### Web-Specific Considerations

1. **OAuth Flow Implementation**
   - PKCE for security (no client secret in browser)
   - Token storage in secure HTTP-only cookies
   - Refresh token rotation

2. **No Direct Git Access**
   - Use GitHub REST API for repository metadata
   - Server-side git operations for cloning (if needed)
   - Potential integration with GitHub GraphQL API for performance

3. **Session Management**
   - Iron Session for secure session storage
   - Token refresh on expiry
   - Logout and cleanup

4. **Panel Event Communication**
   - Use `PanelEventBus` from `@principal-ade/panel-framework-core`
   - Emit events via `actions.notifyPanels()`
   - Subscribe via `events.on()`

---

## Component Structure

### Directory Layout

```
packages/git-repos-panel/
├── src/
│   ├── components/
│   │   ├── GitReposPanel.tsx          # Main panel component
│   │   ├── RepositoryCard.tsx         # Individual repo display
│   │   ├── RepositoryList.tsx         # Scrollable list
│   │   ├── RepositoryHeader.tsx       # Header with search/filter
│   │   ├── EmptyRepositoryState.tsx   # Empty state component
│   │   └── AuthPrompt.tsx             # Login prompt when not authenticated
│   ├── hooks/
│   │   ├── useGitRepos.ts            # Main hook for repo data
│   │   ├── useGitHubAuth.ts          # Authentication hook
│   │   └── useRepositoryFilter.ts     # Search/filter logic
│   ├── services/
│   │   ├── GitHubRepoService.ts      # API abstraction layer
│   │   └── AuthService.ts            # Auth flow helpers
│   ├── types/
│   │   ├── GitRepository.ts          # Type definitions
│   │   ├── GitReposPanelProps.ts     # Component props
│   │   └── PanelEvents.ts            # Event type definitions
│   ├── utils/
│   │   ├── formatters.ts             # Date/time formatters
│   │   ├── languageColors.ts         # Programming language colors
│   │   └── sortRepositories.ts       # Sorting utilities
│   ├── styles/
│   │   └── git-repos-panel.css       # Optional CSS
│   └── index.ts                       # Main exports
├── package.json
├── tsconfig.json
├── README.md
├── DESIGN.md                           # This file
├── API.md                              # API reference
└── EXAMPLES.md                         # Usage examples
```

### Component Hierarchy

```
GitReposPanel (Main Container)
├── AuthPrompt (if not authenticated)
└── (if authenticated)
    ├── RepositoryHeader
    │   ├── Search Input
    │   ├── Filter Dropdown
    │   ├── Sort Dropdown
    │   └── Refresh Button
    ├── RepositoryList
    │   └── RepositoryCard[] (map over repos)
    │       ├── Repository Icon/Avatar
    │       ├── Repository Name
    │       ├── Repository Description
    │       ├── Repository Metadata
    │       │   ├── Language Badge
    │       │   ├── Stars Count
    │       │   ├── Branch Display
    │       │   └── Privacy Badge
    │       └── Last Updated Time
    └── EmptyRepositoryState (if no repos)
```

---

## Data Flow & State Management

### State Management Architecture

Following the desktop pattern but adapted for web:

```typescript
// Component-level state with SWR
const GitReposPanel: React.FC = () => {
  // Authentication state
  const { user, loading: authLoading } = useGitHubAuth();

  // Repository data with automatic revalidation
  const {
    data: repos,
    error,
    isLoading,
    mutate: refreshRepos,
  } = useSWR<GitRepository[]>(
    user ? '/api/github/repos' : null,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'stars'>('updated');
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null);

  // Derived state
  const filteredRepos = useRepositoryFilter(repos, searchQuery, sortBy);

  // Panel context for actions
  const { actions } = usePanelProvider();

  const handleRepoSelect = useCallback((repo: GitRepository) => {
    setSelectedRepo(repo);

    // Emit panel event
    actions.notifyPanels({
      type: 'repository:selected',
      source: 'git-repos-panel',
      timestamp: Date.now(),
      payload: { repository: repo },
    });
  }, [actions]);

  // ... render logic
};
```

### Data Slice Integration

Following Panel Framework Core pattern:

```typescript
// In PanelContext.tsx (web-ade application)
const [gitReposSlice, setGitReposSlice] = useState<DataSlice<GitRepository[]>>({
  scope: 'workspace',
  name: 'git-repos',
  data: null,
  loading: false,
  error: null,
  refresh: async () => {
    setGitReposSlice(prev => ({ ...prev, loading: true }));
    try {
      const repos = await GitHubRepoService.getRepositories();
      setGitReposSlice(prev => ({
        ...prev,
        data: repos,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setGitReposSlice(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load repos',
      }));
    }
  },
});

// Register slice
slices.set('git-repos', gitReposSlice);
```

### Hook: useGitRepos

```typescript
export interface UseGitReposReturn {
  repos: GitRepository[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectRepository: (repo: GitRepository) => void;
  selectedRepository: GitRepository | null;
}

export function useGitRepos(options?: UseGitReposOptions): UseGitReposReturn {
  const { context, actions } = usePanelProvider();
  const { user } = useGitHubAuth();

  const {
    data: repos = [],
    error,
    isLoading,
    mutate,
  } = useSWR<GitRepository[]>(
    user ? '/api/github/repos' : null,
    GitHubRepoService.getRepositories,
    {
      refreshInterval: options?.refreshInterval ?? 30000,
      revalidateOnFocus: options?.revalidateOnFocus ?? true,
    }
  );

  const [selectedRepository, setSelectedRepository] = useState<GitRepository | null>(null);

  const selectRepository = useCallback((repo: GitRepository) => {
    setSelectedRepository(repo);
    actions.notifyPanels({
      type: 'repository:selected',
      source: 'git-repos-panel',
      timestamp: Date.now(),
      payload: { repository: repo },
    });
  }, [actions]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    repos,
    loading: isLoading,
    error: error?.message ?? null,
    refresh,
    selectRepository,
    selectedRepository,
  };
}
```

---

## API Integration

### GitHub OAuth Flow

Following PKCE (Proof Key for Code Exchange) for security:

```typescript
// 1. Generate code verifier and challenge
export function generatePKCEChallenge(): { verifier: string; challenge: string } {
  const verifier = generateRandomString(128);
  const challenge = base64URLEncode(sha256(verifier));
  return { verifier, challenge };
}

// 2. Redirect to GitHub authorization
export function initiateGitHubAuth() {
  const { verifier, challenge } = generatePKCEChallenge();

  // Store verifier in session
  sessionStorage.setItem('pkce_verifier', verifier);

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
    redirect_uri: `${window.location.origin}/api/auth/callback`,
    scope: 'repo read:user',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

// 3. Handle callback (API route)
export async function POST(request: Request) {
  const { code } = await request.json();
  const session = await getSession();
  const verifier = session.pkceVerifier;

  // Exchange code for token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: verifier,
    }),
  });

  const { access_token, refresh_token } = await tokenResponse.json();

  // Store in secure session
  session.accessToken = access_token;
  session.refreshToken = refresh_token;
  await session.save();

  return NextResponse.json({ success: true });
}
```

### API Routes Structure

```
app/api/
├── auth/
│   ├── login/route.ts           # Initiate OAuth flow
│   ├── callback/route.ts        # Handle OAuth callback
│   ├── logout/route.ts          # Clear session
│   ├── me/route.ts              # Get current user
│   └── refresh/route.ts         # Refresh access token
├── github/
│   ├── repos/
│   │   ├── route.ts             # GET: List repos, POST: Create repo
│   │   └── [id]/route.ts        # GET: Repo details, PATCH: Update, DELETE: Delete
│   ├── repo/
│   │   └── [owner]/
│   │       └── [repo]/
│   │           ├── branches/route.ts      # Get branches
│   │           ├── commits/route.ts       # Get commits
│   │           └── clone/route.ts         # Clone repo (server-side)
│   └── user/route.ts            # Get authenticated user info
└── workspace/
    └── select-repo/route.ts     # Select repo for workspace
```

### API Route Implementation Examples

#### GET /api/github/repos

```typescript
// app/api/github/repos/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'updated';
    const perPage = parseInt(searchParams.get('per_page') || '100');
    const page = parseInt(searchParams.get('page') || '1');

    // Fetch from GitHub API
    const response = await fetch(
      `https://api.github.com/user/repos?sort=${sort}&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 401) {
      // Token expired, try refresh
      const refreshed = await refreshAccessToken(session);
      if (!refreshed) {
        return NextResponse.json(
          { error: 'Authentication expired' },
          { status: 401 }
        );
      }
      // Retry with new token
      return GET(request);
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json();

    // Transform to our format
    const transformedRepos: GitRepository[] = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      default_branch: repo.default_branch,
      language: repo.language,
      updated_at: repo.updated_at,
      stargazers_count: repo.stargazers_count,
      private: repo.private,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
    }));

    return NextResponse.json(transformedRepos);
  } catch (error) {
    console.error('Error fetching GitHub repos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
```

#### POST /api/workspace/select-repo

```typescript
// app/api/workspace/select-repo/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { repository } = await request.json();

    // Store selected repository in session
    session.selectedRepository = repository;
    await session.save();

    // Optionally: Persist to database
    // await db.userSettings.upsert({
    //   where: { userId: session.user.id },
    //   update: { selectedRepositoryId: repository.id },
    //   create: { userId: session.user.id, selectedRepositoryId: repository.id },
    // });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error selecting repository:', error);
    return NextResponse.json(
      { error: 'Failed to select repository' },
      { status: 500 }
    );
  }
}
```

---

## User Interaction Flows

### 1. Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: GitHub OAuth Authentication                      │
└─────────────────────────────────────────────────────────────┘

1. User visits web-ade editor
   └─> GitReposPanel renders
       └─> No session found
           └─> Shows AuthPrompt component

2. User clicks "Connect GitHub"
   └─> initiateGitHubAuth() called
       ├─> Generate PKCE verifier + challenge
       ├─> Store verifier in sessionStorage
       └─> Redirect to github.com/login/oauth/authorize

3. User authorizes on GitHub
   └─> GitHub redirects to /api/auth/callback?code=xyz
       └─> Callback route:
           ├─> Retrieve verifier from session
           ├─> Exchange code + verifier for tokens
           ├─> Store tokens in iron-session (HTTP-only cookie)
           ├─> Fetch user info from GitHub
           └─> Redirect to /editor

4. User returns to editor
   └─> GitReposPanel re-renders
       ├─> Session found → user authenticated
       ├─> Calls /api/github/repos
       └─> Displays repository list
```

### 2. Viewing Repositories Flow

```typescript
// Component lifecycle
useEffect(() => {
  // 1. Check authentication
  const checkAuth = async () => {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const user = await response.json();
      setUser(user);
    }
  };

  checkAuth();
}, []);

// 2. Fetch repositories (via SWR)
const { data: repos } = useSWR(
  user ? '/api/github/repos' : null,
  fetcher,
  { refreshInterval: 30000 }
);

// 3. Apply filters
const filteredRepos = useMemo(() => {
  let filtered = repos || [];

  // Search filter
  if (searchQuery) {
    filtered = filtered.filter(repo =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Sort
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'stars':
        return b.stargazers_count - a.stargazers_count;
      case 'updated':
      default:
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
  });

  return filtered;
}, [repos, searchQuery, sortBy]);
```

### 3. Selecting a Repository Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User Flow: Selecting a Repository                           │
└─────────────────────────────────────────────────────────────┘

1. User clicks on RepositoryCard
   └─> handleRepoSelect(repo) called
       ├─> Update local state: setSelectedRepo(repo)
       ├─> Call API: POST /api/workspace/select-repo
       │   └─> Store in session
       └─> Emit panel event:
           actions.notifyPanels({
             type: 'repository:selected',
             payload: { repository: repo }
           })

2. Other panels listen for event
   └─> Example: FileTreePanel
       events.on('repository:selected', (event) => {
         const { repository } = event.payload;
         loadRepositoryFiles(repository);
       })

3. UI updates
   └─> RepositoryCard shows selected state
   └─> Optional: Slide out panel with repo details
```

### 4. Refreshing Repositories Flow

```typescript
const handleRefresh = async () => {
  setIsRefreshing(true);
  try {
    // SWR mutate triggers revalidation
    await mutate();
  } finally {
    setIsRefreshing(false);
  }
};

// Button in header
<button
  onClick={handleRefresh}
  disabled={isRefreshing}
  aria-label="Refresh repositories"
>
  <RefreshCw
    size={14}
    className={isRefreshing ? 'animate-spin' : ''}
  />
</button>
```

### 5. Search and Filter Flow

```typescript
// Debounced search
const [searchQuery, setSearchQuery] = useState('');
const debouncedSearch = useDebouncedValue(searchQuery, 300);

// Filter in useMemo for performance
const filteredRepos = useMemo(() => {
  return repos.filter(repo => {
    const matchesSearch = !debouncedSearch ||
      repo.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      repo.description?.toLowerCase().includes(debouncedSearch.toLowerCase());

    const matchesLanguage = !languageFilter ||
      repo.language === languageFilter;

    const matchesPrivacy = privacyFilter === 'all' ||
      (privacyFilter === 'public' && !repo.private) ||
      (privacyFilter === 'private' && repo.private);

    return matchesSearch && matchesLanguage && matchesPrivacy;
  });
}, [repos, debouncedSearch, languageFilter, privacyFilter]);
```

---

## Panel Framework Integration

### Panel Registration

```typescript
// In web-ade application: src/app/editor/page.tsx
import { GitReposPanel } from '@principal-ade/git-repos-panel';
import { EditableConfigurablePanelLayout } from '@principal-ade/panel-layouts';

const panelDefinitions = [
  {
    id: 'git-repos',
    label: 'My Repositories',
    icon: <Github size={16} />,
    component: GitReposPanel,
    defaultWidth: 300,
    minWidth: 250,
    maxWidth: 600,
  },
  // ... other panels
];

const defaultLayout = {
  left: {
    type: 'tabs',
    panels: ['git-repos', 'file-tree'],
    defaultActiveTab: 0,
  },
  middle: {
    type: 'tabs',
    panels: ['editor'],
  },
};

export default function EditorPage() {
  return (
    <PanelProvider>
      <EditableConfigurablePanelLayout
        panels={panelDefinitions}
        layout={defaultLayout}
      />
    </PanelProvider>
  );
}
```

### Event Types Definition

```typescript
// src/types/PanelEvents.ts
import type { PanelEvent } from '@principal-ade/panel-framework-core';

export interface RepositorySelectedEvent extends PanelEvent {
  type: 'repository:selected';
  payload: {
    repository: GitRepository;
  };
}

export interface RepositoryClonedEvent extends PanelEvent {
  type: 'repository:cloned';
  payload: {
    repository: GitRepository;
    localPath: string;
  };
}

export interface RepositoryRefreshEvent extends PanelEvent {
  type: 'repository:refresh';
  payload: {
    repositoryId: number;
  };
}

export type GitReposPanelEvent =
  | RepositorySelectedEvent
  | RepositoryClonedEvent
  | RepositoryRefreshEvent;
```

### Emitting Events

```typescript
// In GitReposPanel component
const { actions } = usePanelProvider();

const handleRepoSelect = (repo: GitRepository) => {
  actions.notifyPanels({
    type: 'repository:selected',
    source: 'git-repos-panel',
    timestamp: Date.now(),
    payload: { repository: repo },
  });
};
```

### Subscribing to Events

```typescript
// In another panel (e.g., FileTreePanel)
import { usePanelProvider } from '@/contexts/PanelContext';

const FileTreePanel = () => {
  const { events } = usePanelProvider();

  useEffect(() => {
    const unsubscribe = events.on('repository:selected', (event) => {
      const { repository } = event.payload;
      console.log('Repository selected:', repository.name);
      loadFilesForRepository(repository);
    });

    return unsubscribe; // Cleanup
  }, [events]);

  // ... rest of component
};
```

---

## Storage & Persistence

### Session Storage (Server-Side)

Using `iron-session` for secure, encrypted session cookies:

```typescript
// lib/auth/session.ts
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  user?: {
    id: string;
    login: string;
    name: string;
    email: string;
    avatar_url: string;
  };
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  selectedRepository?: GitRepository;
  pkceVerifier?: string;
}

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
```

### Client-Side State (Optional)

For performance and offline capability:

```typescript
// Using IndexedDB for caching repository data
import { openDB, DBSchema } from 'idb';

interface GitReposDB extends DBSchema {
  repos: {
    key: number;
    value: GitRepository;
    indexes: { 'by-name': string; 'by-updated': string };
  };
}

const dbPromise = openDB<GitReposDB>('git-repos-cache', 1, {
  upgrade(db) {
    const repoStore = db.createObjectStore('repos', { keyPath: 'id' });
    repoStore.createIndex('by-name', 'name');
    repoStore.createIndex('by-updated', 'updated_at');
  },
});

export async function cacheRepositories(repos: GitRepository[]) {
  const db = await dbPromise;
  const tx = db.transaction('repos', 'readwrite');
  await Promise.all([
    ...repos.map(repo => tx.store.put(repo)),
    tx.done,
  ]);
}

export async function getCachedRepositories(): Promise<GitRepository[]> {
  const db = await dbPromise;
  return db.getAllFromIndex('repos', 'by-updated');
}
```

### Data Persistence Strategy

1. **Hot Data (Session):**
   - Access token, refresh token
   - Current user info
   - Selected repository
   - PKCE verifier (temporary)

2. **Warm Data (IndexedDB - Optional):**
   - Repository list cache
   - Last sync timestamp
   - User preferences

3. **Cold Data (Server/Database - Future):**
   - User workspace configurations
   - Repository favorites/pins
   - Custom repository metadata
   - Activity logs

---

## Implementation Plan

### Phase 1: Core Functionality (MVP)

**Goal:** Basic repository listing with authentication

**Tasks:**
1. ✅ Set up package structure
2. ✅ Create type definitions
3. ⬜ Implement OAuth flow
   - Login route
   - Callback route
   - Session management
4. ⬜ Build core components
   - GitReposPanel (main)
   - RepositoryCard
   - RepositoryList
   - AuthPrompt
5. ⬜ Create API routes
   - GET /api/github/repos
   - GET /api/auth/me
   - POST /api/auth/logout
6. ⬜ Implement useGitRepos hook
7. ⬜ Basic styling with theme integration
8. ⬜ Write documentation
   - README.md
   - API.md
   - EXAMPLES.md

**Deliverables:**
- Functional authentication flow
- Repository list display
- Basic panel integration
- Working example in web-ade

**Timeline:** 1-2 weeks

---

### Phase 2: Enhanced UX

**Goal:** Search, filter, and better interactions

**Tasks:**
1. ⬜ Implement search functionality
   - Debounced search input
   - Highlight matches
2. ⬜ Add filtering
   - By language
   - By privacy (public/private)
   - By date range
3. ⬜ Add sorting
   - By name, stars, updated date
   - Ascending/descending toggle
4. ⬜ Improve loading states
   - Skeleton loaders
   - Progressive loading
5. ⬜ Add empty states
   - No repositories
   - Search no results
   - Error states
6. ⬜ Repository details slide-out
   - Show more metadata
   - Quick actions (clone, open in GitHub)
7. ⬜ Keyboard shortcuts
   - Navigate list with arrow keys
   - Select with Enter
   - Search focus with /

**Deliverables:**
- Polished user experience
- Fast, responsive interactions
- Comprehensive empty/error states

**Timeline:** 1 week

---

### Phase 3: Advanced Features

**Goal:** Repository operations and integration

**Tasks:**
1. ⬜ Repository cloning (server-side)
   - API route for clone
   - Progress indication
   - Local repository registry
2. ⬜ Branch visualization
   - Show all branches
   - Default branch indicator
3. ⬜ Commit history preview
   - Recent commits
   - Commit details
4. ⬜ GitHub Actions status
   - Latest workflow runs
   - Status badges
5. ⬜ Pull request preview
   - Open PRs count
   - PR details
6. ⬜ Repository health metrics
   - Code quality indicators
   - Security alerts
7. ⬜ Local/remote sync status
   - Show cloned repositories
   - Sync indicators

**Deliverables:**
- Full repository management
- GitHub integration features
- Local repository tracking

**Timeline:** 2-3 weeks

---

### Phase 4: Performance & Polish

**Goal:** Optimize and refine

**Tasks:**
1. ⬜ Performance optimization
   - Virtualized list for large repo counts
   - Image lazy loading
   - API response caching
2. ⬜ Offline support
   - IndexedDB caching
   - Service worker (optional)
3. ⬜ Accessibility improvements
   - ARIA labels
   - Keyboard navigation
   - Screen reader support
4. ⬜ Testing
   - Unit tests (components, hooks)
   - Integration tests (API routes)
   - E2E tests (user flows)
5. ⬜ Storybook documentation
   - Component stories
   - Interactive examples
6. ⬜ Error boundaries
   - Graceful error handling
   - Error reporting
7. ⬜ Analytics (optional)
   - Usage tracking
   - Error monitoring

**Deliverables:**
- Production-ready package
- Comprehensive test coverage
- Full documentation

**Timeline:** 2 weeks

---

### Phase 5: Future Enhancements

**Ideas for future iterations:**

1. **GraphQL API Integration**
   - Faster queries with GraphQL
   - Reduced API calls
   - Better rate limit management

2. **Multiple Git Providers**
   - GitLab support
   - Bitbucket support
   - Generic Git server support

3. **Collaboration Features**
   - Share workspaces
   - Team repositories
   - Collaborative filtering

4. **Advanced Search**
   - Code search within repositories
   - Semantic search
   - Saved searches

5. **Customization**
   - Custom repository badges
   - Color coding
   - Tag management

6. **Integrations**
   - Jira/Linear issues
   - CI/CD status
   - Dependency alerts

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

**Dev:**
- `typescript` >= 5.0.0
- `esbuild` >= 0.25.0
- `storybook` >= 10.0.0

### Bundle Size Target

- Main bundle: < 50KB (gzipped)
- With all dependencies: < 150KB (gzipped)

### Performance Metrics

- First Contentful Paint: < 1s
- Time to Interactive: < 2s
- Repository list render: < 100ms (100 repos)

---

## Conclusion

This design document outlines the architecture for `@principal-ade/git-repos-panel`, a web-based GitHub repository browser panel following patterns established by the Alexandria Workspace List Panel in the desktop-app.

Key adaptations for the web platform include:
- OAuth 2.0 with PKCE for authentication
- Next.js API routes replacing Electron IPC
- SWR for data fetching and revalidation
- Iron Session for secure session management
- Panel Framework Core for inter-panel communication

The phased implementation plan allows for incremental delivery of value while maintaining high code quality and user experience standards.

---

**Document Version:** 1.0.0
**Last Updated:** 2025-01-13
**Author:** Principal ADE Team
**Status:** Planning / Not Started
