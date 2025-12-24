'use client';

/**
 * UserCollectionsContext
 *
 * Provides state management for user-created collections.
 * Uses CollectionManager with a localStorage adapter.
 * Optionally syncs to GitHub for persistence across devices.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { Collection, CollectionMembership } from '@principal-ai/alexandria-collections';
import { CollectionManager } from '@/lib/collections/CollectionManager';
import { LocalStorageFileSystemAdapter } from '@/lib/storage/LocalStorageFileSystemAdapter';
import { useAuth } from './AuthContext';

/** Repository info with optional source repository for forks */
interface RepositoryInfo {
  repositoryId: string;
  sourceRepository?: {
    owner: string;
    name: string;
  };
}

interface UserCollectionsContextValue {
  // State
  collections: Collection[];
  memberships: CollectionMembership[];
  loading: boolean;
  error: Error | null;

  // GitHub sync state
  gitHubSyncEnabled: boolean;
  gitHubSyncLoading: boolean;
  gitHubRepoUrl: string | null;

  // Collection CRUD
  createCollection: (
    name: string,
    description?: string,
    icon?: string
  ) => Promise<Collection>;
  updateCollection: (
    id: string,
    updates: Partial<Omit<Collection, 'id' | 'createdAt'>>
  ) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;

  // Membership management
  addRepository: (collectionId: string, repositoryId: string) => Promise<void>;
  removeRepository: (collectionId: string, repositoryId: string) => Promise<void>;

  // Utility functions
  getCollectionRepositories: (collectionId: string) => string[];
  getCollectionRepositoryInfos: (collectionId: string) => RepositoryInfo[];
  getCollection: (id: string) => Collection | undefined;
  isUserCollection: (id: string) => boolean;
  refresh: () => Promise<void>;

  // GitHub sync functions
  checkGitHubSync: () => Promise<void>;
  enableGitHubSync: () => Promise<void>;
  syncToGitHub: () => Promise<void>;
}

const UserCollectionsContext = createContext<UserCollectionsContextValue | undefined>(undefined);

// Singleton adapter and manager instances
let adapter: LocalStorageFileSystemAdapter | null = null;
let manager: CollectionManager | null = null;

function getManager(): CollectionManager {
  if (!adapter) {
    adapter = new LocalStorageFileSystemAdapter();
  }
  if (!manager) {
    manager = new CollectionManager('/', adapter);
  }
  return manager;
}

