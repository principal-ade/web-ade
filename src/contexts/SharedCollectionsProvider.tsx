'use client';

/**
 * Shared Collections Provider
 * Context provider for viewing other users' shared collections.
 *
 * This is a simplified provider specifically for the /worlds/[username] page
 * where we're viewing someone else's collections (read-only).
 *
 * Slices included:
 * - selectedCollectionView: The selected collection with repositories
 * - workspaceRepositories: Repository details in the collection
 * - workspace: Workspace metadata
 */

import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import {
  PanelEventBus,
} from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  DataSlice,
  WorkspaceMetadata,
  PanelAdapters,
} from '@principal-ade/panel-framework-core';
import type { ValidatedRepositoryPath } from '@principal-ai/alexandria-core-library/types';
import type { Collection } from '@principal-ai/alexandria-collections';
import { GitFileTreeBuilder, type FileTree } from '@principal-ai/repository-abstraction';
import type { FileCityColorModesSliceData, ColorMode, FeedProjectSliceData } from '@industry-theme/file-city-panel';
import { trpc } from '@/lib/trpc/client';
import type {
  WorkspaceSlice,
  WorkspaceCollectionRepositoriesSlice,
  GitHubRepository,
  UserProfileSlice,
  GitHubUserProfile,
} from '@industry-theme/alexandria-panels';
import type {
  AlexandriaEntryWithMetrics,
  SelectedCollectionView,
  CollectionMapPanelActions,
} from '@industry-theme/repository-composition-panels';
import type { CustomRegion } from '@principal-ai/alexandria-collections';
import type { PackageLayer } from '@principal-ai/codebase-composition';

// Minimal context type for shared collections view
export interface SharedCollectionsContextType {
  selectedCollectionView: SelectedCollectionView;
  workspaceRepositories: DataSlice<WorkspaceCollectionRepositoriesSlice>;
  workspace: DataSlice<WorkspaceSlice>;
  userProfile: DataSlice<UserProfileSlice>;
  fileTree: DataSlice<FileTree>;
  fileCityColorModes: DataSlice<FileCityColorModesSliceData>;
  feedProject: DataSlice<FeedProjectSliceData>;
}

interface SharedCollectionsProviderProps {
  children: ReactNode;
  collection: Collection | null;
  collectionRepositories: string[];
  username: string;
  userProfile: GitHubUserProfile;
  /** Callback when a repository is clicked in the overworld map */
  onRepositoryClicked?: (repositoryId: string) => void;
  /** Currently selected repository ID (for visual highlight) */
  selectedRepositoryId?: string | null;
}

// Extended actions for shared collections (includes CollectionMapPanelActions for read-only view)
interface SharedCollectionsPanelActions extends PanelActions, CollectionMapPanelActions {}

interface SharedCollectionsProviderValue {
  context: PanelContextValue<SharedCollectionsContextType>;
  actions: SharedCollectionsPanelActions;
  events: PanelEventEmitter;
}

const SharedCollectionsContext = createContext<SharedCollectionsProviderValue | null>(null);

