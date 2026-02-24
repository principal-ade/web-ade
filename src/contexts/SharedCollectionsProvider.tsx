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

// Minimal context type for shared collections view
export interface SharedCollectionsContextType {
  selectedCollectionView: SelectedCollectionView;
  workspaceRepositories: DataSlice<WorkspaceCollectionRepositoriesSlice>;
  workspace: DataSlice<WorkspaceSlice>;
  userProfile: DataSlice<UserProfileSlice>;
}

interface SharedCollectionsProviderProps {
  children: ReactNode;
  collection: Collection | null;
  collectionRepositories: string[];
  username: string;
  userProfile: GitHubUserProfile;
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
}: SharedCollectionsProviderProps) {
  // Initialize event bus
  const events = useMemo(() => new PanelEventBus(), []);

  // State for collection repository details (fetched from GitHub API)
  const [collectionRepoDetails, setCollectionRepoDetails] = useState<GitHubRepository[]>([]);
  const [collectionRepoDetailsLoading, setCollectionRepoDetailsLoading] = useState(false);

  // Fetch collection repository details
  useEffect(() => {
    if (!collectionRepositories || collectionRepositories.length === 0) {
      setCollectionRepoDetails([]);
      setCollectionRepoDetailsLoading(false);
      return;
    }

    setCollectionRepoDetailsLoading(true);

    Promise.all(
      collectionRepositories.map(async (repoId) => {
        try {
          const response = await fetch(`/api/github/repo/${repoId}`);
          if (response.ok) {
            return await response.json();
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch repo ${repoId}:`, error);
          return null;
        }
      })
    ).then((results) => {
      setCollectionRepoDetails(results.filter((r): r is GitHubRepository => r !== null));
      setCollectionRepoDetailsLoading(false);
    });
  }, [collectionRepositories]);

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
        organizations: [],
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

  // Build selectedCollectionView slice
  const selectedCollectionView = useMemo<SelectedCollectionView>(() => {
    const repositories: AlexandriaEntryWithMetrics[] = collectionRepositories.map(repoId => {
      const [owner, repoName] = repoId.split('/');
      const repoDetails = collectionRepoDetails.find(r => r.full_name === repoId);

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
        },
        packages: undefined,
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
      loading: collectionRepoDetailsLoading,
      error: null,
      refresh: async () => { /* no-op */ },
    };
  }, [collection, collectionRepositories, collectionRepoDetails, collectionRepoDetailsLoading]);

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
      // Legacy methods - no-ops
      getSlice: () => undefined,
      getWorkspaceSlice: () => undefined,
      getRepositorySlice: () => undefined,
      hasSlice: () => false,
      isSliceLoading: () => false,
      refresh: async () => { /* no-op */ },
    }),
    [workspace, adapters, collection, selectedCollectionView, workspaceRepositoriesSlice, workspaceSlice, userProfileSlice]
  );

  // Actions - read-only view (CollectionMapPanelActions are no-ops)
  const actions: SharedCollectionsPanelActions = useMemo(
    () => ({
      notifyPanels: (event) => {
        events.emit(event);
      },
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
    [events]
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
