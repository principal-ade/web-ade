# GitHub Pull Requests Functionality - Implementation Documentation

**Status**: Removed from UI (2026-02-03)
**Reason**: Functionality removed per user request
**API Routes**: Preserved for potential future use

This document describes how the GitHub Pull Requests functionality was integrated into the Web ADE UI before removal. The API routes remain intact and can be re-integrated following this documentation.

---

## Overview

The GitHub Pull Requests functionality provided a complete interface for viewing, managing, and interacting with GitHub pull requests directly within the Web ADE. It included:

- List view of repository pull requests
- Individual PR detail view with files changed
- PR state management (close/merge)
- File diff viewing
- Integration with the messages panel for PR timeline/comments

---

## Layout Configuration

### Location
`src/components/LayoutConfigDropdown.tsx`

### Configuration Entry (Removed)
```typescript
{
  id: 'pull-requests',
  name: 'Pull Requests',
  layout: {
    left: 'pull-requests',        // PR list panel
    middle: 'pull-request-detail', // PR detail view
    right: 'file-city',            // File visualization
  },
  collapsed: {
    left: false,
    right: false,
  },
}
```

This layout provided a three-panel view:
- **Left**: List of all pull requests in the repository
- **Middle**: Detailed view of selected PR with files changed
- **Right**: File visualization (File City)

---

## Panel Context Integration

### Location
`src/contexts/PanelContext.tsx`

### Type Definitions

```typescript
// GitHub Pull Requests types for GitPullRequestsPanel
interface PullRequestUser {
  login: string;
  avatar_url?: string;
  html_url?: string;
}

interface PullRequestRef {
  ref: string;
  sha?: string;
}

interface PullRequestInfo {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: 'open' | 'closed';
  draft?: boolean;
  html_url: string;
  user?: PullRequestUser | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  base?: PullRequestRef | null;
  head?: PullRequestRef | null;
  comments?: number;
  review_comments?: number;
}

interface PullRequestsSliceData {
  pullRequests: PullRequestInfo[];
  owner?: string;
  repo?: string;
  isAuthenticated?: boolean;
  error?: string;
}

// PR Files slice data (files changed in a selected pull request)
interface PullRequestFile {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url?: string;
  raw_url?: string;
  contents_url?: string;
}

interface PrFilesSliceData {
  files: PullRequestFile[];
  owner: string;
  repo: string;
  prNumber: number;
}
```

### State Management

```typescript
// State for GitHub pull requests (for GitPullRequestsPanel)
const [pullRequestsData, setPullRequestsData] = useState<PullRequestsSliceData | null>(null);
const [pullRequestsLoading, setPullRequestsLoading] = useState(false);
const [pullRequestsError, setPullRequestsError] = useState<Error | null>(null);

// State for PR files (for pull request detail view)
const [prFilesData, setPrFilesData] = useState<PrFilesSliceData | null>(null);
const [prFilesLoading, setPrFilesLoading] = useState(false);
const [prFilesError, setPrFilesError] = useState<Error | null>(null);
const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
```

### Data Slice Registration

The pull requests data was registered as a panel slice at line ~1920:

```typescript
[
  'pullRequests',
  {
    scope: 'repository',
    name: 'pullRequests',
    data: pullRequestsData,
    loading: pullRequestsLoading,
    error: pullRequestsError,
    refresh: async () => {
      if (githubRepo) {
        await fetchPullRequests(githubRepo);
      }
    },
  },
]
```

The PR files slice was also registered:

```typescript
[
  'prFiles',
  {
    scope: 'repository',
    name: 'prFiles',
    data: prFilesData,
    loading: prFilesLoading,
    error: prFilesError,
    refresh: async () => {
      if (githubRepo && selectedPrNumber) {
        await fetchPrFiles(githubRepo, selectedPrNumber);
      }
    },
  },
]
```

### Data Fetching

The `fetchPullRequests` function (line ~952) fetched PRs from the GitHub API:

