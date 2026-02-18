'use client';

/**
 * Home Page Provider
 * Page-specific context provider that only includes slices needed for the home page.
 *
 * Slices included:
 * - github-repositories: User's GitHub repositories (owned, starred, organizations)
 * - owner-repositories: Repositories for a specific owner
 * - githubStarred: Starred repositories with loading state
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  PanelEventBus,
  getGlobalToolRegistry,
  setGlobalToolRegistryEventEmitter,
} from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  DataSlice,
  WorkspaceMetadata,
  RepositoryMetadata,
  PanelTool,
  PanelAdapters,
} from '@principal-ade/panel-framework-core';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import { minimatch } from 'minimatch';
import { useAuth } from './AuthContext';

// Host-provided tools
const hostTools: PanelTool[] = [
  {
    name: 'list_repositories',
    description: 'List GitHub repositories for the authenticated user or owner',
    inputs: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Optional owner (user or org) to fetch repositories for',
        },
      },
    },
    outputs: {
      type: 'object',
      properties: {
        repositories: {
          type: 'array',
          description: 'List of repository names',
        },
      },
    },
    tags: ['github', 'repository', 'list'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:list-repositories',
      source: 'ai-agent',
    },
  },
];

// GitHub repository interfaces
interface GitHubOwner {
  login: string;
  avatar_url?: string;
  type?: 'User' | 'Organization';
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubOwner;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  clone_url: string;
  language: string | null;
  default_branch: string;
  stargazers_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
  topics?: string[];
  visibility?: string;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
}

// GitHub repositories slice data (user's owned, starred, and org repos)
interface GitHubRepositoriesData {
  owned: GitHubRepository[];
  starred: GitHubRepository[];
  organizations: GitHubRepository[];
  isAuthenticated: boolean;
}

// Owner repositories slice data (repos for a specific owner)
interface OwnerRepositoriesData {
  owner: {
    login: string;
    name?: string;
    avatar_url?: string;
    type?: 'User' | 'Organization';
  } | null;
  repositories: GitHubRepository[];
  isAuthenticated: boolean;
  error?: string;
}

// GitHub starred slice data (starred repos with loading state)
interface GitHubStarredData {
  repositories: GitHubRepository[];
  loading: boolean;
  error?: Error;
}

// Home page context type - includes only the slices needed for home page
export interface HomePageContextType {
  'github-repositories'?: DataSlice<GitHubRepositoriesData>;
  'owner-repositories'?: DataSlice<OwnerRepositoriesData>;
  githubStarred?: DataSlice<GitHubStarredData>;
}

interface HomePageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
}

interface HomePageProviderValue {
  context: PanelContextValue<HomePageContextType>;
  actions: PanelActions;
  events: PanelEventEmitter;
}

const HomePageContext = createContext<HomePageProviderValue | null>(null);

export function HomePageProvider({
  children,
  workspace,
  repository,
}: HomePageProviderProps) {
  // Initialize event bus
  const events = useMemo(() => new PanelEventBus(), []);

  // Initialize tool registry
  useEffect(() => {
    const registry = getGlobalToolRegistry();
    setGlobalToolRegistryEventEmitter(events);

    registry.registerPanelTools({
      id: 'web-ade.host',
      name: 'Web ADE Host',
      tools: hostTools,
    });

    registry.registerPanelTools({
      id: 'panel-layouts',
      name: 'Panel Layouts',
      tools: layoutTools,
    });

    console.log('[HomePageProvider] Tool registry initialized');

    return () => {
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state
  const { isAuthenticated } = useAuth();

  // State for GitHub repositories (user's repos)
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoriesData>({
    owned: [],
    starred: [],
    organizations: [],
    isAuthenticated: false,
  });
  const [githubReposLoading, setGithubReposLoading] = useState(false);

  // State for owner repositories (initialized but not actively fetched on home page)
  const ownerRepos: OwnerRepositoriesData = useMemo(() => ({
    owner: null,
    repositories: [],
    isAuthenticated: false,
  }), []);
  const ownerReposLoading = false;

  // State for starred repositories (with loading state)
  const [starredData, setStarredData] = useState<GitHubStarredData>({
    repositories: [],
    loading: false,
  });

  // Slices ref
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Fetch GitHub repositories (owned, starred, organizations)
  const fetchGithubRepos = useCallback(async () => {
    if (!isAuthenticated) {
      setGithubRepos({
        owned: [],
        starred: [],
        organizations: [],
        isAuthenticated: false,
      });
      return;
    }

    setGithubReposLoading(true);
    try {
      // Fetch user's repositories
      const reposResponse = await fetch('/api/github/user/repos');
      if (!reposResponse.ok) throw new Error('Failed to fetch repositories');
      const owned = await reposResponse.json();

      // Fetch starred repositories
      const starredResponse = await fetch('/api/github/user/starred');
      if (!starredResponse.ok) throw new Error('Failed to fetch starred repos');
      const starred = await starredResponse.json();

      // Fetch organization repositories
      const orgsResponse = await fetch('/api/github/user/orgs');
      if (!orgsResponse.ok) throw new Error('Failed to fetch organizations');
      const orgs = await orgsResponse.json();

      // Fetch repos for each organization
      const orgReposPromises = orgs.map(async (org: { login: string }) => {
        const orgReposResponse = await fetch(`/api/github/orgs/${org.login}/repos`);
        if (!orgReposResponse.ok) return [];
        return orgReposResponse.json();
      });

      const orgReposArrays = await Promise.all(orgReposPromises);
      const organizations = orgReposArrays.flat();

      setGithubRepos({
        owned,
        starred,
        organizations,
        isAuthenticated: true,
      });

      // Also update the starred data
      setStarredData({
        repositories: starred,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching GitHub repos:', error);
      setGithubRepos({
        owned: [],
        starred: [],
        organizations: [],
        isAuthenticated: false,
      });
    } finally {
      setGithubReposLoading(false);
    }
  }, [isAuthenticated]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchGithubRepos();
  }, [fetchGithubRepos]);

  // Initialize slices on mount
  useEffect(() => {
    const initialSlices = new Map<string, DataSlice>();

    initialSlices.set('github-repositories', {
      scope: 'global',
      name: 'github-repositories',
      data: null,
      loading: true,
      error: null,
      refresh: fetchGithubRepos,
    });

    initialSlices.set('owner-repositories', {
      scope: 'global',
      name: 'owner-repositories',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('githubStarred', {
      scope: 'global',
      name: 'githubStarred',
      data: null,
      loading: true,
      error: null,
      refresh: fetchGithubRepos, // Reuses the same fetch
    });

    slicesRef.current = initialSlices;

    console.log('[HomePageProvider] Slices initialized:', Array.from(initialSlices.keys()));
  }, [fetchGithubRepos]);

  // Fetch GitHub repos on auth state change
  useEffect(() => {
    if (isAuthenticated) {
      fetchGithubRepos();
    }
  }, [isAuthenticated, fetchGithubRepos]);

  // Update github-repositories slice
  useEffect(() => {
    const slice = slicesRef.current.get('github-repositories');
    if (slice) {
      slicesRef.current.set('github-repositories', {
        ...slice,
        data: githubRepos,
        loading: githubReposLoading,
      });
    }
  }, [githubRepos, githubReposLoading]);

  // Update owner-repositories slice
  useEffect(() => {
    const slice = slicesRef.current.get('owner-repositories');
    if (slice) {
      slicesRef.current.set('owner-repositories', {
        ...slice,
        data: ownerRepos,
        loading: ownerReposLoading,
      });
    }
  }, [ownerRepos, ownerReposLoading]);

  // Update githubStarred slice
  useEffect(() => {
    const slice = slicesRef.current.get('githubStarred');
    if (slice) {
      slicesRef.current.set('githubStarred', {
        ...slice,
        data: starredData,
        loading: starredData.loading,
      });
    }
  }, [starredData]);

  // Adapters for file operations (minimal for home page)
  const adapters: PanelAdapters = useMemo(
    () => ({
      readFile: async (_path: string): Promise<string> => {
        throw new Error('File operations not supported on home page');
      },
      matchesPath: (pattern: string, path: string): boolean => {
        return minimatch(path, pattern);
      },
    }),
    []
  );

  // Build panel context
  const context = useMemo<PanelContextValue<HomePageContextType>>(() => ({
    currentScope: {
      type: 'workspace' as const,
      workspace: workspace || { name: 'web-ade', path: '/workspace' },
      repository: repository || { name: 'home', path: '/home' },
    },
    slices: slicesRef.current,
    adapters,
    // Typed slice properties
    'github-repositories': slicesRef.current.get('github-repositories') as DataSlice<GitHubRepositoriesData> | undefined,
    'owner-repositories': slicesRef.current.get('owner-repositories') as DataSlice<OwnerRepositoriesData> | undefined,
    githubStarred: slicesRef.current.get('githubStarred') as DataSlice<GitHubStarredData> | undefined,
    getSlice: <T,>(name: string) => slicesRef.current.get(name) as DataSlice<T> | undefined,
    getWorkspaceSlice: <T,>(name: string) => {
      const slice = slicesRef.current.get(name);
      return slice?.scope === 'workspace' ? (slice as DataSlice<T>) : undefined;
    },
    getRepositorySlice: <T,>(name: string) => {
      const slice = slicesRef.current.get(name);
      return slice?.scope === 'repository' ? (slice as DataSlice<T>) : undefined;
    },
    hasSlice: (name: string, scope?: 'workspace' | 'repository') => {
      const slice = slicesRef.current.get(name);
      if (!slice) return false;
      return scope ? slice.scope === scope : true;
    },
    isSliceLoading: (name: string, scope?: 'workspace' | 'repository') => {
      const slice = slicesRef.current.get(name);
      if (!slice) return false;
      if (scope && slice.scope !== scope) return false;
      return slice.loading;
    },
    refresh,
  }), [workspace, repository, adapters, refresh]);

  // Panel actions
  const actions = useMemo<PanelActions>(() => ({
    openFile: async (filePath: string) => {
      console.log('[HomePageProvider] File open not supported:', filePath);
      throw new Error('File operations not supported on home page');
    },
    notifyPanels: (event) => {
      events.emit(event);
    },
  }), [events]);

  // Provider value
  const value = useMemo<HomePageProviderValue>(
    () => ({
      context,
      actions,
      events,
    }),
    [context, actions, events]
  );

  return (
    <HomePageContext.Provider value={value}>
      {children}
    </HomePageContext.Provider>
  );
}

export function useHomePageProvider() {
  const context = useContext(HomePageContext);
  if (!context) {
    throw new Error('useHomePageProvider must be used within HomePageProvider');
  }
  return context;
}
