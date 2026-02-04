# GitHub Issues Functionality - Implementation Documentation

**Status**: Removed from UI (2026-02-03)
**Reason**: Functionality removed per user request
**API Routes**: Preserved for potential future use

This document describes how the GitHub Issues functionality was integrated into the Web ADE UI before removal. The API routes remain intact and can be re-integrated following this documentation.

---

## Overview

The GitHub Issues functionality provided a complete interface for viewing, managing, and interacting with GitHub issues directly within the Web ADE. It included:

- List view of repository issues
- Individual issue detail view with timeline
- Issue state management (close/reopen)
- Comment viewing and reactions
- Integration with the task/backlog system

---

## Layout Configuration

### Location
`src/components/LayoutConfigDropdown.tsx`

### Configuration Entry (Removed)
```typescript
{
  id: 'github-issues',
  name: 'Issues',
  layout: {
    left: 'github-issues',        // Issues list panel
    middle: 'github-issue-detail', // Issue detail view
    right: 'github-messages',      // Comments/timeline panel
  },
  collapsed: {
    left: false,
    right: false,
  },
}
```

This layout provided a three-panel view:
- **Left**: List of all issues in the repository
- **Middle**: Detailed view of selected issue
- **Right**: Comments, timeline events, and reactions

---

## Panel Context Integration

### Location
`src/contexts/PanelContext.tsx`

### Type Definitions

```typescript
// GitHub Issues types for GitHubIssuesPanel
interface GitHubIssueLabel {
  id: number;
  name: string;
  color: string;
}

interface GitHubIssueUser {
  login: string;
  avatar_url: string;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: GitHubIssueLabel[];
  comments: number;
  user: GitHubIssueUser;
  assignees: GitHubIssueUser[];
}

interface GitHubIssuesSliceData {
  issues: GitHubIssue[];
  owner: string;
  repo: string;
  isAuthenticated: boolean;
  error?: string;
}
```

### State Management

```typescript
// State for GitHub issues (for GitHubIssuesPanel)
const [issuesData, setIssuesData] = useState<GitHubIssuesSliceData | null>(null);
const [issuesLoading, setIssuesLoading] = useState(false);
const [issuesError, setIssuesError] = useState<Error | null>(null);
```

### Data Slice Registration

The issues data was registered as a panel slice at line ~1989:

```typescript
[
  'github-issues',
  {
    scope: 'repository',
    name: 'github-issues',
    data: issuesData,
    loading: issuesLoading,
    error: issuesError,
    refresh: async () => {
      if (githubRepo) {
        await fetchIssues(githubRepo);
      }
    },
  },
]
```

### Data Fetching

The `fetchIssues` function (line ~980) fetched issues from the GitHub API:

```typescript
const fetchIssues = useCallback(async (repo: string) => {
  setIssuesLoading(true);
  setIssuesError(null);
  console.log('[PanelContext] Fetching issues for:', repo);

  try {
    const [owner, name] = repo.split('/');
    const response = await fetch(
      `/api/github/repo/${owner}/${name}/issues?per_page=50`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      setIssuesData({
        issues: [],
        owner: owner || '',
        repo: name || '',
        isAuthenticated: errorData.isAuthenticated ?? false,
        error: errorData.error || `Failed to fetch issues: ${response.statusText}`,
      });
      return;
    }

    const data = await response.json();

    setIssuesData({
      issues: data.issues || [],
      owner: data.owner || owner || '',
      repo: data.repo || name || '',
      isAuthenticated: data.isAuthenticated ?? false,
    });
    console.log('[PanelContext] Issues loaded:', data.issues?.length || 0);
  } catch (err) {
    console.error('[PanelContext] Failed to fetch issues:', err);
    setIssuesError(err instanceof Error ? err : new Error('Failed to fetch issues'));
  } finally {
    setIssuesLoading(false);
  }
}, []);
```

**Called in initialization** (line ~3699):
```typescript
fetchIssues(githubRepo);
```

### Slice Updates

The slice was updated with fetched data (line ~2366):

```typescript
// Update github-issues slice with fetched data
const issuesSlice = slicesRef.current.get('github-issues');
if (issuesSlice) {
  slicesRef.current.set('github-issues', {
    ...issuesSlice,
    data: issuesData,
    loading: issuesLoading,
    error: issuesError,
  });
}
```

---

## Event Handlers

### Issue Delete/Close Event

Event: `github-issue:delete` (line ~2758)