export function UserCollectionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberships, setMemberships] = useState<CollectionMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // GitHub sync state
  const [gitHubSyncEnabled, setGitHubSyncEnabled] = useState(false);
  const [gitHubSyncLoading, setGitHubSyncLoading] = useState(false);
  const [gitHubRepoUrl, setGitHubRepoUrl] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialSyncDoneRef = useRef(false);

  // Load collections and memberships from localStorage
  const loadData = useCallback(async () => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const colManager = getManager();
      const loadedCollections = await colManager.getCollections();
      setCollections(loadedCollections || []);

      // Load memberships for all collections
      const allMemberships: CollectionMembership[] = [];
      for (const col of loadedCollections || []) {
        const colMemberships = await colManager.getCollectionMemberships(col.id);
        allMemberships.push(...colMemberships);
      }
      setMemberships(allMemberships);
    } catch (err) {
      console.error('Failed to load user collections:', err);
      setError(err instanceof Error ? err : new Error('Failed to load collections'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create a new collection
  const createCollection = useCallback(
    async (name: string, description?: string, icon?: string): Promise<Collection> => {
      const colManager = getManager();
      const newCollection = await colManager.createCollection({
        name,
        description,
        icon,
      });

      // Update local state
      setCollections((prev) => [...prev, newCollection]);

      return newCollection;
    },
    []
  );

  // Update a collection
  const updateCollection = useCallback(
    async (id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt'>>): Promise<void> => {
      const colManager = getManager();
      const updatedCollection = await colManager.updateCollection(id, updates);

      // Update local state
      setCollections((prev) =>
        prev.map((col) => (col.id === id ? updatedCollection : col))
      );
    },
    []
  );

  // Delete a collection
  const deleteCollection = useCallback(async (id: string): Promise<void> => {
    const colManager = getManager();
    await colManager.deleteCollection(id);

    // Update local state
    setCollections((prev) => prev.filter((col) => col.id !== id));
    setMemberships((prev) => prev.filter((m) => m.collectionId !== id));
  }, []);

  // Add a repository to a collection
  const addRepository = useCallback(
    async (collectionId: string, repositoryId: string): Promise<void> => {
      const colManager = getManager();

      // Fetch repository info to check if it's a fork
      let metadata: Record<string, unknown> | undefined;
      try {
        const [owner, repo] = repositoryId.split('/');
        const response = await fetch(`/api/github/repo/${owner}/${repo}?action=info`);
        if (response.ok) {
          const repoInfo = await response.json();
          // GitHub API returns fork source as 'parent'
          if (repoInfo.fork && repoInfo.parent) {
            metadata = {
              sourceRepository: {
                owner: repoInfo.parent.owner.login,
                name: repoInfo.parent.name,
              },
            };
          }
        }
      } catch (err) {
        console.warn('Failed to fetch repository info:', err);
        // Continue without metadata if fetch fails
      }

      await colManager.addRepositoryToCollection(repositoryId, collectionId, metadata);

      // Update local state
      const newMembership: CollectionMembership = {
        repositoryId,
        collectionId,
        addedAt: Date.now(),
        metadata,
      };
      setMemberships((prev) => [...prev, newMembership]);
    },
    []
  );

  // Remove a repository from a collection
  const removeRepository = useCallback(
    async (collectionId: string, repositoryId: string): Promise<void> => {
      const colManager = getManager();
      await colManager.removeRepositoryFromCollection(repositoryId, collectionId);

      // Update local state
      setMemberships((prev) =>
        prev.filter(
          (m) => !(m.collectionId === collectionId && m.repositoryId === repositoryId)
        )
      );
    },
    []
  );

  // Get all repository IDs in a collection
  const getCollectionRepositories = useCallback(
    (collectionId: string): string[] => {
      return memberships
        .filter((m) => m.collectionId === collectionId)
        .map((m) => m.repositoryId);
    },
    [memberships]
  );

  // Get all repository infos with source repository metadata
  const getCollectionRepositoryInfos = useCallback(
    (collectionId: string): RepositoryInfo[] => {
      return memberships
        .filter((m) => m.collectionId === collectionId)
        .map((m) => ({
          repositoryId: m.repositoryId,
          sourceRepository: m.metadata?.sourceRepository as { owner: string; name: string } | undefined,
        }));
    },
    [memberships]
  );

  // Get a collection by ID
  const getCollection = useCallback(
    (id: string): Collection | undefined => {
      return collections.find((col) => col.id === id);
    },
    [collections]
  );

  // Check if a collection ID belongs to user collections
  // User collection IDs are generated by CollectionManager
  const isUserCollection = useCallback(
    (id: string): boolean => {
      return collections.some((col) => col.id === id);
    },
    [collections]
  );

  // Refresh data from localStorage
  const refresh = useCallback(async (): Promise<void> => {
    await loadData();
  }, [loadData]);

  // Check if GitHub sync is enabled (repo exists)
  const checkGitHubSync = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) {
      setGitHubSyncEnabled(false);
      setGitHubRepoUrl(null);
      return;
    }

    try {
      setGitHubSyncLoading(true);
      const response = await fetch('/api/github/collections');

      if (!response.ok) {
        if (response.status === 401) {
          setGitHubSyncEnabled(false);
          setGitHubRepoUrl(null);
          return;
        }
        throw new Error('Failed to check sync status');
      }

      const data = await response.json();
      setGitHubSyncEnabled(data.exists);
      setGitHubRepoUrl(data.repoUrl || null);

      // If sync is enabled and we haven't done initial sync yet, load from GitHub
      if (data.exists && !initialSyncDoneRef.current) {
        initialSyncDoneRef.current = true;
        const ghCollections: Collection[] = data.collections || [];
        const ghMemberships: CollectionMembership[] = data.memberships || [];

        if (ghCollections.length > 0) {
          // Import collections from GitHub into local storage
          const colManager = getManager();

          for (const ghCol of ghCollections) {
            // Check if collection already exists locally
            const existingLocal = collections.find((c) => c.id === ghCol.id);

            if (!existingLocal) {
              // Create the collection locally
              const newCol = await colManager.createCollection({
                name: ghCol.name,
                description: ghCol.description,
                icon: ghCol.icon,
              });

              // Add repositories from memberships
              const colMemberships = ghMemberships.filter((m) => m.collectionId === ghCol.id);
              for (const membership of colMemberships) {
                await colManager.addRepositoryToCollection(
                  membership.repositoryId,
                  newCol.id,
                  membership.metadata
                );
              }
            }
          }

          // Reload local data
          await loadData();
        }
      }
    } catch (err) {
      console.error('Failed to check GitHub sync:', err);
    } finally {
      setGitHubSyncLoading(false);
    }
  }, [isAuthenticated, collections, loadData]);

  // Enable GitHub sync (create repo and save current collections)
  const enableGitHubSync = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to enable GitHub sync');
    }

    try {
      setGitHubSyncLoading(true);

      const response = await fetch('/api/github/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections, memberships }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enable sync');
      }

      const data = await response.json();
      setGitHubSyncEnabled(true);
      setGitHubRepoUrl(data.repoUrl || null);
      initialSyncDoneRef.current = true;
    } finally {
      setGitHubSyncLoading(false);
    }
  }, [isAuthenticated, collections, memberships]);

  // Sync current collections to GitHub
  const syncToGitHub = useCallback(async (): Promise<void> => {
    if (!gitHubSyncEnabled || !isAuthenticated) {
      return;
    }

    try {
      const response = await fetch('/api/github/collections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections, memberships }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to sync to GitHub:', errorData.error);
      }
    } catch (err) {
      console.error('Failed to sync to GitHub:', err);
    }
  }, [gitHubSyncEnabled, isAuthenticated, collections, memberships]);

  // Auto-sync to GitHub when collections/memberships change (debounced)
  useEffect(() => {
    if (!gitHubSyncEnabled || !initialSyncDoneRef.current) {
      return;
    }

    // Clear existing timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Debounce sync by 2 seconds
    syncTimeoutRef.current = setTimeout(() => {
      syncToGitHub();
    }, 2000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [gitHubSyncEnabled, collections, memberships, syncToGitHub]);

  // Check GitHub sync status when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      checkGitHubSync();
    } else {
      setGitHubSyncEnabled(false);
      setGitHubRepoUrl(null);
      initialSyncDoneRef.current = false;
    }
  }, [isAuthenticated, checkGitHubSync]);

  return (
    <UserCollectionsContext.Provider
      value={{
        collections,
        memberships,
        loading,
        error,
        gitHubSyncEnabled,
        gitHubSyncLoading,
        gitHubRepoUrl,
        createCollection,
        updateCollection,
        deleteCollection,
        addRepository,
        removeRepository,
        getCollectionRepositories,
        getCollectionRepositoryInfos,
        getCollection,
        isUserCollection,
        refresh,
        checkGitHubSync,
        enableGitHubSync,
        syncToGitHub,
      }}
    >
      {children}
    </UserCollectionsContext.Provider>
  );
}

export function useUserCollections(): UserCollectionsContextValue {
  const context = useContext(UserCollectionsContext);
  if (!context) {
    throw new Error('useUserCollections must be used within a UserCollectionsProvider');
  }
  return context;
}