```typescript
const fetchPullRequests = useCallback(async (repo: string) => {
  setPullRequestsLoading(true);
  setPullRequestsError(null);
  console.log('[PanelContext] Fetching pull requests for:', repo);

  try {
    const [owner, name] = repo.split('/');
    const response = await fetch(
      `/api/github/repo/${owner}/${name}/pull-requests?per_page=50`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      setPullRequestsData({
        pullRequests: [],
        owner: owner || '',
        repo: name || '',
        isAuthenticated: errorData.isAuthenticated ?? false,
        error: errorData.error || `Failed to fetch pull requests: ${response.statusText}`,
      });
      return;
    }

    const data = await response.json();

    setPullRequestsData({
      pullRequests: data.pullRequests || [],
      owner: data.owner || owner || '',
      repo: data.repo || name || '',
      isAuthenticated: data.isAuthenticated ?? false,
    });
    console.log('[PanelContext] Pull requests loaded:', data.pullRequests?.length || 0);
  } catch (err) {
    console.error('[PanelContext] Failed to fetch pull requests:', err);
    setPullRequestsError(err instanceof Error ? err : new Error('Failed to fetch pull requests'));
  } finally {
    setPullRequestsLoading(false);
  }
}, []);
```

The `fetchPrFiles` function fetched files changed in a specific PR:

```typescript
const fetchPrFiles = useCallback(async (repo: string, prNumber: number) => {
  setPrFilesLoading(true);
  setPrFilesError(null);

  try {
    const [owner, name] = repo.split('/');
    const response = await fetch(
      `/api/github/repo/${owner}/${name}/pull-requests/${prNumber}/files`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch PR files: ${response.statusText}`);
    }

    const data = await response.json();

    setPrFilesData({
      files: data.files || [],
      owner: owner || '',
      repo: name || '',
      prNumber,
    });

    setSelectedPrNumber(prNumber);
  } catch (err) {
    console.error('[PanelContext] Failed to fetch PR files:', err);
    setPrFilesError(err instanceof Error ? err : new Error('Failed to fetch PR files'));
  } finally {
    setPrFilesLoading(false);
  }
}, []);
```

**Called in initialization** (line ~3498):
```typescript
fetchPullRequests(githubRepo);
```

### Slice Updates

The slices were updated with fetched data (line ~2280, ~2268):

```typescript
// Update pullRequests slice with fetched data
const pullRequestsSlice = slicesRef.current.get('pullRequests');
if (pullRequestsSlice) {
  slicesRef.current.set('pullRequests', {
    ...pullRequestsSlice,
    data: pullRequestsData,
    loading: pullRequestsLoading,
    error: pullRequestsError,
  });
}

