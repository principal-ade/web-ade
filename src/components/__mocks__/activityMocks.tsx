'use client';

import React, { createContext, useContext } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  PanelEvent,
  PanelEventType,
} from '@principal-ade/panel-framework-core';
import type { ActivityEvent } from '@/app/api/github/user/[username]/activity/route';

/**
 * Mock activity events for Storybook
 */
export const mockActivityEvents: ActivityEvent[] = [
  {
    id: 'commit-octocat/hello-world-2024-01-15T10:30:00Z',
    type: 'commit',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    repository: 'octocat/hello-world',
    repositoryUrl: 'https://github.com/octocat/hello-world',
    metadata: { commitCount: 3 },
  },
  {
    id: 'pr-merged-octocat/spoon-knife-42',
    type: 'pr_merged',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    repository: 'octocat/spoon-knife',
    title: 'feat: add dark mode toggle',
    url: 'https://github.com/octocat/spoon-knife/pull/42',
    metadata: { prNumber: 42, additions: 150, deletions: 23 },
  },
  {
    id: 'commit-octocat/linguist-2024-01-15T08:00:00Z',
    type: 'commit',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    repository: 'octocat/linguist',
    repositoryUrl: 'https://github.com/octocat/linguist',
    metadata: { commitCount: 1 },
  },
  {
    id: 'issue-opened-octocat/hello-world-101',
    type: 'issue_opened',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
    repository: 'octocat/hello-world',
    title: 'Bug: Button not clickable on mobile',
    url: 'https://github.com/octocat/hello-world/issues/101',
    metadata: { issueNumber: 101 },
  },
  {
    id: 'pr-opened-octocat/git-consortium-15',
    type: 'pr_opened',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
    repository: 'octocat/git-consortium',
    title: 'refactor: extract utility functions',
    url: 'https://github.com/octocat/git-consortium/pull/15',
    metadata: { prNumber: 15 },
  },
  {
    id: 'issue-closed-octocat/spoon-knife-88',
    type: 'issue_closed',
    timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(), // 18 hours ago
    repository: 'octocat/spoon-knife',
    title: 'Feature request: export to PDF',
    url: 'https://github.com/octocat/spoon-knife/issues/88',
    metadata: { issueNumber: 88 },
  },
];

/**
 * Mock following users for Storybook
 */
export const mockFollowingUsers = [
  {
    login: 'defunkt',
    name: 'Chris Wanstrath',
    avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
    bio: 'Co-founder of GitHub',
  },
  {
    login: 'mojombo',
    name: 'Tom Preston-Werner',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
    bio: 'Cofounder of GitHub & Chatterbug',
  },
  {
    login: 'pjhyett',
    name: 'PJ Hyett',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3?v=4',
    bio: null,
  },
  {
    login: 'wycats',
    name: 'Yehuda Katz',
    avatarUrl: 'https://avatars.githubusercontent.com/u/4?v=4',
    bio: 'Tilde Inc. // Ember.js // Rust // Ruby',
  },
];

/**
 * Mock commit details for expanded view
 */
export const mockCommitDetails = [
  {
    sha: 'a1b2c3d',
    message: 'feat: add new activity timeline component',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    url: 'https://github.com/octocat/hello-world/commit/a1b2c3d',
  },
  {
    sha: 'e4f5g6h',
    message: 'fix: resolve date formatting issue',
    date: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    url: 'https://github.com/octocat/hello-world/commit/e4f5g6h',
  },
  {
    sha: 'i7j8k9l',
    message: 'chore: update dependencies',
    date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    url: 'https://github.com/octocat/hello-world/commit/i7j8k9l',
  },
];

/**
 * Mock user info
 */
export const mockUserInfo = {
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

/**
 * Mock Auth Context for Storybook
 */
interface MockAuthContextType {
  user: { login: string; email: string; name: string; id: number; avatar_url?: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
}

const MockAuthContext = createContext<MockAuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: () => {},
  logout: async () => {},
  fetchUser: async () => {},
  refreshTokens: async () => true,
});

// Export for use in components that need useAuth
export const useMockAuth = () => useContext(MockAuthContext);

