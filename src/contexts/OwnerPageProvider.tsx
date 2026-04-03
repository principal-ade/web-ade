'use client';

/**
 * Owner Page Provider
 * Page-specific context provider that only includes slices needed for the owner/[owner] page.
 *
 * Slices included:
 * - owner-repositories: Owner's GitHub repositories
 * - fileTree: File tree (when previewing a repo)
 * - fileCityColorModes: Color modes (for file-city panel)
 * - quality: Quality metrics (for quality panel and file-city)
 * - active-file: Active file (for file-city panel)
 * - packages: Packages (for package-composition panel)
 * - commitFiles: Commit files (for file-city panel)
 * - storyboardContext: Storyboard context (for visual-validation panel)
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  PanelEventBus,
  getGlobalToolRegistry,
  setGlobalToolRegistryEventEmitter,
} from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
  PanelEventEmitter,
  DataSlice,
  WorkspaceMetadata,
  RepositoryMetadata,
  PanelTool,
  PanelAdapters,
  ActiveFileSlice,
} from '@principal-ade/panel-framework-core';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import { minimatch } from 'minimatch';
import { GitFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import type { FileCityColorModesSliceData, CommitFilesSliceData, QualitySliceData, PackagesSliceData, ColorMode, LineCountsSliceData } from '@industry-theme/file-city-panel';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from './AuthContext';
import type {
  Collection,
  CustomRegion,
  RepositoryLayoutData,
} from '@principal-ai/alexandria-collections';
import type {
  AlexandriaEntryWithMetrics,
  SelectedCollectionView,
  CollectionMapPanelActions,
} from '@industry-theme/repository-composition-panels';
import { useCollectionPackages } from '@/hooks/useCollectionPackages';
import type { AlexandriaEntry } from '@principal-ai/alexandria-core-library';
import type { ValidatedRepositoryPath } from '@principal-ai/alexandria-core-library/types';
import type {
  OwnerRepositoriesSliceData,
  ProfileSlice,
} from '@industry-theme/github-panels';

// Extended owner info type that includes all fields from API response
interface ExtendedOwnerInfo {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  type: 'User' | 'Organization';
  public_repos: number;
  followers: number;
  following: number;
  blog: string | null;
  location: string | null;
  email: string | null;
  twitter_username: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

// ProfileSlice type is now imported from @industry-theme/github-panels

// Host-provided tools
const hostTools: PanelTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the current repository',
    inputs: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file within the repository',
        },
      },
      required: ['path'],
    },
    outputs: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The file content',
        },
      },
    },
    tags: ['file', 'read', 'content'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:read-file',
      source: 'ai-agent',
    },
  },
  {
    name: 'list_repositories',
    description: 'List GitHub repositories for the owner',
    inputs: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'The owner (user or org) to fetch repositories for',
        },
      },
      required: ['owner'],
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

// Type definitions imported from @industry-theme/file-city-panel:
// QualitySliceData, PackagesSliceData, ColorMode

// Owner page context type - includes only the slices needed for owner page
export interface OwnerPageContextType {
  'owner-repositories'?: DataSlice<OwnerRepositoriesSliceData>;
  ownerRepositories: DataSlice<OwnerRepositoriesSliceData>; // Required - expected by OwnerRepositoriesPanel
  profile: DataSlice<ProfileSlice>; // Required - expected by ProfilePanel
  fileTree: DataSlice<FileTree>;
  fileCityColorModes: DataSlice<FileCityColorModesSliceData>;
  quality?: DataSlice<QualitySliceData>;
  'active-file'?: DataSlice<ActiveFileSlice>;
  packages: DataSlice<PackagesSliceData>; // Required - expected by PackageCompositionPanel
  repositoryEntry: DataSlice<AlexandriaEntry | null>; // Required - expected by PackageCompositionPanel
  commitFiles?: DataSlice<CommitFilesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  selectedCollectionView: SelectedCollectionView;
  lineCounts?: DataSlice<LineCountsSliceData | null>;
}

interface OwnerPageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
  initialOwner?: string;
  /** Callback when a repository is clicked in the overworld map */
  onRepositoryClicked?: (repositoryId: string) => void;
}

