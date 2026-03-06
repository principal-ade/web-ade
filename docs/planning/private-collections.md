# Private Collections & Org Support Implementation Plan

## Overview

Refactor the collections system to support:
1. **Hybrid GitHub repos**: Public repo by default, private repo on-demand
2. **Organization support**: Both public and private repos for orgs
3. **Location abstraction**: Extensible design for future local storage
4. **Rename**: `web-ade-collections` → `principal-ai-collections`

No backward compatibility needed (alpha, single user).

---

## Architecture: Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                    web-ade (GitHub-specific)                │
├─────────────────────────────────────────────────────────────┤
│  • Repo creation (POST /user/repos, /orgs/{org}/repos)      │
│  • Repo existence checks                                    │
│  • Permission checks (collaborators API, org teams API)     │
│  • Owner type detection (user vs organization)              │
│  • Repo naming (principal-ai-collections[-private])         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              @principal-ai/alexandria-collections           │
├─────────────────────────────────────────────────────────────┤
│  CollectionStorageAdapter (file operations)                 │
│  • createCollection() - with visibility, owner, ownerType   │
│  • updateCollection() - with visibility updates             │
│  • getCollections(), deleteCollection()                     │
│  • addRepository(), removeRepository()                      │
│  • Region and layout operations                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHubFileSystemAdapter (web-ade)              │
├─────────────────────────────────────────────────────────────┤
│  • readFile(), writeFile(), deleteFile()                    │
│  • readDir(), exists()                                      │
│  • Implements FileSystemAdapter interface                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Repositories Affected

| Repository | Scope |
|------------|-------|
| `@principal-ai/alexandria-collections` | Collection type + adapter (file operations) |
| `web-ade` | GitHub infrastructure (repos, permissions) + UI |

---

## Repo Matrix

| Owner Type | Visibility | Repo Name |
|------------|------------|-----------|
| User | Public | `principal-ai-collections` |
| User | Private | `principal-ai-collections-private` |
| Org | Public | `principal-ai-collections` |
| Org | Private | `principal-ai-collections-private` |

---

## Phase 0: @principal-ai/alexandria-collections Changes

**Scope**: Collection data model + file operations only. No GitHub-specific logic.

### 0.1 Update Collection type in `src/types.ts`

```typescript
export interface Collection {
  id: string;
  name: string;
  description?: string;
  theme?: string;
  icon?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
  suggestedClonePath?: string;
  metadata?: CollectionMetadata;
  members: CollectionMembership[];

  // NEW FIELDS
  visibility?: 'public' | 'private';  // Default: 'public' for backward compat
  owner?: string;                      // Username or org name
  ownerType?: 'user' | 'organization';
}
```

### 0.2 Update CollectionStorageAdapter in `src/CollectionStorageAdapter.ts`

```typescript
// Update createCollection input type
createCollection(input: {
  name: string;
  description?: string;
  icon?: string;
  theme?: string;
  isDefault?: boolean;
  suggestedClonePath?: string;
  metadata?: Record<string, unknown>;
  // NEW
  visibility?: 'public' | 'private';
  owner?: string;
  ownerType?: 'user' | 'organization';
}): Promise<Collection>;

// Update updateCollection to allow visibility changes
updateCollection(id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt' | 'members'>>): Promise<Collection>;
// ^ visibility, owner, ownerType now included in allowed updates
```

### 0.3 Publish new version

- Bump version (minor: 1.5.0)
- Publish to npm
- Update web-ade dependency

---

## Phase 1: GitHub Infrastructure (web-ade)

**Scope**: Repo creation, existence checks, permissions - GitHub-specific logic that stays outside the adapter.

### 1.1 New types in `src/types/api/collections.ts`

```typescript
// Storage location types (extensible for future local storage)
export type CollectionStorageType = 'github';

export interface GitHubStorageLocation {
  type: 'github';
  owner: string;
  ownerType: 'user' | 'organization';
  visibility: 'public' | 'private';
  repoName: string;
  repoUrl: string;
}

export type CollectionStorageLocation = GitHubStorageLocation;

export interface ResolvedStorageTarget {
  location: CollectionStorageLocation;
  exists: boolean;
  canWrite: boolean;
  canRead: boolean;
}
```

### 1.2 New file: `src/lib/collections/github-repo-manager.ts`

GitHub-specific repo management (NOT file operations):

```typescript
const PUBLIC_REPO = 'principal-ai-collections';
const PRIVATE_REPO = 'principal-ai-collections-private';

// Repo creation - handles user vs org
export async function createCollectionsRepo(
  token: string,
  owner: string,
  ownerType: 'user' | 'organization',
  visibility: 'public' | 'private'
): Promise<{ success: boolean; repoUrl?: string; error?: string }>;

// Check if repo exists
export async function checkRepoExists(
  token: string,
  owner: string,
  repoName: string
): Promise<boolean>;

// Permission checks - different for user vs org repos
export async function checkPermissions(
  token: string,
  owner: string,
  repoName: string,
  ownerType: 'user' | 'organization'
): Promise<{ canEdit: boolean; permission: string }>;

// Detect if username is user or org
export async function determineOwnerType(
  token: string,
  username: string
): Promise<'user' | 'organization'>;

// Get repo name from visibility
export function getRepoName(visibility: 'public' | 'private'): string;
```

