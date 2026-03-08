'use client';

/**
 * Worlds Page Provider
 * Page-specific context provider that only includes slices needed for the worlds/collections page.
 *
 * Slices included:
 * - userCollections: User's collections
 * - selectedCollectionView: Selected collection view with repositories
 * - workspaceRepositories: Repository details in the collection
 * - workspace: Workspace metadata
 * - githubStarred: Starred repos (for github-starred panel)
 * - githubProjects: GitHub projects (for github-projects panel)
 * - github-repositories: GitHub repos (for github-search panel)
 * - fileTree: File tree (for file-city panel)
 * - fileCityColorModes: Color modes (for file-city panel)
 * - quality: Quality metrics (for file-city panel)
 * - active-file: Active file (for file-city panel)
 * - packages: Packages (for package-composition panel)
 * - commitFiles: Commit files (for file-city panel)
 * - storyboardContext: Storyboard context (for file-city panel)
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
  ActiveFileSlice,
} from '@principal-ade/panel-framework-core';
import type { CollectionMapPanelActions } from '@industry-theme/repository-composition-panels';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import type { ValidatedRepositoryPath } from '@principal-ai/alexandria-core-library/types';
import { minimatch } from 'minimatch';
import { GitFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import type { FileCityColorModesSliceData, CommitFilesSliceData, QualitySliceData, PackagesSliceData, ColorMode, FeedProjectSliceData } from '@industry-theme/file-city-panel';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from './AuthContext';
import { useUserCollections } from './UserCollectionsContext';
import type { CustomRegion, RepositoryLayoutData } from '@principal-ai/alexandria-collections';
import type { PackageLayer } from '@principal-ai/codebase-composition';
import type {
  UserCollectionsSlice,
  WorkspaceSlice,
  WorkspaceCollectionRepositoriesSlice,
  GitHubRepository,
  GitHubStarredSlice,
  GitHubProjectsSlice,
  UserProfileSlice,
} from '@industry-theme/alexandria-panels';
import type {
  AlexandriaEntryWithMetrics,
  SelectedCollectionView,
} from '@industry-theme/repository-composition-panels';
import { useVFS } from './VFSContext';

// Host-provided tools
const hostTools: PanelTool[] = [
  {
    name: 'list_repositories',
    description: 'List GitHub repositories available to the user (owned, starred, and organization repos)',
    inputs: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['owned', 'starred', 'organizations', 'all'],
          description: 'Filter repositories by type (default: all)',
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
  {
    name: 'switch_repository',
    description: 'Navigate to a different GitHub repository',
    inputs: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'The repository in "owner/name" format',
        },
      },
      required: ['repository'],
    },
    outputs: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    tags: ['github', 'repository', 'navigate'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:switch-repository',
      source: 'ai-agent',
    },
  },
];

// GitHub repository interface
// GitHub repositories slice data
interface GitHubRepositoriesData {
  owned: GitHubRepository[];
  starred: GitHubRepository[];
  organizations: Array<{
    id: number;
    login: string;
    avatar_url: string;
    description: string | null;
    repositories: GitHubRepository[];
  }>;
  isAuthenticated: boolean;
}

// Type definitions imported from @industry-theme/file-city-panel:
// QualitySliceData, PackagesSliceData, ColorMode

/**
 * Extended actions for WorldsPageProvider
 * Combines panel actions with collection map region management
 */
interface WorldsPagePanelActions extends PanelActions, CollectionMapPanelActions {}

// Worlds page context type - includes only the slices needed for worlds page
export interface WorldsPageContextType {
  userCollections: DataSlice<UserCollectionsSlice>; // Required for UserCollectionsPanel
  // selectedCollectionView is always initialized and managed as direct state (not wrapped in DataSlice)
  selectedCollectionView: SelectedCollectionView;
  workspaceRepositories: DataSlice<WorkspaceCollectionRepositoriesSlice>; // Required for WorkspaceCollectionPanel
  workspace: DataSlice<WorkspaceSlice>; // Required for WorkspaceCollectionPanel
  githubStarred: DataSlice<GitHubStarredSlice>; // Required for GitHubStarredPanel
  githubProjects: DataSlice<GitHubProjectsSlice>; // Required for GitHubProjectsPanel
  'github-repositories'?: DataSlice<GitHubRepositoriesData>;
  fileTree: DataSlice<FileTree>;
  fileCityColorModes: DataSlice<FileCityColorModesSliceData>;
  quality?: DataSlice<QualitySliceData>;
  'active-file'?: DataSlice<ActiveFileSlice>;
  packages: DataSlice<PackagesSliceData>; // Required - expected by PackageCompositionPanel
  commitFiles?: DataSlice<CommitFilesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  userProfile: DataSlice<UserProfileSlice>; // Required for UserProfilePanel
  feedProject: DataSlice<FeedProjectSliceData>; // Required for FeedCodeCityPanel
}