// Update prFiles slice with fetched data
const prFilesSlice = slicesRef.current.get('prFiles');
if (prFilesSlice) {
  slicesRef.current.set('prFiles', {
    ...prFilesSlice,
    data: prFilesData,
    loading: prFilesLoading,
    error: prFilesError,
  });
}
```

---

## Event Handlers

### PR Selection Events

Event: `pr:selected` (line ~2427)

```typescript
const unsubscribePR = events.on('pr:selected', (event) => {
  const payload = event.payload as {
    pullRequest?: {
      number: number;
      title: string;
      state: 'open' | 'closed';
      user: GitHubUser;
      created_at: string;
      html_url: string;
      labels?: GitHubLabel[];
      assignees?: GitHubUser[];
    };
    owner?: string;
    repo?: string;
  };
  const { pullRequest, owner, repo } = payload;
  if (pullRequest && owner && repo) {
    console.log('[PanelContext] PR selected, fetching messages for #', pullRequest.number);
    fetchMessages(owner, repo, pullRequest.number, pullRequest);
  }
});
```

### PR Files Selection

PR files were fetched when a PR was selected, integrating with the panel focus system.

### PR Delete/Close Event

Event: `github-pr:delete` (line ~2648)

```typescript
const unsubscribePRDelete = events.on('github-pr:delete', async (event) => {
  const payload = event.payload as {
    owner: string;
    repo: string;
    number: number;
  };

  console.log('[PanelContext] Closing PR:', payload);

  try {
    const response = await fetch(
      `/api/github/repo/${payload.owner}/${payload.repo}/pull-requests/${payload.number}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to close PR');
    }

    console.log('[PanelContext] PR closed');

    // Clear messages data
    setMessagesData(null);

    // Emit success event
    events.emit({
      type: 'github-pr:deleted',
      source: 'panel-context',
      timestamp: Date.now(),
      payload: {
        owner: payload.owner,
        repo: payload.repo,
        number: payload.number,
      },
    });

    // Optionally refresh PRs list
    if (githubRepo) {
      await fetchPullRequests(githubRepo);
    }
  } catch (error) {
    console.error('[PanelContext] Error closing PR:', error);

    events.emit({
      type: 'github-pr:delete-error',
      source: 'panel-context',
      timestamp: Date.now(),
      payload: {
        owner: payload.owner,
        repo: payload.repo,
        number: payload.number,
        error: error instanceof Error ? error.message : 'Failed to close PR',
      },
    });
  }
});
```

**Events emitted**:
- `github-pr:deleted` - Success
- `github-pr:delete-error` - Failure

---

## API Routes (Preserved)

All API routes remain functional and available at:

### Base Pull Requests Route
- **Path**: `/api/github/repo/[owner]/[name]/pull-requests/route.ts`
- **Methods**: GET
- **Purpose**: List pull requests
- **Query Params**:
  - `per_page` - Number of PRs to fetch (default: 50)
  - `state` - Filter by state (open/closed/all)

### Individual PR Route
- **Path**: `/api/github/repo/[owner]/[name]/pull-requests/[number]/route.ts`
- **Methods**: GET, PATCH
- **Purpose**: Get PR details, update PR state (open/closed)

### PR Files Route
- **Path**: `/api/github/repo/[owner]/[name]/pull-requests/[number]/files/route.ts`
- **Methods**: GET
- **Purpose**: Fetch files changed in a PR

### PR Comment Reactions Route
- **Path**: `/api/github/repo/[owner]/[name]/pull-requests/comments/[commentId]/reactions/route.ts`
- **Methods**: GET, POST, DELETE
- **Purpose**: Manage reactions on PR comments

---

## Integration with Other Features

### GitHub Messages Panel

The `github-messages` panel was used to display PR timeline, comments, and review comments when a PR was selected.

### File City Visualization

The right panel showed File City visualization, which could be enhanced with PR file change data.

---

## Badge Integration

The PR count badge was displayed in the LayoutSidebar:

```typescript
badges={{
  'pull-requests': repoCounts.openPullRequests,
  'kanban': triagedCount,
}}
```

This showed the number of open pull requests in the repository.

---

## Re-enabling the Functionality

To re-enable GitHub pull requests functionality:

1. **Restore Layout Configuration**
   - Add the layout config back to `LayoutConfigDropdown.tsx` (see configuration above)

2. **Restore PanelContext State**
   - Add state variables: `pullRequestsData`, `pullRequestsLoading`, `pullRequestsError`
   - Add state for PR files: `prFilesData`, `prFilesLoading`, `prFilesError`, `selectedPrNumber`
   - Add `fetchPullRequests` and `fetchPrFiles` functions
   - Register the `pullRequests` and `prFiles` slices
   - Add slice update logic
   - Register event handlers for `pr:selected` and `github-pr:delete`

3. **Verify API Routes**
   - All routes are preserved and should work without modification

4. **Panel Components**
   - Ensure `pull-requests`, `pull-request-detail` panels are available
   - These panels should be registered in the panel system

5. **LayoutSidebar Badge**
   - Restore the badge display for open PR count

6. **Test Integration**
   - Verify PR listing works
   - Test PR detail view
   - Test closing/merging PRs
   - Verify file diff viewing
   - Test comments and timeline display
   - Verify reactions functionality

---

## Notes

- All API routes use GitHub authentication and require valid credentials
- The API routes proxy to GitHub's REST API v3
- PRs are fetched with `per_page=50` by default
- The implementation supported both authenticated and unauthenticated states
- Error handling was implemented at both the API and UI levels
- PR files include patch diffs for viewing changes