---

## Phase 2: API Route Refactor (web-ade)

**Key change**: Use `CollectionStorageAdapter` + `GitHubFileSystemAdapter` consistently instead of manual GitHub API calls.

### 2.1 `src/app/api/github/collections/route.ts`

**Before**: Manual `getFile()`, `saveFile()`, directory listing
**After**: Use adapter for file operations, custom code only for repo management

```typescript
import { CollectionStorageAdapter } from '@principal-ai/alexandria-collections';
import { GitHubFileSystemAdapter } from '@/lib/server/GitHubFileSystemAdapter';
import { createCollectionsRepo, checkRepoExists, getRepoName } from '@/lib/collections/github-repo-manager';

export async function POST(request: NextRequest) {
  const { visibility = 'public', owner, ownerType = 'user' } = await request.json();
  const repoName = getRepoName(visibility);

  // 1. Repo management (custom code)
  if (!await checkRepoExists(token, owner, repoName)) {
    await createCollectionsRepo(token, owner, ownerType, visibility);
  }

  // 2. File operations (use adapter)
  const fsAdapter = new GitHubFileSystemAdapter(owner, repoName, 'main', token);
  const storage = new CollectionStorageAdapter('/', fsAdapter);

  // Use storage.createCollection(), storage.updateCollection(), etc.
}
```

### 2.2 `src/app/api/github/collections/[username]/route.ts`

**Changes:**
- Use adapter for reading collections
- Query BOTH public and private repos, merge results
- Include `visibility` in response based on which repo

### 2.3 `src/app/api/github/collections/[username]/permissions/route.ts`

**Changes:**
- Detect owner type (user vs org)
- For orgs: use `GET /repos/{owner}/{repo}` (returns `permissions` object)
- Return permissions for BOTH public and private repos

### 2.4 `src/app/api/github/collections/[username]/regions/route.ts`

**Changes:**
- Accept `visibility` param to target correct repo
- Use `getRepoName(visibility)` instead of hardcoded name

---

## Phase 3: Context Updates

### 3.1 `src/contexts/UserCollectionsContext.tsx`

**Add to context:**
```typescript
visibility: 'public' | 'private';
setVisibility: (v: 'public' | 'private') => void;
currentOwner: string | null;
currentOwnerType: 'user' | 'organization';
setCurrentOwner: (owner: string, type: 'user' | 'organization') => void;
storageLocations: {
  public: ResolvedStorageTarget | null;
  private: ResolvedStorageTarget | null;
};
```

**Update methods:**
- `saveToGitHub()` → pass visibility to API
- `loadFromGitHub()` → fetch from both repos, merge
- `enableGitHub()` → accept visibility param

---

## Phase 4: UI Updates

### 4.1 `src/components/collections/GitHubSyncModal.tsx`

- Add visibility toggle (Public / Private)
- Show correct repo name based on selection
- Optionally: org selector dropdown (list user's orgs)

### 4.2 Collection indicators

- Show lock icon for private collections
- Show org icon for org-owned collections

---

## Key Files to Modify

### @principal-ai/alexandria-collections

| File | Changes |
|------|---------|
| `src/types.ts` | Add `visibility`, `owner`, `ownerType` to Collection |
| `src/CollectionStorageAdapter.ts` | Accept visibility/owner in createCollection() |

### web-ade

| File | Changes |
|------|---------|
| `src/types/api/collections.ts` | Add `GitHubStorageLocation`, `ResolvedStorageTarget` |
| `src/lib/collections/github-repo-manager.ts` | NEW - repo creation, existence, permissions |
| `src/app/api/github/collections/route.ts` | Refactor to use adapter + repo manager |
| `src/app/api/github/collections/[username]/route.ts` | Fetch from both repos via adapter |
| `src/app/api/github/collections/[username]/permissions/route.ts` | Fix org permissions |
| `src/app/api/github/collections/[username]/regions/route.ts` | Use `getRepoName(visibility)` |
| `src/contexts/UserCollectionsContext.tsx` | Add visibility state |
| `src/components/collections/GitHubSyncModal.tsx` | Visibility toggle UI |

---

## Design Decisions

1. **Visibility is per-owner, not per-collection** - All collections from same owner go to same repo. Simpler mental model.

2. **Repo names are deterministic** - Derive from visibility, no need to store per-user.

3. **Org permissions via repo API** - Use `GET /repos/{owner}/{repo}` which returns `permissions` object for authenticated user. Works for both users and orgs.

4. **Location abstraction for extensibility** - `CollectionStorageLocation` is a discriminated union. Easy to add `type: 'local'` later.

---

## Implementation Order

1. **alexandria-collections**: Add visibility/owner fields to Collection type, publish new version
2. **web-ade**: Update dependency, add storage resolver + github operations
3. **web-ade**: API routes (POST/GET/permissions with org support)
4. **web-ade**: Context updates (visibility state management)
5. **web-ade**: UI (visibility toggle in GitHubSyncModal)
6. Test all 4 combinations (user/org × public/private)
