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
import type { Collection } from '@principal-ai/alexandria-collections';

/**
 * Mock repositories for owner page stories
 */
export const mockRepositories = [
  {
    id: 1,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    description: 'My first repository on GitHub!',
    owner: { login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4' },
    stargazers_count: 1234,
    language: 'JavaScript',
    updated_at: new Date().toISOString(),
    html_url: 'https://github.com/octocat/hello-world',
  },
  {
    id: 2,
    name: 'spoon-knife',
    full_name: 'octocat/spoon-knife',
    description: 'This repo is for demonstration purposes only.',
    owner: { login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4' },
    stargazers_count: 567,
    language: 'HTML',
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    html_url: 'https://github.com/octocat/spoon-knife',
  },
  {
    id: 3,
    name: 'linguist',
    full_name: 'octocat/linguist',
    description: 'Language detection library for GitHub',
    owner: { login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4' },
    stargazers_count: 890,
    language: 'Ruby',
    updated_at: new Date(Date.now() - 172800000).toISOString(),
    html_url: 'https://github.com/octocat/linguist',
  },
];

/**
 * Mock collections for library page stories
 */
export const mockCollections: Collection[] = [
  {
    id: 'col-1',
    name: 'Frontend Tools',
    description: 'Essential frontend development libraries',
    icon: 'Code',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'col-2',
    name: 'Backend Services',
    description: 'Microservices and API tools',
    icon: 'Server',
    createdAt: Date.now() - 14 * 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'col-3',
    name: 'Learning Resources',
    description: 'Tutorials and example projects',
    icon: 'BookOpen',
    createdAt: Date.now() - 30 * 86400000,
    updatedAt: Date.now() - 3 * 86400000,
  },
];

/**
 * Mock collection repositories mapping
 */
export const mockCollectionRepositories: Record<string, string[]> = {
  'col-1': ['facebook/react', 'vercel/next.js', 'tailwindlabs/tailwindcss'],
  'col-2': ['nestjs/nest', 'prisma/prisma'],
  'col-3': [],
};

/**
 * Mock starred repos
 */
export const mockStarredRepos = [
  {
    id: 100,
    name: 'react',
    full_name: 'facebook/react',
    owner: { login: 'facebook', avatar_url: 'https://avatars.githubusercontent.com/u/69631?v=4' },
    description: 'A declarative, efficient, and flexible JavaScript library',
    stargazers_count: 220000,
  },
  {
    id: 101,
    name: 'next.js',
    full_name: 'vercel/next.js',
    owner: { login: 'vercel', avatar_url: 'https://avatars.githubusercontent.com/u/14985020?v=4' },
    description: 'The React Framework',
    stargazers_count: 118000,
  },
];

/**
 * Mock following users
 */
export const mockFollowingUsers = [
  {
    id: 1,
    login: 'mojombo',
    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
    name: 'Tom Preston-Werner',
    bio: 'Cofounder of GitHub',
  },
  {
    id: 2,
    login: 'defunkt',
    avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4',
    name: 'Chris Wanstrath',
    bio: 'Co-founder of GitHub',
  },
];

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

export const useAuth = () => useContext(MockAuthContext);

export const MockAuthProvider: React.FC<{
  children: React.ReactNode;
  isAuthenticated?: boolean;
  user?: MockAuthContextType['user'];
}> = ({
  children,
  isAuthenticated = true,
  user = {
    login: 'octocat',
    email: 'octocat@github.com',
    name: 'The Octocat',
    id: 583231,
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  },
}) => (
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
 * Mock UserCollections Context
 */
interface MockUserCollectionsContextType {
  collections: Collection[];
  loading: boolean;
  saving: boolean;
  gitHubRepoExists: boolean;
  gitHubRepoUrl: string | null;
  createCollection: (name: string, description: string, icon: string) => Promise<Collection>;
  updateCollection: (id: string, updates: Partial<Collection>) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addRepository: (collectionId: string, repoId: string) => Promise<void>;
  removeRepository: (collectionId: string, repoId: string) => Promise<void>;
  getCollectionRepositories: (collectionId: string) => string[];
  isUserCollection: (id: string) => boolean;
  enableGitHub: () => Promise<void>;
}

const MockUserCollectionsContext = createContext<MockUserCollectionsContextType>({
  collections: [],
  loading: false,
  saving: false,
  gitHubRepoExists: false,
  gitHubRepoUrl: null,
  createCollection: async () => ({ id: '', name: '', description: '', icon: '', createdAt: 0, updatedAt: 0 }),
  updateCollection: async () => {},
  deleteCollection: async () => {},
  addRepository: async () => {},
  removeRepository: async () => {},
  getCollectionRepositories: () => [],
  isUserCollection: () => true,
  enableGitHub: async () => {},
});

export const useUserCollections = () => useContext(MockUserCollectionsContext);

export const MockUserCollectionsProvider: React.FC<{
  children: React.ReactNode;
  collections?: Collection[];
  collectionRepositories?: Record<string, string[]>;
  loading?: boolean;
  gitHubSynced?: boolean;
}> = ({
  children,
  collections = mockCollections,
  collectionRepositories = mockCollectionRepositories,
  loading = false,
  gitHubSynced = false,
}) => (
  <MockUserCollectionsContext.Provider
    value={{
      collections,
      loading,
      saving: false,
      gitHubRepoExists: gitHubSynced,
      gitHubRepoUrl: gitHubSynced ? 'https://github.com/octocat/alexandria-library' : null,
      createCollection: async (name, description, icon) => {
        const newCollection: Collection = {
          id: `col-${Date.now()}`,
          name,
          description,
          icon,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        console.log('[Mock] createCollection:', newCollection);
        return newCollection;
      },
      updateCollection: async (id, updates) => console.log('[Mock] updateCollection:', id, updates),
      deleteCollection: async (id) => console.log('[Mock] deleteCollection:', id),
      addRepository: async (collectionId, repoId) => console.log('[Mock] addRepository:', collectionId, repoId),
      removeRepository: async (collectionId, repoId) => console.log('[Mock] removeRepository:', collectionId, repoId),
      getCollectionRepositories: (collectionId) => collectionRepositories[collectionId] || [],
      isUserCollection: () => true,
      enableGitHub: async () => console.log('[Mock] enableGitHub'),
    }}
  >
    {children}
  </MockUserCollectionsContext.Provider>
);

/**
 * Create mock panel context with configurable slices
 */
export const createMockContext = (slices?: Record<string, { data?: unknown; loading?: boolean }>): PanelContextValue => {
  const sliceMap = new Map<string, { data?: unknown; loading?: boolean }>();

  if (slices) {
    Object.entries(slices).forEach(([key, value]) => {
      sliceMap.set(key, value);
    });
  }

  return {
    currentScope: {
      type: 'repository',
      workspace: { name: 'web-ade', path: '/workspace' },
      repository: { name: 'hello-world', path: '/octocat/hello-world' },
    },
    slices: sliceMap as unknown as PanelContextValue['slices'],
    getSlice: ((id: string) => sliceMap.get(id)) as PanelContextValue['getSlice'],
    getWorkspaceSlice: () => undefined,
    getRepositorySlice: () => undefined,
    hasSlice: (id: string) => sliceMap.has(id),
    isSliceLoading: (id: string) => sliceMap.get(id)?.loading ?? false,
    refresh: async () => {},
  };
};

/**
 * Create mock panel actions
 */
export const createMockActions = (): PanelActions & { previewReadme?: (owner: string, repo: string) => Promise<string> } => ({
  openFile: (path) => console.log('[Mock] openFile:', path),
  openGitDiff: (path, status) => console.log('[Mock] openGitDiff:', path, status),
  navigateToPanel: (id) => console.log('[Mock] navigateToPanel:', id),
  notifyPanels: (event) => console.log('[Mock] notifyPanels:', event),
  previewReadme: async (owner: string, repo: string) => {
    console.log('[Mock] previewReadme:', owner, repo);
    return `# ${repo}\n\nThis is a mock README for ${owner}/${repo}`;
  },
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

/**
 * Mock PanelProvider Context
 */
interface MockPanelContextType {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
}

const MockPanelContext = createContext<MockPanelContextType | null>(null);

export const usePanelProvider = () => {
  const ctx = useContext(MockPanelContext);
  if (!ctx) {
    return {
      context: createMockContext(),
      actions: createMockActions(),
      events: createMockEvents(),
    };
  }
  return ctx;
};

export const MockPanelProvider: React.FC<{
  children: React.ReactNode;
  slices?: Record<string, { data?: unknown; loading?: boolean }>;
}> = ({ children, slices }) => {
  const value = React.useMemo(() => ({
    context: createMockContext(slices),
    actions: createMockActions(),
    events: createMockEvents(),
  }), [slices]);

  return (
    <MockPanelContext.Provider value={value}>
      {children}
    </MockPanelContext.Provider>
  );
};

/**
 * Mock Next.js navigation hooks
 */
export const mockRouter = {
  push: (url: string) => console.log('[Mock] router.push:', url),
  replace: (url: string) => console.log('[Mock] router.replace:', url),
  back: () => console.log('[Mock] router.back'),
  forward: () => console.log('[Mock] router.forward'),
  refresh: () => console.log('[Mock] router.refresh'),
  prefetch: (url: string) => console.log('[Mock] router.prefetch:', url),
};

/**
 * Combined story wrapper for page stories
 */
interface PageStoryWrapperProps {
  children: React.ReactNode;
  isAuthenticated?: boolean;
  collections?: Collection[];
  collectionRepositories?: Record<string, string[]>;
  collectionsLoading?: boolean;
  gitHubSynced?: boolean;
  mockFetch?: (url: string) => Promise<Response> | null;
}

export const PageStoryWrapper: React.FC<PageStoryWrapperProps> = ({
  children,
  isAuthenticated = true,
  collections = mockCollections,
  collectionRepositories = mockCollectionRepositories,
  collectionsLoading = false,
  gitHubSynced = false,
  mockFetch,
}) => {
  const [ready, setReady] = React.useState(false);
  const originalFetchRef = React.useRef<typeof global.fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = global.fetch;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Allow custom mock overrides
      if (mockFetch) {
        const result = mockFetch(url);
        if (result) return result;
      }

      // Mock owner repositories
      if (url.includes('/api/github/owner/') && url.includes('/repos')) {
        return new Response(
          JSON.stringify({ repositories: mockRepositories }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock user repos (starred, following)
      if (url.includes('/api/github/user/repos')) {
        return new Response(
          JSON.stringify({
            starred: mockStarredRepos,
            following: mockFollowingUsers,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock file content check (for architecture.canvas)
      if (url.includes('/api/github/repo/') && url.includes('action=file')) {
        return new Response(null, { status: 404 });
      }

      // Fall through to original fetch
      return originalFetchRef.current!(input, init);
    };

    setReady(true);

    return () => {
      if (originalFetchRef.current) {
        global.fetch = originalFetchRef.current;
      }
    };
  }, [mockFetch]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <MockAuthProvider isAuthenticated={isAuthenticated}>
        <MockUserCollectionsProvider
          collections={collections}
          collectionRepositories={collectionRepositories}
          loading={collectionsLoading}
          gitHubSynced={gitHubSynced}
        >
          <div style={{ height: '100vh', width: '100vw' }}>
            {children}
          </div>
        </MockUserCollectionsProvider>
      </MockAuthProvider>
    </ThemeProvider>
  );
};