interface WorldsPageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
  collectionId?: string;
  collectionRepositories?: string[];
  /** Callback when a repository is clicked in the overworld map */
  onRepositoryClicked?: (repositoryId: string) => void;
}

interface WorldsPageProviderValue {
  context: PanelContextValue<WorldsPageContextType>;
  actions: WorldsPagePanelActions;
  events: PanelEventEmitter;
  selectedColorMode: string | null;
  clearColorMode: () => void;
}

const WorldsPageContext = createContext<WorldsPageProviderValue | null>(null);

export function WorldsPageProvider({
  children,
  workspace,
  repository,
  githubRepo,
  collectionId,
  collectionRepositories,
  onRepositoryClicked,
}: WorldsPageProviderProps) {
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

    console.log('[WorldsPageProvider] Tool registry initialized');

    return () => {
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state
  const { isAuthenticated, user } = useAuth();

  // Get user collections
  const userCollections = useUserCollections();

  // Get VFS for file operations
  const vfs = useVFS();
  const vfsRef = useRef(vfs);
  vfsRef.current = vfs;

  // State for selected color mode (File City)
  const [selectedColorMode, setSelectedColorMode] = useState<ColorMode | null>(null);

  // State for file tree
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(true);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // State for active file
  const [activeFilePath, setActiveFilePath] = useState<string>('README.md');
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [activeFileLoading, setActiveFileLoading] = useState(false);
  const [activeFileError, setActiveFileError] = useState<Error | null>(null);

  // State for GitHub repositories
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoriesData>({
    owned: [],
    starred: [],
    organizations: [],
    isAuthenticated: false,
  });
  const [githubReposLoading, setGithubReposLoading] = useState(false);

  // State for quality metrics
  const [qualityData] = useState<QualitySliceData | null>(null);
  const [qualityLoading] = useState(false);
  const [qualityError] = useState<Error | null>(null);

  // State for packages
  const [packagesData] = useState<PackagesSliceData | null>(null);
  const [packagesLoading] = useState(false);
  const [packagesError] = useState<Error | null>(null);

  // State for collection repository details
  const [collectionRepoDetails, setCollectionRepoDetails] = useState<GitHubRepository[]>([]);
  const [collectionRepoDetailsLoading, setCollectionRepoDetailsLoading] = useState(false);

  // State for collection repository packages (for monorepo visualization)
  const [collectionRepoPackages, setCollectionRepoPackages] = useState<Record<string, PackageLayer[]>>({});
  // Note: Loading state for packages is not tracked since nothing consumes it
  // The packages are progressively added to collectionRepoPackages as they load

  // State for commit files
  const [commitFilesData] = useState<CommitFilesSliceData | null>(null);

  // State for storyboard context
  const [storyboardContextData] = useState<StoryboardContextSliceData | null>(null);

  // State for enabled color modes
  const [enabledColorModes] = useState<ColorMode[]>([]);

  // Direct state for typed slices (always present and type-safe)
  // These slices are managed as React state and synced to slicesRef for backward compatibility
  const [selectedCollectionView, setSelectedCollectionView] = useState<SelectedCollectionView>({
    scope: 'workspace',
    name: 'selectedCollectionView',
    data: {
      collection: null,
      repositories: [],
      dependencies: undefined,
    },
    loading: false,
    error: null,
    refresh: async () => {},
  });

  // Explicit slice: githubStarred (typed for GitHubStarredPanel)
  const githubStarredSlice = useMemo<DataSlice<GitHubStarredSlice>>(
    () => ({
      scope: 'global' as const,
      name: 'githubStarred',
      data: {
        repositories: githubRepos.starred,
        loading: githubReposLoading,
        error: undefined,
      },
      loading: githubReposLoading,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [githubRepos.starred, githubReposLoading]
  );

  // Explicit slice: githubProjects (typed for GitHubProjectsPanel)
  const orgRepositoriesMap = useMemo(() => {
    const map: Record<string, GitHubRepository[]> = {};
    githubRepos.organizations.forEach(org => {
      map[org.login] = org.repositories;
    });
    return map;
  }, [githubRepos.organizations]);

  const githubProjectsSlice = useMemo<DataSlice<GitHubProjectsSlice>>(
    () => ({
      scope: 'global' as const,
      name: 'githubProjects',
      data: {
        userRepositories: githubRepos.owned,
        organizations: githubRepos.organizations,
        orgRepositories: orgRepositoriesMap,
        loading: githubReposLoading,
        error: undefined,
        currentUser: undefined, // TODO: Get from auth context if needed
      },
      loading: githubReposLoading,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [githubRepos.owned, githubRepos.organizations, orgRepositoriesMap, githubReposLoading]
  );

  // Explicit slice: userCollections (typed for UserCollectionsPanel)
  const userCollectionsSlice = useMemo<DataSlice<UserCollectionsSlice>>(
    () => ({
      scope: 'global' as const,
      name: 'userCollections',
      data: {
        collections: userCollections.collections,
        memberships: userCollections.memberships,
        loading: userCollections.loading,
        saving: userCollections.saving,
        gitHubRepoExists: userCollections.gitHubRepoExists,
        gitHubRepoUrl: userCollections.gitHubRepoUrl,
        error: undefined,
      },
      loading: userCollections.loading,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [
      userCollections.collections,
      userCollections.memberships,
      userCollections.loading,
      userCollections.saving,
      userCollections.gitHubRepoExists,
      userCollections.gitHubRepoUrl,
    ]
  );

  // Explicit slice: userProfile (typed for UserProfilePanel)
  const userProfileSlice = useMemo<DataSlice<UserProfileSlice>>(
    () => ({
      scope: 'global' as const,
      name: 'userProfile',
      data: {
        user: user ? {
          login: user.login,
          id: user.id,
          avatar_url: user.avatar_url || '',
          name: user.name || null,
          bio: null,
          company: null,
          location: null,
          email: user.email || null,
          public_repos: 0,
          public_gists: 0,
          followers: 0,
          following: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } : null,
        collections: userCollections.collections,
        repositories: [],
        starredRepositories: [],
        selectedCollectionId: collectionId,
        currentView: 'profile' as const,
        loading: false,
        error: undefined,
      },
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [user, userCollections.collections, collectionId]
  );

  // Explicit slice: workspace (typed for WorkspaceCollectionPanel)
  const workspaceSlice = useMemo<DataSlice<WorkspaceSlice>>(
    () => ({
      scope: 'workspace' as const,
      name: 'workspace',
      data: collectionId && workspace ? {
        workspace: {
          id: collectionId,
          name: workspace.name,
          description: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        loading: false,
        error: undefined,
      } : null,
      loading: false,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [collectionId, workspace]
  );

  // Explicit slice: workspaceRepositories (typed for WorkspaceCollectionPanel)
  const workspaceRepositoriesSlice = useMemo<DataSlice<WorkspaceCollectionRepositoriesSlice>>(
    () => ({
      scope: 'workspace' as const,
      name: 'workspaceRepositories',
      data: {
        repositories: collectionRepoDetails,
        loading: collectionRepoDetailsLoading,
        error: undefined,
      },
      loading: collectionRepoDetailsLoading,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [collectionRepoDetails, collectionRepoDetailsLoading]
  );

  // Explicit slice: packages (typed for PackageCompositionPanel)
  const packagesSlice = useMemo<DataSlice<PackagesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'packages',
      data: packagesData,
      loading: packagesLoading,
      error: packagesError,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [packagesData, packagesLoading, packagesError]
  );

  // Explicit slice: fileTree (typed for File City panel)
  const fileTreeSlice = useMemo<DataSlice<FileTree>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileTree',
      data: fileTree,
      loading: fileTreeLoading,
      error: fileTreeError,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [fileTree, fileTreeLoading, fileTreeError]
  );

  // Explicit slice: active-file (typed for File City panel)
  const activeFileSlice = useMemo<DataSlice<ActiveFileSlice>>(
    () => {
      if (!activeFileContent || !githubRepo) {
        return {
          scope: 'repository' as const,
          name: 'active-file',
          data: null,
          loading: activeFileLoading,
          error: activeFileError,
          refresh: async () => { /* no-op */ },
        };
      }

      const parts = githubRepo.split('/');
      const owner = parts[0] || '';
      const name = parts[1] || '';

      if (!owner || !name) {
        return {
          scope: 'repository' as const,
          name: 'active-file',
          data: null,
          loading: activeFileLoading,
          error: activeFileError,
          refresh: async () => { /* no-op */ },
        };
      }

      const activeFileData: ActiveFileSlice = {
        path: activeFilePath,
        content: activeFileContent,
        type: 'code',
        size: activeFileContent.length,
        lastModified: new Date(),
        encoding: 'utf-8',
        source: createFileTreeSource.remoteBranch(
          owner,
          name,
          `https://github.com/${githubRepo}`,
          'main',
          'github'
        ),
      };

      return {
        scope: 'repository' as const,
        name: 'active-file',
        data: activeFileData,
        loading: activeFileLoading,
        error: activeFileError,
        refresh: async () => { /* no-op */ },
      };
    },
    [activeFilePath, activeFileContent, activeFileLoading, activeFileError, githubRepo]
  );

  // Explicit slice: quality (typed for File City panel)
  const qualitySlice = useMemo<DataSlice<QualitySliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'quality',
      data: qualityData,
      loading: qualityLoading,
      error: qualityError,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [qualityData, qualityLoading, qualityError]
  );

  // Explicit slice: fileCityColorModes (typed for File City panel)
  const fileCityColorModesSlice = useMemo<DataSlice<FileCityColorModesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileCityColorModes',
      data: {
        enabledModes: enabledColorModes,
        selectedColorMode,
        qualityData: qualityData ?? undefined,
      },
      loading: qualityLoading,
      error: qualityError,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [enabledColorModes, selectedColorMode, qualityData, qualityLoading, qualityError]
  );

  // Explicit slice: github-repositories (typed for GitHub search panel)
  const githubRepositoriesSlice = useMemo<DataSlice<GitHubRepositoriesData>>(
    () => ({
      scope: 'global' as const,
      name: 'github-repositories',
      data: githubRepos,
      loading: githubReposLoading,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [githubRepos, githubReposLoading]
  );

  // Explicit slice: commitFiles (typed for File City panel)
  const commitFilesSlice = useMemo<DataSlice<CommitFilesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'commitFiles',
      data: commitFilesData,
      loading: false,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [commitFilesData]
  );

  // Explicit slice: storyboardContext (typed for File City panel)
  const storyboardContextSlice = useMemo<DataSlice<StoryboardContextSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'storyboardContext',
      data: storyboardContextData,
      loading: false,
      error: null,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [storyboardContextData]
  );

  // Explicit slice: feedProject (typed for FeedCodeCityPanel)
  const feedProjectSlice = useMemo<DataSlice<FeedProjectSliceData>>(() => {
    if (!githubRepo) {
      return {
        scope: 'repository' as const,
        name: 'feedProject',
        data: null,
        loading: false,
        error: null,
        refresh: async () => { /* no-op */ },
      };
    }

    const [owner, repoName] = githubRepo.split('/');
    const repoDetails = collectionRepoDetails.find(r => r.full_name === githubRepo);

    const feedProjectData: FeedProjectSliceData = {
      repo: {
        owner: owner || '',
        name: repoName || '',
        fullName: githubRepo,
        description: repoDetails?.description ?? undefined,
        htmlUrl: `https://github.com/${githubRepo}`,
        stars: repoDetails?.stargazers_count ?? 0,
        forks: 0, // Not available in GitHubRepository type
        language: repoDetails?.language ?? undefined,
        updatedAt: repoDetails?.updated_at ?? undefined,
        avatarUrl: repoDetails?.owner?.avatar_url,
        license: repoDetails?.license ?? undefined,
        defaultBranch: repoDetails?.default_branch,
      },
    };

    return {
      scope: 'repository' as const,
      name: 'feedProject',
      data: feedProjectData,
      loading: collectionRepoDetailsLoading,
      error: null,
      refresh: async () => { /* no-op */ },
    };
  }, [githubRepo, collectionRepoDetails, collectionRepoDetailsLoading]);

  // Slices ref for dynamic/optional slices (now empty after full migration)
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Cache for memoizing individual repository objects
  // Key: repositoryId, Value: { data: AlexandriaEntryWithMetrics, hash: string }
  const repositoryCacheRef = useRef<Map<string, { data: AlexandriaEntryWithMetrics; hash: string }>>(new Map());

  // Memoized repositories computation - only recomputes when repository-relevant data changes
  const memoizedRepositories = useMemo<AlexandriaEntryWithMetrics[]>(() => {
    const selectedMemberships = collectionId
      ? userCollections.memberships.filter(m => m.collectionId === collectionId)
      : [];

    const cache = repositoryCacheRef.current;
    const newCache = new Map<string, { data: AlexandriaEntryWithMetrics; hash: string }>();

    const repositories = selectedMemberships.map(membership => {
      const [owner, repoName] = membership.repositoryId.split('/');
      const packages = collectionRepoPackages[membership.repositoryId] || [];
      const repoDetails = collectionRepoDetails.find(
        r => r.full_name === membership.repositoryId
      );

      // Create a hash of the data that affects this repository object
      // This allows us to preserve object references when data hasn't changed
      const hash = JSON.stringify({
        repositoryId: membership.repositoryId,
        addedAt: membership.addedAt,
        // Note: We intentionally exclude membership.metadata from the hash
        // because position/region changes shouldn't cause repository object recreation
        stars: repoDetails?.stargazers_count,
        language: repoDetails?.language,
        description: repoDetails?.description,
        pushed_at: repoDetails?.pushed_at,
        updated_at: repoDetails?.updated_at,
        license: repoDetails?.license,
        ownerAvatar: repoDetails?.owner?.avatar_url,
        packageCount: packages.length,
        packageFileCount: packages.reduce((sum, pkg) => {
          const pkgFileCount = pkg.derivedFrom?.fileSets?.reduce((acc, fs) =>
            acc + (fs.fileCount ?? fs.matchedFiles?.length ?? 0), 0) ?? 0;
          return sum + pkgFileCount;
        }, 0),
      });

      // Check if we have a cached version with the same hash
      const cached = cache.get(membership.repositoryId);
      if (cached && cached.hash === hash) {
        newCache.set(membership.repositoryId, cached);
        return cached.data;
      }

      // Calculate total file count from packages for metrics
      const totalFileCount = packages.reduce((sum, pkg) => {
        const pkgFileCount = pkg.derivedFrom?.fileSets?.reduce((acc, fs) =>
          acc + (fs.fileCount ?? fs.matchedFiles?.length ?? 0), 0) ?? 0;
        return sum + pkgFileCount;
      }, 0);

      const data: AlexandriaEntryWithMetrics = {
        name: repoName || membership.repositoryId,
        path: membership.repositoryId as ValidatedRepositoryPath,
        purl: undefined,
        remoteUrl: `https://github.com/${membership.repositoryId}`,
        registeredAt: new Date(membership.addedAt).toISOString(),
        hasViews: false,
        viewCount: 0,
        views: [],
        github: {
          id: membership.repositoryId,
          owner: owner || '',
          name: repoName || membership.repositoryId,
          stars: repoDetails?.stargazers_count ?? 0,
          lastUpdated: repoDetails?.updated_at ?? new Date(membership.addedAt).toISOString(),
          primaryLanguage: repoDetails?.language ?? undefined,
          description: repoDetails?.description ?? undefined,
          license: repoDetails?.license ?? undefined,
          ownerAvatar: repoDetails?.owner?.avatar_url ?? undefined,
        },
        lastChecked: undefined,
        lastOpenedAt: undefined,
        bookColor: undefined,
        theme: undefined,
        metrics: {
          fileCount: totalFileCount || undefined,
          lineCount: undefined,
          commitCount: undefined,
          contributors: undefined,
          lastEditedAt: repoDetails?.pushed_at ?? new Date(membership.addedAt).toISOString(),
          createdAt: new Date(membership.addedAt).toISOString(),
        },
        packages: packages.length > 0 ? packages : undefined,
      };

      newCache.set(membership.repositoryId, { data, hash });
      return data;
    });

    // Update cache ref
    repositoryCacheRef.current = newCache;

    return repositories;
  }, [
    collectionId,
    userCollections.memberships,
    collectionRepoDetails,
    collectionRepoPackages,
  ]);

  // Initialize slices on mount
  useEffect(() => {
    const initialSlices = new Map<string, DataSlice>();

    // All slices are now explicit (see useMemo above) - No Map initialization needed

    slicesRef.current = initialSlices;
  }, []);

  // Fetch GitHub repositories
  const fetchGithubRepos = useCallback(async () => {
    if (!isAuthenticated) {
      setGithubReposLoading(false);
      return;
    }

    setGithubReposLoading(true);
    try {
      const response = await fetch('/api/github/user/repos', {
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.isAuthenticated) {
        setGithubRepos({
          owned: data.owned || [],
          starred: data.starred || [],
          organizations: data.organizations || [],
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('[WorldsPageProvider] Failed to fetch GitHub repos:', error);
    } finally {
      setGithubReposLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch GitHub repositories on mount and auth change
  useEffect(() => {
    fetchGithubRepos();
  }, [fetchGithubRepos]);

  // Fetch collection repository details (progressively as each completes)
  useEffect(() => {
    if (!collectionRepositories || collectionRepositories.length === 0) {
      setCollectionRepoDetails([]);
      setCollectionRepoDetailsLoading(false);
      return;
    }

    setCollectionRepoDetailsLoading(true);
    setCollectionRepoDetails([]); // Reset before fetching

    let completed = 0;
    const total = collectionRepositories.length;

    collectionRepositories.forEach(async (repoId) => {
      const [owner, repo] = repoId.split('/');
      if (!owner || !repo) {
        completed++;
        if (completed === total) setCollectionRepoDetailsLoading(false);
        return;
      }

      try {
        const repoInfo = await trpc.github.getRepoInfo.query({ owner, repo });
        // Transform license object to SPDX string for GitHubRepository compatibility
        const transformedRepo: GitHubRepository = {
          ...repoInfo,
          license: repoInfo.license?.spdx_id ?? null,
        };
        setCollectionRepoDetails(prev => [...prev, transformedRepo]);
      } catch (error) {
        console.error(`Failed to fetch repo ${repoId}:`, error);
      } finally {
        completed++;
        if (completed === total) {
          setCollectionRepoDetailsLoading(false);
        }
      }
    });
  }, [collectionRepositories]);

  // Fetch packages for collection repositories (progressively as each completes)
  useEffect(() => {
    if (!collectionRepositories || collectionRepositories.length === 0) {
      setCollectionRepoPackages({});
      return;
    }

    setCollectionRepoPackages({}); // Reset before fetching

    collectionRepositories.forEach(async (repoId) => {
      const [owner, repo] = repoId.split('/');
      if (!owner || !repo) {
        return;
      }

      try {
        const data = await trpc.github.getRepoPackages.query({ owner, repo });
        setCollectionRepoPackages(prev => ({
          ...prev,
          [repoId]: data.packages || [],
        }));
      } catch (error) {
        console.error(`Failed to fetch packages for ${repoId}:`, error);
      }
    });
  }, [collectionRepositories]);

  // Fetch file tree when githubRepo changes
  useEffect(() => {
    if (!githubRepo) {
      setFileTree(null);
      setFileTreeLoading(false);
      return;
    }

    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) {
      setFileTreeError(new Error('Invalid repository format'));
      return;
    }

    setFileTreeLoading(true);
    setFileTreeError(null);

    const fetchFileTree = async () => {
      try {
        const data = await trpc.github.getTree.query({ owner, repo });

        // GitHub API returns { tree: [{ path, type, ... }] } - extract file info for blobs only
        const files = data.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({
            path: entry.path,
            size: entry.size || 0,
          }));
        const builder = new GitFileTreeBuilder();
        const tree = builder.build({
          files,
          rootPath: `/${owner}/${repo}`,
          commitSha: data.sha,
          branch: 'main',
        });

        setFileTree(tree);
        setFileTreeError(null);
      } catch (error) {
        console.error('[WorldsPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error instanceof Error ? error : new Error('Failed to fetch file tree'));
      } finally {
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [githubRepo]);

  // Adapters for file operations
  const adapters: PanelAdapters = useMemo(
    () => ({
      readFile: async (path: string): Promise<string> => {
        if (!githubRepo) {
          throw new Error('No repository selected');
        }

        // Strip the repo path prefix if present (e.g., /GitHub/owner/repo/file.txt -> file.txt)
        const repoPrefix = `/GitHub/${githubRepo}/`;
        const relativePath = path.startsWith(repoPrefix) ? path.slice(repoPrefix.length) : path;

        const [owner, repo] = githubRepo.split('/');
        if (!owner || !repo) {
          throw new Error('Invalid repository format');
        }

        const data = await trpc.github.readFile.query({
          owner,
          repo,
          path: relativePath,
        });

        return data.content;
      },
      matchesPath: (pattern: string, path: string): boolean => {
        return minimatch(path, pattern);
      },
    }),
    [githubRepo]
  );

  // Memoized selected collection - used in multiple places
  const memoizedSelectedCollection = useMemo(() => {
    if (!collectionId) return null;
    return userCollections.collections.find(c => c.id === collectionId) || null;
  }, [collectionId, userCollections.collections]);

  // Update selectedCollectionView slice when relevant data changes
  // Uses memoizedRepositories to preserve object references for unchanged repos
  useEffect(() => {
    setSelectedCollectionView({
      scope: 'workspace',
      name: 'selectedCollectionView',
      data: {
        collection: memoizedSelectedCollection,
        repositories: memoizedRepositories,
        dependencies: undefined,
      },
      loading: userCollections.loading,
      error: userCollections.error || null,
      refresh: async () => {},
    });
  }, [
    memoizedSelectedCollection,
    memoizedRepositories,
    userCollections.loading,
    userCollections.error,
  ]);

  // Selected collection for callback context (reuses memoizedSelectedCollection)
  const selectedCollection = memoizedSelectedCollection ?? undefined;

  // Build context value
  const context: PanelContextValue<WorldsPageContextType> = useMemo(
    () => ({
      currentScope: {
        type: 'workspace' as const,
        workspace,
        repository: githubRepo ? {
          ...repository,
          name: githubRepo.split('/')[1] || githubRepo,
          path: `/GitHub/${githubRepo}`,
          githubRepo,
        } : repository,
      },
      slices: slicesRef.current,
      adapters,
      selectedCollection,
      // Explicit typed slices (migrated from Map)
      userCollections: userCollectionsSlice,
      userProfile: userProfileSlice,
      // selectedCollectionView is managed as direct state for type safety (not in Map)
      selectedCollectionView: selectedCollectionView,
      workspaceRepositories: workspaceRepositoriesSlice,
      workspace: workspaceSlice,
      githubStarred: githubStarredSlice,
      githubProjects: githubProjectsSlice,
      'github-repositories': githubRepositoriesSlice,
      fileTree: fileTreeSlice,
      fileCityColorModes: fileCityColorModesSlice,
      quality: qualitySlice,
      'active-file': activeFileSlice,
      packages: packagesSlice, // Required by PackageCompositionPanel
      commitFiles: commitFilesSlice,
      storyboardContext: storyboardContextSlice,
      feedProject: feedProjectSlice,
      // Legacy methods - no-ops after migration to explicit slices
      // Actions handle refreshing - panels should use typed properties directly
      getSlice: () => undefined,
      getWorkspaceSlice: () => undefined,
      getRepositorySlice: () => undefined,
      hasSlice: () => false,
      isSliceLoading: () => false,
      refresh: async () => { /* no-op */ },
    }),
    [
      workspace,
      repository,
      githubRepo,
      adapters,
      selectedCollection,
      selectedCollectionView,
      userCollectionsSlice,
      userProfileSlice,
      workspaceSlice,
      workspaceRepositoriesSlice,
      packagesSlice,
      githubStarredSlice,
      githubProjectsSlice,
      githubRepositoriesSlice,
      fileTreeSlice,
      fileCityColorModesSlice,
      qualitySlice,
      activeFileSlice,
      commitFilesSlice,
      storyboardContextSlice,
      feedProjectSlice,
    ]
  );

  // Actions
  const actions: WorldsPagePanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('[WorldsPageProvider] Opening file:', filePath);
        setActiveFilePath(filePath);
        setActiveFileLoading(true);
        setActiveFileError(null);

        try {
          const content = await adapters.readFile!(filePath);
          setActiveFileContent(content);
          setActiveFileLoading(false);

          events.emit({
            type: 'file:opened',
            source: 'worlds-page',
            timestamp: Date.now(),
            payload: { path: filePath, content },
          });

          return content;
        } catch (error) {
          console.error('[WorldsPageProvider] Failed to open file:', error);
          setActiveFileError(error as Error);
          setActiveFileLoading(false);
          throw error;
        }
      },
      notifyPanels: (event) => {
        events.emit(event);
      },
      // Repository click handling - calls parent callback
      onRepositoryClicked: (repositoryId: string | null) => {
        console.log('[WorldsPageProvider] Repository clicked:', repositoryId);
        if (repositoryId) {
          onRepositoryClicked?.(repositoryId);
        }
      },
      selectedRepositoryId: githubRepo ?? null,
      fetchAudioUrls: async (context: { owner: string; repo: string; path: string; commitSha: string }) => {
        try {
          // Use tRPC for type-safe API call
          const data = await trpc.tts.batchGenerate.mutate(context);

          // Convert array of steps to Map<stepId, audioUrl>
          // Only include URLs where status='ready' (cached files that exist)
          const urls = new Map<string, string>();
          data.steps.forEach((step) => {
            if (step.status === 'ready') {
              urls.set(step.stepId, step.audioUrl);
            }
          });

          return urls;
        } catch (error) {
          console.error('[WorldsPageProvider] Error fetching audio URLs:', error);
          throw error;
        }
      },

      // Region management actions (CollectionMapPanelActions)
      onInitializeDefaultRegions: async (
        collectionId: string,
        regions: CustomRegion[],
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Initializing default regions:', collectionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: regions,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onSwitchLayoutMode: async (
        collectionId: string,
        mode: 'auto' | 'manual',
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Switching layout mode:', collectionId, mode);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const updatedMetadata = {
          ...(collection.metadata || {}),
          layoutMode: mode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onRegionCreated: async (
        collectionId: string,
        region: Omit<CustomRegion, 'id' | 'createdAt'>,
      ): Promise<CustomRegion> => {
        console.log('[WorldsPageProvider] Creating region:', region.name);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const newRegion: CustomRegion = {
          ...region,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };

        const currentLayoutMode = collection.metadata?.layoutMode || 'auto';
        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: [
            ...((collection.metadata?.customRegions as CustomRegion[]) || []),
            newRegion,
          ],
          // Auto-switch to manual mode when user manually creates a region
          layoutMode: currentLayoutMode === 'auto' ? 'manual' : currentLayoutMode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });

        return newRegion;
      },

      onRegionUpdated: async (
        collectionId: string,
        regionId: string,
        updates: Partial<CustomRegion>,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Updating region:', regionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const customRegions = (collection.metadata?.customRegions as CustomRegion[]) || [];
        const updatedRegions = customRegions.map((r) =>
          r.id === regionId ? { ...r, ...updates } : r,
        );

        const currentLayoutMode = collection.metadata?.layoutMode || 'auto';
        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: updatedRegions,
          layoutMode: currentLayoutMode === 'auto' ? 'manual' : currentLayoutMode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onRegionDeleted: async (
        collectionId: string,
        regionId: string,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Deleting region:', regionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const customRegions = (collection.metadata?.customRegions as CustomRegion[]) || [];
        const updatedRegions = customRegions.filter((r) => r.id !== regionId);

        const currentLayoutMode = collection.metadata?.layoutMode || 'auto';
        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: updatedRegions,
          layoutMode: currentLayoutMode === 'auto' ? 'manual' : currentLayoutMode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onRepositoryAssigned: async (
        collectionId: string,
        repositoryId: string,
        regionId: string,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Assigning repository to region:', repositoryId, regionId);

        await userCollections.updateMembershipMetadata(collectionId, repositoryId, {
          regionId,
        });
      },

      onRepositoryPositionUpdated: async (
        collectionId: string,
        repositoryId: string,
        layout: RepositoryLayoutData,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Updating repository position:', repositoryId);

        await userCollections.updateMembershipMetadata(collectionId, repositoryId, {
          layout,
        });
      },

      onBatchLayoutInitialized: async (
        collectionId: string,
        updates: {
          regions?: CustomRegion[];
          assignments?: Array<{ repositoryId: string; regionId: string }>;
          positions?: Array<{ repositoryId: string; layout: RepositoryLayoutData }>;
        },
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Batch initializing layout:', collectionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        // Update collection with regions if provided
        if (updates.regions && updates.regions.length > 0) {
          const updatedMetadata = {
            ...(collection.metadata || {}),
            customRegions: updates.regions,
          };

          await userCollections.updateCollection(collectionId, {
            metadata: updatedMetadata,
          });
        }

        // Update memberships with assignments and positions
        if (updates.assignments || updates.positions) {
          const membershipUpdates = userCollections.memberships
            .filter((m) => m.collectionId === collectionId)
            .map((m) => {
              const assignment = updates.assignments?.find(
                (a) => a.repositoryId === m.repositoryId,
              );
              const position = updates.positions?.find(
                (p) => p.repositoryId === m.repositoryId,
              );

              if (!assignment && !position) return null;

              const updatedMetadata = {
                ...(m.metadata || {}),
                ...(assignment ? { regionId: assignment.regionId } : {}),
                ...(position ? { layout: position.layout } : {}),
              };

              return {
                repositoryId: m.repositoryId,
                metadata: updatedMetadata,
              };
            })
            .filter((update): update is { repositoryId: string; metadata: { regionId?: string; layout?: RepositoryLayoutData } } => update !== null);

          // Update all memberships
          for (const update of membershipUpdates) {
            await userCollections.updateMembershipMetadata(
              collectionId,
              update.repositoryId,
              update.metadata,
            );
          }
        }
      },

      addRepositoryToCollection: async (
        collectionId: string,
        repositoryPath: string,
        repositoryMetadata?: Record<string, unknown>,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Adding repository to collection:', {
          collectionId,
          repositoryPath,
          repositoryMetadata,
          existingCollections: userCollections.collections.map(c => ({ id: c.id, name: c.name })),
        });
        try {
          await userCollections.addRepository(collectionId, repositoryPath, repositoryMetadata);
          console.log('[WorldsPageProvider] Repository added successfully');
        } catch (error) {
          console.error('[WorldsPageProvider] Failed to add repository:', error);
          throw error;
        }
      },
    }),
    [adapters, events, userCollections, onRepositoryClicked, githubRepo]
  );

  // Clear color mode
  const clearColorMode = useCallback(() => {
    setSelectedColorMode(null);
  }, []);

  // Listen for color mode events
  useEffect(() => {
    const unsubscribe = events.on('file-city:color-mode:select', (event) => {
      const payload = event.payload as { mode: ColorMode };
      setSelectedColorMode(payload.mode);
    });

    return unsubscribe;
  }, [events]);

  // Provider value
  const value: WorldsPageProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      selectedColorMode,
      clearColorMode,
    }),
    [context, actions, events, selectedColorMode, clearColorMode]
  );

  return <WorldsPageContext.Provider value={value}>{children}</WorldsPageContext.Provider>;
}

export function useWorldsPageProvider() {
  const context = useContext(WorldsPageContext);
  if (!context) {
    throw new Error('useWorldsPageProvider must be used within WorldsPageProvider');
  }
  return context;
}