export const MockAuthProvider: React.FC<{
  children: React.ReactNode;
  isAuthenticated?: boolean;
  user?: MockAuthContextType['user'];
}> = ({ children, isAuthenticated = true, user = { login: 'octocat', email: 'octocat@github.com', name: 'The Octocat', id: 583231 } }) => (
  <MockAuthContext.Provider
    value={{
      user: isAuthenticated ? user : null,
      isAuthenticated,
      isLoading: false,
      login: () => console.log('[Mock] login'),
      logout: async () => console.log('[Mock] logout'),
      fetchUser: async () => console.log('[Mock] fetchUser'),
      refreshTokens: async () => true,
    }}
  >
    {children}
  </MockAuthContext.Provider>
);

/**
 * Create mock panel context
 */
export const createMockContext = (): PanelContextValue => ({
  currentScope: {
    type: 'repository',
    workspace: { name: 'web-ade', path: '/workspace' },
    repository: { name: 'activity', path: '/activity/octocat' },
  },
  slices: new Map(),
  getSlice: () => undefined,
  getWorkspaceSlice: () => undefined,
  getRepositorySlice: () => undefined,
  hasSlice: () => false,
  isSliceLoading: () => false,
  refresh: async () => {},
});

/**
 * Create mock panel actions
 */
export const createMockActions = (): PanelActions => ({
  openFile: (path) => console.log('[Mock] openFile:', path),
  openGitDiff: (path, status) => console.log('[Mock] openGitDiff:', path, status),
  navigateToPanel: (id) => console.log('[Mock] navigateToPanel:', id),
  notifyPanels: (event) => console.log('[Mock] notifyPanels:', event),
});

/**
 * Create mock event emitter
 */
export const createMockEvents = (): PanelEventEmitter => {
  const handlers = new Map<PanelEventType, Set<(event: PanelEvent<unknown>) => void>>();

  return {
    emit: (event) => {
      console.log('[Mock] emit:', event);
      const eventHandlers = handlers.get(event.type);
      if (eventHandlers) {
        eventHandlers.forEach((handler) => handler(event));
      }
    },
    on: (type, handler) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler as (event: PanelEvent<unknown>) => void);
      return () => {
        handlers.get(type)?.delete(handler as (event: PanelEvent<unknown>) => void);
      };
    },
    off: (type, handler) => {
      handlers.get(type)?.delete(handler as (event: PanelEvent<unknown>) => void);
    },
  };
};

interface MockActivityProviderProps {
  children: React.ReactNode;
  activityData?: ActivityEvent[];
  followingData?: typeof mockFollowingUsers;
  commitDetails?: typeof mockCommitDetails;
  loading?: boolean;
  error?: string | null;
  isAuthenticated?: boolean;
  username?: string;
}

/**
 * Mock provider that intercepts fetch calls for activity data
 */
export const MockActivityProvider: React.FC<MockActivityProviderProps> = ({
  children,
  activityData = mockActivityEvents,
  followingData = mockFollowingUsers,
  commitDetails = mockCommitDetails,
  loading = false,
  error = null,
  isAuthenticated = true,
  username = 'octocat',
}) => {
  React.useEffect(() => {
    // Store original fetch
    const originalFetch = global.fetch;

    // Mock fetch
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Simulate loading delay
      if (loading) {
        await new Promise((resolve) => setTimeout(resolve, 100000));
      }

      // Mock activity endpoint
      if (url.includes('/api/github/user/') && url.includes('/activity')) {
        if (error) {
          return new Response(JSON.stringify({ error }), { status: 500 });
        }
        return new Response(
          JSON.stringify({
            user: mockUserInfo,
            activity: activityData,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock following endpoint
      if (url.includes('/api/github/user/') && url.includes('/following')) {
        if (error) {
          return new Response(JSON.stringify({ error }), { status: 500 });
        }
        return new Response(
          JSON.stringify({ following: followingData }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock commits endpoint
      if (url.includes('/api/github/user/') && url.includes('/commits/')) {
        return new Response(
          JSON.stringify({ commits: commitDetails }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Fall through to original fetch for other requests
      return originalFetch(input, init);
    };

    return () => {
      global.fetch = originalFetch;
    };
  }, [activityData, followingData, commitDetails, loading, error]);

  return (
    <ThemeProvider>
      <MockAuthProvider isAuthenticated={isAuthenticated} user={{ login: username, email: `${username}@github.com`, name: username, id: 583231 }}>
        <div style={{ height: '600px', width: '100%', background: 'var(--background)' }}>
          {children}
        </div>
      </MockAuthProvider>
    </ThemeProvider>
  );
};

/**
 * Props helper for panel stories
 */
export const getMockPanelProps = () => ({
  context: createMockContext(),
  actions: createMockActions(),
  events: createMockEvents(),
});