export function SharedCollectionsProvider({
  children,
  collection,
  collectionRepositories,
  username,
  userProfile,
  onRepositoryClicked,
  selectedRepositoryId,
}: SharedCollectionsProviderProps) {
  // Initialize event bus
  const events = useMemo(() => new PanelEventBus(), []);

  // State for collection repository details (fetched from GitHub API)
  const [collectionRepoDetails, setCollectionRepoDetails] = useState<GitHubRepository[]>([]);
  const [collectionRepoDetailsLoading, setCollectionRepoDetailsLoading] = useState(false);

  // State for file tree (for File City panel)
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // State for collection repository packages (for sprite sizing on map)
  const [collectionRepoPackages, setCollectionRepoPackages] = useState<Record<string, PackageLayer[]>>({});

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
        setCollectionRepoDetails(prev => [...prev, repoInfo as unknown as GitHubRepository]);
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

  // Fetch packages for collection repositories (progressively for sprite sizing)
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
        console.error(`[SharedCollectionsProvider] Failed to fetch packages for ${repoId}:`, error);
      }
    });
  }, [collectionRepositories]);

  // Fetch file tree when selectedRepositoryId changes
  useEffect(() => {
    if (!selectedRepositoryId) {
      setFileTree(null);
      setFileTreeLoading(false);
      setFileTreeError(null);
      return;
    }

    const [owner, repo] = selectedRepositoryId.split('/');
    if (!owner || !repo) {
      setFileTreeError(new Error('Invalid repository format'));
      return;
    }

    setFileTreeLoading(true);
    setFileTreeError(null);

    const fetchFileTree = async () => {
      try {
        const data = await trpc.github.getTree.query({ owner, repo });

        // Build FileTree from GitHub tree data
        const fileTreeBuilder = new GitFileTreeBuilder();
        const files = data.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({
            path: entry.path,
            size: entry.size || 0,
          }));

        const builtTree = fileTreeBuilder.build({
          files,
          rootPath: `/${owner}/${repo}`,
          commitSha: data.sha,
          branch: 'main',
        });

        setFileTree(builtTree);
        setFileTreeLoading(false);
      } catch (error) {
        console.error('[SharedCollectionsProvider] Failed to fetch file tree:', error);
        setFileTreeError(error instanceof Error ? error : new Error('Failed to fetch file tree'));
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [selectedRepositoryId]);

  // Build workspace metadata
  const workspace: WorkspaceMetadata = useMemo(() => ({
    name: collection?.name || 'Shared Collections',
    path: `/worlds/${username}`,
  }), [collection, username]);

  // Build workspace slice
  const workspaceSlice = useMemo<DataSlice<WorkspaceSlice>>(
    () => ({
      scope: 'workspace' as const,
      name: 'workspace',
      data: collection ? {
        workspace: {
          id: collection.id,
          name: collection.name,
          description: collection.description || '',
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
        },
        loading: false,
        error: undefined,
      } : null,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [collection]
  );

  // Build workspaceRepositories slice
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
      refresh: async () => { /* no-op */ },
    }),
    [collectionRepoDetails, collectionRepoDetailsLoading]
  );

  // Build userProfile slice
  const userProfileSlice = useMemo<DataSlice<UserProfileSlice>>(
    () => ({
      scope: 'global' as const,
      name: 'userProfile',
      data: {
        user: userProfile,
        collections: collection ? [collection] : [],
        repositories: [],
        starredRepositories: [],
        currentView: 'profile' as const,
        loading: false,
        error: undefined,
      },
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [userProfile, collection]
  );

  // Build fileTree slice
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

  // Build fileCityColorModes slice (minimal - just basic color mode)
  const fileCityColorModesSlice = useMemo<DataSlice<FileCityColorModesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileCityColorModes',
      data: {
        enabledModes: ['fileTypes' as ColorMode],
        selectedColorMode: 'fileTypes' as ColorMode,
        qualityData: undefined,
      },
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    []
  );

  // Build feedProject slice for FeedCodeCityPanel
  const feedProjectSlice = useMemo<DataSlice<FeedProjectSliceData>>(() => {
    if (!selectedRepositoryId) {
      return {
        scope: 'repository' as const,
        name: 'feedProject',
        data: null,
        loading: false,
        error: null,
        refresh: async () => { /* no-op */ },
      };
    }

    const [owner, repoName] = selectedRepositoryId.split('/');
    const repoDetails = collectionRepoDetails.find(r => r.full_name === selectedRepositoryId);

    const feedProjectData: FeedProjectSliceData = {
      repo: {
        owner: owner || '',
        name: repoName || '',
        fullName: selectedRepositoryId,
        description: repoDetails?.description ?? undefined,
        htmlUrl: `https://github.com/${selectedRepositoryId}`,
        stars: repoDetails?.stargazers_count ?? 0,
        forks: 0,
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
  }, [selectedRepositoryId, collectionRepoDetails, collectionRepoDetailsLoading]);

  // Build selectedCollectionView slice
  const selectedCollectionView = useMemo<SelectedCollectionView>(() => {
    const repositories: AlexandriaEntryWithMetrics[] = collectionRepositories.map(repoId => {
      const [owner, repoName] = repoId.split('/');
      const repoDetails = collectionRepoDetails.find(r => r.full_name === repoId);
      const packages = collectionRepoPackages[repoId] || [];

      return {
        name: repoName || repoId,
        path: repoId as ValidatedRepositoryPath,
        purl: undefined,
        remoteUrl: `https://github.com/${repoId}`,
        registeredAt: new Date().toISOString(),
        hasViews: false,
        viewCount: 0,
        views: [],
        github: {
          id: repoId,
          owner: owner || '',
          name: repoName || repoId,
          stars: repoDetails?.stargazers_count ?? 0,
          lastUpdated: repoDetails?.updated_at ?? new Date().toISOString(),
          primaryLanguage: repoDetails?.language ?? undefined,
          description: repoDetails?.description ?? undefined,
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
          lastEditedAt: repoDetails?.pushed_at ?? new Date().toISOString(),
          createdAt: new Date().toISOString(),
          packageCount: packages.length,
        },
        packages: packages.length > 0 ? packages : undefined,
      };
    });

    return {
      scope: 'workspace',
      name: 'selectedCollectionView',
      data: {
        collection: collection || null,
        repositories,
        dependencies: undefined,
      },
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    };
  }, [collection, collectionRepositories, collectionRepoDetails, collectionRepoPackages]);

  // Minimal adapters
  const adapters: PanelAdapters = useMemo(() => ({}), []);

  // Build context value
  const context: PanelContextValue<SharedCollectionsContextType> = useMemo(
    () => ({
      currentScope: {
        type: 'workspace' as const,
        workspace,
        repository: undefined,
      },
      slices: new Map(),
      adapters,
      selectedCollection: collection || undefined,
      // Explicit typed slices
      selectedCollectionView,
      workspaceRepositories: workspaceRepositoriesSlice,
      workspace: workspaceSlice,
      userProfile: userProfileSlice,
      fileTree: fileTreeSlice,
      fileCityColorModes: fileCityColorModesSlice,
      feedProject: feedProjectSlice,
      // Legacy methods - no-ops
      getSlice: () => undefined,
      getWorkspaceSlice: () => undefined,
      getRepositorySlice: () => undefined,
      hasSlice: () => false,
      isSliceLoading: () => false,
      refresh: async () => { /* no-op */ },
    }),
    [workspace, adapters, collection, selectedCollectionView, workspaceRepositoriesSlice, workspaceSlice, userProfileSlice, fileTreeSlice, fileCityColorModesSlice, feedProjectSlice]
  );

  // Actions - read-only view (CollectionMapPanelActions are no-ops except for click handling)
  const actions: SharedCollectionsPanelActions = useMemo(
    () => ({
      notifyPanels: (event) => {
        events.emit(event);
      },
      // Repository click handling - calls parent callback
      onRepositoryClicked: (repositoryId: string | null) => {
        console.log('[SharedCollectionsProvider] Repository clicked:', repositoryId);
        if (repositoryId) {
          onRepositoryClicked?.(repositoryId);
        }
      },
      selectedRepositoryId: selectedRepositoryId ?? null,
      // CollectionMapPanelActions - no-ops for read-only shared view
      addRepositoryToCollection: async () => {
        console.warn('[SharedCollectionsProvider] addRepositoryToCollection not available in read-only view');
      },
      onRegionCreated: async (): Promise<CustomRegion> => {
        throw new Error('Region creation not available in read-only view');
      },
      onRegionUpdated: async () => {
        console.warn('[SharedCollectionsProvider] onRegionUpdated not available in read-only view');
      },
      onRegionDeleted: async () => {
        console.warn('[SharedCollectionsProvider] onRegionDeleted not available in read-only view');
      },
      onRepositoryAssigned: async () => {
        console.warn('[SharedCollectionsProvider] onRepositoryAssigned not available in read-only view');
      },
      onRepositoryPositionUpdated: async () => {
        console.warn('[SharedCollectionsProvider] onRepositoryPositionUpdated not available in read-only view');
      },
      onBatchLayoutInitialized: async () => {
        console.warn('[SharedCollectionsProvider] onBatchLayoutInitialized not available in read-only view');
      },
    }),
    [events, onRepositoryClicked, selectedRepositoryId]
  );

  // Provider value
  const value: SharedCollectionsProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
    }),
    [context, actions, events]
  );

  return (
    <SharedCollectionsContext.Provider value={value}>
      {children}
    </SharedCollectionsContext.Provider>
  );
}

export function useSharedCollectionsProvider() {
  const context = useContext(SharedCollectionsContext);
  if (!context) {
    throw new Error('useSharedCollectionsProvider must be used within SharedCollectionsProvider');
  }
  return context;
}