interface OwnerPageProviderValue {
  context: PanelContextValue<OwnerPageContextType>;
  actions: CollectionMapPanelActions;
  events: PanelEventEmitter;
  selectedColorMode: string | null;
  clearColorMode: () => void;
}

const OwnerPageContext = createContext<OwnerPageProviderValue | null>(null);

export function OwnerPageProvider({
  children,
  workspace,
  repository,
  githubRepo,
  initialOwner,
  onRepositoryClicked,
}: OwnerPageProviderProps) {
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

    console.log('[OwnerPageProvider] Tool registry initialized');

    return () => {
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state
  const { isAuthenticated } = useAuth();

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

  // State for owner repositories
  const [ownerRepos, setOwnerRepos] = useState<OwnerRepositoriesSliceData>({
    owner: null,
    repositories: [],
    isAuthenticated: false,
  });
  const [extendedOwnerInfo, setExtendedOwnerInfo] = useState<ExtendedOwnerInfo | null>(null);
  const [ownerReposLoading, setOwnerReposLoading] = useState(true);
  const [currentOwner, setCurrentOwner] = useState<string | null>(null);

  // State for owner collections
  const [ownerCollections, setOwnerCollections] = useState<Collection[]>([]);
  const [ownerCollectionsLoading, setOwnerCollectionsLoading] = useState(false);

  // State for quality metrics
  const [qualityData] = useState<QualitySliceData | null>(null);
  const [qualityLoading] = useState(false);
  const [qualityError] = useState<Error | null>(null);

  // State for packages
  const [packagesData] = useState<PackagesSliceData | null>(null);
  const [packagesLoading] = useState(false);
  const [packagesError] = useState<Error | null>(null);

  // State for commit files
  const [commitFilesData] = useState<CommitFilesSliceData | null>(null);

  // State for storyboard context
  const [storyboardContextData] = useState<StoryboardContextSliceData | null>(null);

  // State for line counts (for File City 3D building heights)
  const [lineCountsData, setLineCountsData] = useState<LineCountsSliceData | null>(null);
  const [lineCountsLoading, setLineCountsLoading] = useState(false);

  // State for enabled color modes
  const [enabledColorModes] = useState<ColorMode[]>([]);

  // State for selectedCollectionView (for CollectionMapPanel)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

  // Compute first 10 repos ONCE to ensure consistency between collection and repositories
  const first10Repos = useMemo(() => {
    if (!ownerRepos.repositories || ownerRepos.repositories.length === 0) {
      return [];
    }
    return ownerRepos.repositories.slice(0, 10);
  }, [ownerRepos.repositories]);

  // Get repo IDs for package fetching (derived from first10Repos)
  const virtualCollectionRepoIds = useMemo(() => {
    return first10Repos.map(repo => repo.full_name);
  }, [first10Repos]);

  // Fetch packages for the virtual collection repositories
  const { packages: collectionRepoPackages } = useCollectionPackages(virtualCollectionRepoIds);

  // Create virtual collection from first 10 repos for the world view
  const virtualCollection = useMemo<Collection | null>(() => {
    if (!initialOwner || first10Repos.length === 0) {
      return null;
    }
    return {
      id: `virtual-${initialOwner}`,
      name: `${initialOwner}'s Repositories`,
      description: `Top repositories from ${initialOwner}`,
      visibility: 'public' as const,
      owner: initialOwner,
      ownerType: 'user' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      members: first10Repos.map((repo) => ({
        repositoryId: repo.full_name,
        collectionId: `virtual-${initialOwner}`,
        addedAt: repo.updated_at ? new Date(repo.updated_at).getTime() : Date.now(),
      })),
    };
  }, [initialOwner, first10Repos]);

  // Transform repos into AlexandriaEntryWithMetrics for CollectionMapPanel
  const virtualCollectionRepositories = useMemo<AlexandriaEntryWithMetrics[]>(() => {
    if (first10Repos.length === 0) {
      return [];
    }
    return first10Repos.map((repo): AlexandriaEntryWithMetrics => ({
      name: repo.name,
      path: repo.full_name as ValidatedRepositoryPath,
      purl: undefined,
      remoteUrl: repo.html_url,
      registeredAt: repo.created_at || new Date().toISOString(),
      hasViews: false,
      viewCount: 0,
      views: [],
      github: {
        id: repo.full_name,
        owner: repo.owner?.login || initialOwner || '',
        name: repo.name,
        stars: repo.stargazers_count || 0,
        lastUpdated: repo.updated_at || new Date().toISOString(),
        primaryLanguage: repo.language || undefined,
        description: repo.description || undefined,
        license: typeof repo.license === 'string' ? repo.license : repo.license?.spdx_id,
        ownerAvatar: repo.owner?.avatar_url,
        ownerDisplayName: extendedOwnerInfo?.name ?? undefined,
      },
      lastChecked: undefined,
      lastOpenedAt: undefined,
      bookColor: undefined,
      theme: undefined,
      metrics: {
        fileCount: undefined,
        lineCount: undefined,
        commitCount: undefined,
        contributors: undefined,
        lastEditedAt: repo.pushed_at || repo.updated_at || new Date().toISOString(),
        createdAt: repo.created_at || new Date().toISOString(),
      },
      packages: collectionRepoPackages[repo.full_name] || undefined,
    }));
  }, [first10Repos, initialOwner, collectionRepoPackages, extendedOwnerInfo]);

  // ===== EXPLICIT SLICES (migrated from Map) =====

  // Explicit slice: ownerRepositories (required - expected by OwnerRepositoriesPanel)
  const ownerRepositoriesSlice = useMemo<DataSlice<OwnerRepositoriesSliceData>>(
    () => ({
      scope: 'global' as const,
      name: 'owner-repositories',
      data: ownerRepos,
      loading: ownerReposLoading,
      error: ownerRepos.error ? new Error(ownerRepos.error) : null,
      refresh: async () => { /* no-op */ },
    }),
    [ownerRepos, ownerReposLoading]
  );

  // Derive selectedRepositoryId from githubRepo
  const selectedRepositoryId = useMemo(() => {
    if (!githubRepo || !ownerRepos.repositories) return null;
    const repo = ownerRepos.repositories.find((r) => r.full_name === githubRepo);
    return repo?.id ?? null;
  }, [githubRepo, ownerRepos.repositories]);

  // Build profile object based on type (User vs Organization)
  const buildProfile = useCallback((info: ExtendedOwnerInfo) => {
    const baseProfile = {
      login: info.login,
      id: info.id,
      avatar_url: info.avatar_url,
      name: info.name || null,
      company: null,
      blog: info.blog || null,
      location: info.location || null,
      email: info.email || null,
      twitter_username: info.twitter_username || null,
      public_repos: info.public_repos || 0,
      public_gists: 0,
      followers: info.followers || 0,
      following: info.following || 0,
      html_url: info.html_url || `https://github.com/${info.login}`,
      created_at: info.created_at || new Date().toISOString(),
      updated_at: info.updated_at || new Date().toISOString(),
    };

    if (info.type === 'Organization') {
      return {
        ...baseProfile,
        description: info.bio || null,
        is_verified: false,
        has_organization_projects: true,
        has_repository_projects: true,
        type: 'Organization' as const,
      };
    } else {
      return {
        ...baseProfile,
        bio: info.bio || null,
        type: 'User' as const,
      };
    }
  }, []);

  // Explicit slice: profile (required - expected by ProfilePanel)
  const profileSlice = useMemo<DataSlice<ProfileSlice>>(
    () => ({
      scope: 'global' as const,
      name: 'profile',
      data: {
        profile: extendedOwnerInfo ? buildProfile(extendedOwnerInfo) : null,
        collections: ownerCollections,
        repositories: ownerRepos.repositories || [],
        selectedRepositoryId,
        loading: ownerReposLoading || ownerCollectionsLoading,
        error: ownerRepos.error,
      },
      loading: ownerReposLoading || ownerCollectionsLoading,
      error: ownerRepos.error ? new Error(ownerRepos.error) : null,
      refresh: async () => { /* no-op */ },
    }),
    [extendedOwnerInfo, buildProfile, ownerRepos.repositories, ownerRepos.error, ownerReposLoading, selectedRepositoryId, ownerCollections, ownerCollectionsLoading]
  );

  // Explicit slice: fileTree
  const fileTreeSlice = useMemo<DataSlice<FileTree>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileTree',
      data: fileTree,
      loading: fileTreeLoading,
      error: fileTreeError,
      refresh: async () => { /* no-op */ },
    }),
    [fileTree, fileTreeLoading, fileTreeError]
  );

  // Explicit slice: quality
  const qualitySlice = useMemo<DataSlice<QualitySliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'quality',
      data: qualityData,
      loading: qualityLoading,
      error: qualityError,
      refresh: async () => { /* no-op */ },
    }),
    [qualityData, qualityLoading, qualityError]
  );

  // Explicit slice: fileCityColorModes
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
      refresh: async () => { /* no-op */ },
    }),
    [enabledColorModes, selectedColorMode, qualityData, qualityLoading, qualityError]
  );

  // Explicit slice: active-file
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

  // Explicit slice: packages (required - expected by PackageCompositionPanel)
  const packagesSlice = useMemo<DataSlice<PackagesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'packages',
      data: packagesData,
      loading: packagesLoading,
      error: packagesError,
      refresh: async () => { /* no-op */ },
    }),
    [packagesData, packagesLoading, packagesError]
  );

  // Explicit slice: repositoryEntry (required - expected by PackageCompositionPanel)
  const repositoryEntrySlice = useMemo<DataSlice<AlexandriaEntry | null>>(
    () => ({
      scope: 'repository' as const,
      name: 'repositoryEntry',
      data: null,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    []
  );

  // Explicit slice: commitFiles
  const commitFilesSlice = useMemo<DataSlice<CommitFilesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'commitFiles',
      data: commitFilesData,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [commitFilesData]
  );

  // Explicit slice: storyboardContext
  const storyboardContextSlice = useMemo<DataSlice<StoryboardContextSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'storyboardContext',
      data: storyboardContextData,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [storyboardContextData]
  );

  // Explicit slice: lineCounts (for File City 3D building heights)
  const lineCountsSlice = useMemo<DataSlice<LineCountsSliceData | null>>(
    () => ({
      scope: 'repository' as const,
      name: 'lineCounts',
      data: lineCountsData,
      loading: lineCountsLoading,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [lineCountsData, lineCountsLoading]
  );

  // Explicit slice: selectedCollectionView (special - used by CollectionMapPanel)
  // Uses virtual collection created from owner's first 10 repos
  const selectedCollectionViewSlice = useMemo<SelectedCollectionView>(
    () => ({
      scope: 'workspace' as const,
      name: 'selectedCollectionView',
      data: {
        collection: selectedCollection || virtualCollection,
        repositories: virtualCollectionRepositories,
        dependencies: undefined,
      },
      loading: ownerReposLoading,
      error: ownerRepos.error ? new Error(ownerRepos.error) : null,
      refresh: async () => { /* no-op */ },
    }),
    [selectedCollection, virtualCollection, virtualCollectionRepositories, ownerReposLoading, ownerRepos.error]
  );

  // Slices ref (now empty after full migration)
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    // All slices are now explicit (see useMemo above) - No Map initialization needed
    const initialSlices = new Map<string, DataSlice>();
    slicesRef.current = initialSlices;
    console.log('[OwnerPageProvider] All slices are now explicit - Map is empty');
  }, []);

  // Fetch owner repositories
  const fetchOwnerRepos = useCallback(async (owner: string) => {
    if (!owner) return;

    setOwnerReposLoading(true);
    setCurrentOwner(owner);

    try {
      const response = await fetch(`/api/github/owner/${owner}/repos`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOwnerRepos({
          owner: data.owner || null,
          repositories: data.repositories || [],
          isAuthenticated,
        });
        // Store extended owner info for ProfilePanel
        if (data.owner) {
          setExtendedOwnerInfo(data.owner as ExtendedOwnerInfo);
        } else {
          setExtendedOwnerInfo(null);
        }
      } else {
        setOwnerRepos({
          owner: null,
          repositories: [],
          isAuthenticated,
          error: data.error || 'Failed to load repositories',
        });
        setExtendedOwnerInfo(null);
      }
    } catch (error) {
      console.error('[OwnerPageProvider] Failed to fetch owner repos:', error);
      setOwnerRepos({
        owner: null,
        repositories: [],
        isAuthenticated,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setExtendedOwnerInfo(null);
    } finally {
      setOwnerReposLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch owner repositories when owner changes
  useEffect(() => {
    if (initialOwner && initialOwner !== currentOwner) {
      fetchOwnerRepos(initialOwner);
    }
  }, [initialOwner, currentOwner, fetchOwnerRepos]);

  // Fetch owner collections
  const fetchOwnerCollections = useCallback(async (owner: string) => {
    if (!owner) return;

    setOwnerCollectionsLoading(true);
    try {
      const response = await fetch(`/api/github/collections/${owner}`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.collections) {
        setOwnerCollections(data.collections);
      } else {
        setOwnerCollections([]);
      }
    } catch (error) {
      console.error('[OwnerPageProvider] Failed to fetch owner collections:', error);
      setOwnerCollections([]);
    } finally {
      setOwnerCollectionsLoading(false);
    }
  }, []);

  // Fetch owner collections when owner changes
  useEffect(() => {
    if (initialOwner) {
      fetchOwnerCollections(initialOwner);
    }
  }, [initialOwner, fetchOwnerCollections]);

  // Fetch file tree when githubRepo changes
  useEffect(() => {
    console.log('[OwnerPageProvider] githubRepo changed:', githubRepo);
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
        console.error('[OwnerPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error instanceof Error ? error : new Error('Failed to fetch file tree'));
      } finally {
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [githubRepo]);

  // Fetch line counts when githubRepo changes
  useEffect(() => {
    if (!githubRepo) {
      setLineCountsData(null);
      setLineCountsLoading(false);
      return;
    }

    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) return;

    setLineCountsLoading(true);

    const fetchLineCounts = async () => {
      try {
        const response = await fetch(`/api/line-counts/${owner}/${repo}`);
        const data = await response.json();

        if (data.available) {
          console.log('[OwnerPageProvider] Line counts loaded:', Object.keys(data.data.lineCounts).length, 'files');
          setLineCountsData({
            lineCounts: data.data.lineCounts,
            status: 'available',
          });
        } else {
          console.log('[OwnerPageProvider] Line counts unavailable:', data.reason);
          setLineCountsData({
            lineCounts: {},
            status: data.reason as 'too-large' | 'auth-required',
            message: data.message,
          });
        }
      } catch (error) {
        console.error('[OwnerPageProvider] Failed to fetch line counts:', error);
        setLineCountsData(null);
      } finally {
        setLineCountsLoading(false);
      }
    };

    fetchLineCounts();
  }, [githubRepo]);

  // Note: refresh is now a no-op inline function in the context
  // Actions handle data refreshing - React handles reactivity through useMemo dependencies

  // Adapters for file operations
  // TODO: Centralize adapter creation into a shared hook (e.g., useGitHubAdapters)
  // to reduce duplication across OwnerPageProvider, ActivityPageProvider,
  // RepositoryPageProvider, and WorldsPageProvider
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

  // All slices are now explicit useMemo slices (see above)
  // No Map-based updating needed - React handles reactivity automatically through useMemo dependencies

  // Build context value
  // All slices are now explicit - use typed properties directly
  const context: PanelContextValue<OwnerPageContextType> = useMemo(
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
      // Empty Map - all slices are now explicit (required by interface)
      slices: slicesRef.current,
      adapters,

      // ===== EXPLICIT TYPED SLICES (migrated from Map) =====
      // Required slices
      'owner-repositories': ownerRepositoriesSlice,
      ownerRepositories: ownerRepositoriesSlice, // Alias for panels expecting camelCase
      profile: profileSlice, // Required for ProfilePanel
      packages: packagesSlice,
      repositoryEntry: repositoryEntrySlice,
      selectedCollectionView: selectedCollectionViewSlice,

      // Optional slices
      fileTree: fileTreeSlice,
      fileCityColorModes: fileCityColorModesSlice,
      quality: qualitySlice,
      'active-file': activeFileSlice,
      commitFiles: commitFilesSlice,
      storyboardContext: storyboardContextSlice,
      lineCounts: lineCountsSlice,

      // ===== LEGACY METHODS (no-ops for interface compatibility) =====
      // All slices are now explicit - use typed properties above instead
      getSlice: () => undefined,
      getWorkspaceSlice: () => undefined,
      getRepositorySlice: () => undefined,
      hasSlice: () => false,
      isSliceLoading: () => false,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op - use actions instead */ },
    }),
    [
      workspace,
      repository,
      githubRepo,
      adapters,
      // All explicit slices
      ownerRepositoriesSlice,
      profileSlice,
      packagesSlice,
      repositoryEntrySlice,
      selectedCollectionViewSlice,
      fileTreeSlice,
      fileCityColorModesSlice,
      qualitySlice,
      activeFileSlice,
      commitFilesSlice,
      storyboardContextSlice,
      lineCountsSlice,
    ]
  );

  // Actions
  const actions: CollectionMapPanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('[OwnerPageProvider] Opening file:', filePath);
        setActiveFilePath(filePath);
        setActiveFileLoading(true);
        setActiveFileError(null);

        try {
          const content = await adapters.readFile!(filePath);
          setActiveFileContent(content);
          setActiveFileLoading(false);

          events.emit({
            type: 'file:opened',
            source: 'owner-page',
            timestamp: Date.now(),
            payload: { path: filePath, content },
          });

          return content;
        } catch (error) {
          console.error('[OwnerPageProvider] Failed to open file:', error);
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
        console.log('[OwnerPageProvider] Repository clicked:', repositoryId);
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
          console.error('[OwnerPageProvider] Error fetching audio URLs:', error);
          throw error;
        }
      },
      // Region management callbacks for CollectionMapPanel
      // Owner page uses ephemeral collections - all operations are local only
      onRegionCreated: async (collectionId: string, region: Omit<CustomRegion, 'id'>) => {
        // Generate a local ID for the ephemeral region
        const newRegion: CustomRegion = {
          ...region,
          id: `ephemeral-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };

        // Update local state only
        if (selectedCollection && selectedCollection.id === collectionId) {
          const customRegions = selectedCollection.metadata?.customRegions || [];
          setSelectedCollection({
            ...selectedCollection,
            metadata: {
              ...selectedCollection.metadata,
              customRegions: [...customRegions, newRegion],
            },
          });
        }

        return newRegion;
      },
      onRegionUpdated: async (collectionId: string, regionId: string, updates: Partial<CustomRegion>) => {
        // Update local state only (ephemeral collection)
        if (selectedCollection && selectedCollection.id === collectionId) {
          const customRegions = selectedCollection.metadata?.customRegions || [];
          const updatedRegions = customRegions.map(r =>
            r.id === regionId ? { ...r, ...updates } : r
          );
          setSelectedCollection({
            ...selectedCollection,
            metadata: {
              ...selectedCollection.metadata,
              customRegions: updatedRegions,
            },
          });
        }
      },
      onRegionDeleted: async (collectionId: string, regionId: string) => {
        // Update local state only (ephemeral collection)
        if (selectedCollection && selectedCollection.id === collectionId) {
          const customRegions = selectedCollection.metadata?.customRegions || [];
          const updatedRegions = customRegions.filter(r => r.id !== regionId);
          setSelectedCollection({
            ...selectedCollection,
            metadata: {
              ...selectedCollection.metadata,
              customRegions: updatedRegions,
            },
          });
        }
      },
      onRepositoryAssigned: async (collectionId: string, repositoryId: string, regionId: string) => {
        // Update local state only (ephemeral collection)
        if (selectedCollection && selectedCollection.id === collectionId) {
          const updatedMembers = selectedCollection.members.map(m =>
            m.repositoryId === repositoryId
              ? { ...m, metadata: { ...m.metadata, regionId } }
              : m
          );
          setSelectedCollection({
            ...selectedCollection,
            members: updatedMembers,
          });
        }
      },
      onRepositoryPositionUpdated: async (collectionId: string, repositoryId: string, layout: RepositoryLayoutData) => {
        // Update local state only (ephemeral collection)
        if (selectedCollection && selectedCollection.id === collectionId) {
          const updatedMembers = selectedCollection.members.map(m =>
            m.repositoryId === repositoryId
              ? { ...m, metadata: { ...m.metadata, layout } }
              : m
          );
          setSelectedCollection({
            ...selectedCollection,
            members: updatedMembers,
          });
        }
      },
      onBatchLayoutInitialized: async (collectionId: string, updates: {
        regions?: CustomRegion[];
        assignments?: Array<{ repositoryId: string; regionId: string }>;
        positions?: Array<{ repositoryId: string; layout: RepositoryLayoutData }>;
      }) => {
        // Owner page uses ephemeral/virtual collections - no persistence needed
        // Update local state only (no API call)
        if (selectedCollection && selectedCollection.id === collectionId) {
          const updatedCollection = { ...selectedCollection };

          // Update regions if provided
          if (updates.regions && updates.regions.length > 0) {
            updatedCollection.metadata = {
              ...updatedCollection.metadata,
              customRegions: updates.regions,
            };
          }

          // Apply assignments and positions to members
          if ((updates.assignments && updates.assignments.length > 0) ||
              (updates.positions && updates.positions.length > 0)) {
            const updatedMembers = updatedCollection.members.map(m => {
              const updatedMember = { ...m };

              // Apply region assignment
              const assignment = updates.assignments?.find(a => a.repositoryId === m.repositoryId);
              if (assignment) {
                updatedMember.metadata = { ...updatedMember.metadata, regionId: assignment.regionId };
              }

              // Apply position
              const position = updates.positions?.find(p => p.repositoryId === m.repositoryId);
              if (position) {
                updatedMember.metadata = { ...updatedMember.metadata, layout: position.layout };
              }

              return updatedMember;
            });

            updatedCollection.members = updatedMembers;
          }

          setSelectedCollection(updatedCollection);
        }
      },

      addRepositoryToCollection: async (
        _collectionId: string,
        repositoryPath: string,
      ): Promise<void> => {
        // TODO: Implement API-based repository addition for other users' collections
        console.log('[OwnerPageProvider] Adding repository to collection not yet supported:', repositoryPath);
        alert('Adding repositories to collections on profile pages is coming soon!');
      },
    }),
    [adapters, events, selectedCollection, onRepositoryClicked, githubRepo]
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
  const value: OwnerPageProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      selectedColorMode,
      clearColorMode,
    }),
    [context, actions, events, selectedColorMode, clearColorMode]
  );

  return <OwnerPageContext.Provider value={value}>{children}</OwnerPageContext.Provider>;
}

export function useOwnerPageProvider() {
  const context = useContext(OwnerPageContext);
  if (!context) {
    throw new Error('useOwnerPageProvider must be used within OwnerPageProvider');
  }
  return context;
}