```typescript
const unsubscribeIssueDelete = events.on('github-issue:delete', async (event) => {
  const payload = event.payload as {
    owner: string;
    repo: string;
    number: number;
  };

  console.log('[PanelContext] Closing issue:', payload);

  try {
    const response = await fetch(
      `/api/github/repo/${payload.owner}/${payload.repo}/issues/${payload.number}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to close issue');
    }

    console.log('[PanelContext] Issue closed');

    // Clear messages data
    setMessagesData(null);

    // Remove the closed issue from local state immediately
    setIssuesData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        issues: prevData.issues.filter((issue) => issue.number !== payload.number),
      };
    });

    // Emit success event
    events.emit({
      type: 'github-issue:deleted',
      source: 'panel-context',
      timestamp: Date.now(),
      payload: {
        owner: payload.owner,
        repo: payload.repo,
        number: payload.number,
      },
    });
  } catch (error) {
    console.error('[PanelContext] Error closing issue:', error);

    events.emit({
      type: 'github-issue:delete-error',
      source: 'panel-context',
      timestamp: Date.now(),
      payload: {
        owner: payload.owner,
        repo: payload.repo,
        number: payload.number,
        error: error instanceof Error ? error.message : 'Failed to close issue',
      },
    });
  }
});
```

**Events emitted**:
- `github-issue:deleted` - Success
- `github-issue:delete-error` - Failure

### Issue Creation Event

Event: `task:assigned-to-claude` (line ~2825)

This event handler responded to tasks being assigned to Claude, potentially creating GitHub issues from backlog tasks.

---

## API Routes (Preserved)

All API routes remain functional and available at:

### Base Issues Route
- **Path**: `/api/github/repo/[owner]/[name]/issues/route.ts`
- **Methods**: GET, POST
- **Purpose**: List issues, create new issues
- **Query Params**:
  - `per_page` - Number of issues to fetch (default: 50)

### Individual Issue Route
- **Path**: `/api/github/repo/[owner]/[name]/issues/[number]/route.ts`
- **Methods**: GET, PATCH
- **Purpose**: Get issue details, update issue state (open/closed)

### Issue Timeline Route
- **Path**: `/api/github/repo/[owner]/[name]/issues/[number]/timeline/route.ts`
- **Methods**: GET
- **Purpose**: Fetch issue timeline events and comments
- **Query Params**:
  - `per_page` - Number of timeline items (default: 100)

### Issue Reactions Route
- **Path**: `/api/github/repo/[owner]/[name]/issues/[number]/reactions/route.ts`
- **Methods**: GET, POST, DELETE
- **Purpose**: Manage reactions on issues

### Comment Reactions Route
- **Path**: `/api/github/repo/[owner]/[name]/issues/comments/[commentId]/reactions/route.ts`
- **Methods**: GET, POST, DELETE
- **Purpose**: Manage reactions on issue comments

---

## Integration with Other Features

### GitHub Messages Panel

The `github-messages` panel (right sidebar) was used to display:
- Issue comments
- Timeline events
- Reactions

It consumed the `GitHubMessagesSliceData` which could target issues:
```typescript
interface GitHubMessagesTarget {
  type: 'issue' | 'pull_request';
  number: number;
  owner: string;
  repo: string;
}
```

### Backlog/Task System

Issues were integrated with the backlog system through the `task:assigned-to-claude` event, allowing backlog tasks to be converted into GitHub issues.

---

## Re-enabling the Functionality

To re-enable GitHub issues functionality:

1. **Restore Layout Configuration**
   - Add the layout config back to `LayoutConfigDropdown.tsx` (see configuration above)

2. **Restore PanelContext State**
   - Add state variables: `issuesData`, `issuesLoading`, `issuesError`
   - Add `fetchIssues` function
   - Register the `github-issues` slice
   - Add slice update logic
   - Register event handlers for `github-issue:delete` and `task:assigned-to-claude`

3. **Verify API Routes**
   - All routes are preserved and should work without modification

4. **Panel Components**
   - Ensure `github-issues`, `github-issue-detail`, and `github-messages` panels are available
   - These panels should be registered in the panel system

5. **Test Integration**
   - Verify issue listing works
   - Test issue detail view
   - Test closing/reopening issues
   - Verify timeline and comments display correctly
   - Test reactions functionality

---

## Notes

- All API routes use GitHub authentication and require valid credentials
- The API routes proxy to GitHub's REST API v3
- Issues are fetched with `per_page=50` by default
- Timeline events fetch with `per_page=100` by default
- The implementation supported both authenticated and unauthenticated states
- Error handling was implemented at both the API and UI levels
