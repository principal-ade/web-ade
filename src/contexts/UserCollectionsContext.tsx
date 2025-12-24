'use client';

/**
 * UserCollectionsContext
 *
 * Provides state management for user-created collections.
 * Uses GitHub as the single source of truth - no localStorage caching.
 * Collections are fetched from GitHub on auth and written directly on changes.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { Collection, CollectionMembership } from '@principal-ai/alexandria-collections';
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
  saving: boolean;

  // GitHub state
  gitHubRepoExists: boolean;
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

  // GitHub functions
  enableGitHub: () => Promise<void>;
}

const UserCollectionsContext = createContext<UserCollectionsContextValue | undefined>(undefined);

/** Generate a unique collection ID */
function generateCollectionId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function UserCollectionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberships, setMemberships] = useState<CollectionMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [gitHubRepoExists, setGitHubRepoExists] = useState(false);
  const [gitHubRepoUrl, setGitHubRepoUrl] = useState<string | null>(null);

  // Save collections and memberships to GitHub
  const saveToGitHub = useCallback(async (
    newCollections: Collection[],
    newMemberships: CollectionMembership[]
  ): Promise<void> => {
    setSaving(true);
    try {
      const response = await fetch('/api/github/collections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections: newCollections,
          memberships: newMemberships
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save to GitHub');
      }
    } finally {
      setSaving(false);
    }
  }, []);

  // Load collections from GitHub
  const loadFromGitHub = useCallback(async () => {
    if (!isAuthenticated) {
      setCollections([]);
      setMemberships([]);
      setGitHubRepoExists(false);
      setGitHubRepoUrl(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/github/collections');

      if (!response.ok) {
        if (response.status === 401) {
          setCollections([]);
          setMemberships([]);
          setGitHubRepoExists(false);
          setGitHubRepoUrl(null);
          return;
        }
        throw new Error('Failed to load collections from GitHub');
      }

      const data = await response.json();
      setGitHubRepoExists(data.exists);
      setGitHubRepoUrl(data.repoUrl || null);
      setCollections(data.collections || []);
      setMemberships(data.memberships || []);
    } catch (err) {
      console.error('Failed to load collections from GitHub:', err);
      setError(err instanceof Error ? err : new Error('Failed to load collections'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Load from GitHub when authenticated
  useEffect(() => {
    loadFromGitHub();
  }, [loadFromGitHub]);

  // Create a new collection
  const createCollection = useCallback(
    async (name: string, description?: string, icon?: string): Promise<Collection> => {
      const now = Date.now();
      const newCollection: Collection = {
        id: generateCollectionId(),
        name,
        description,
        icon,
        createdAt: now,
        updatedAt: now,
      };

      const newCollections = [...collections, newCollection];

      // Save to GitHub first, then update state
      await saveToGitHub(newCollections, memberships);
      setCollections(newCollections);

      return newCollection;
    },
    [collections, memberships, saveToGitHub]
  );

  // Update a collection
  const updateCollection = useCallback(
    async (id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt'>>): Promise<void> => {
      const newCollections = collections.map((col) =>
        col.id === id
          ? { ...col, ...updates, updatedAt: Date.now() }
          : col
      );

      // Save to GitHub first, then update state
      await saveToGitHub(newCollections, memberships);
      setCollections(newCollections);
    },
    [collections, memberships, saveToGitHub]
  );

  // Delete a collection
  const deleteCollection = useCallback(async (id: string): Promise<void> => {
    const newCollections = collections.filter((col) => col.id !== id);
    const newMemberships = memberships.filter((m) => m.collectionId !== id);

    // Save to GitHub first, then update state
    await saveToGitHub(newCollections, newMemberships);
    setCollections(newCollections);
    setMemberships(newMemberships);
  }, [collections, memberships, saveToGitHub]);

  // Add a repository to a collection
  const addRepository = useCallback(
    async (collectionId: string, repositoryId: string): Promise<void> => {
      // Fetch repository info to check if it's a fork
      let metadata: Record<string, unknown> | undefined;
      try {
        const [owner, repo] = repositoryId.split('/');
        const response = await fetch(`/api/github/repo/${owner}/${repo}?action=info`);
        if (response.ok) {
          const repoInfo = await response.json();
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
      }

      const newMembership: CollectionMembership = {
        repositoryId,
        collectionId,
        addedAt: Date.now(),
        metadata,
      };
      const newMemberships = [...memberships, newMembership];

      // Save to GitHub first, then update state
      await saveToGitHub(collections, newMemberships);
      setMemberships(newMemberships);
    },
    [collections, memberships, saveToGitHub]
  );

  // Remove a repository from a collection
  const removeRepository = useCallback(
    async (collectionId: string, repositoryId: string): Promise<void> => {
      const newMemberships = memberships.filter(
        (m) => !(m.collectionId === collectionId && m.repositoryId === repositoryId)
      );

      // Save to GitHub first, then update state
      await saveToGitHub(collections, newMemberships);
      setMemberships(newMemberships);
    },
    [collections, memberships, saveToGitHub]
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
  const isUserCollection = useCallback(
    (id: string): boolean => {
      return collections.some((col) => col.id === id);
    },
    [collections]
  );

  // Refresh data from GitHub
  const refresh = useCallback(async (): Promise<void> => {
    await loadFromGitHub();
  }, [loadFromGitHub]);

  // Enable GitHub (create repo if it doesn't exist)
  const enableGitHub = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to enable GitHub');
    }

    setSaving(true);
    try {
      const response = await fetch('/api/github/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections, memberships }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create GitHub repo');
      }

      const data = await response.json();
      setGitHubRepoExists(true);
      setGitHubRepoUrl(data.repoUrl || null);
    } finally {
      setSaving(false);
    }
  }, [isAuthenticated, collections, memberships]);

  return (
    <UserCollectionsContext.Provider
      value={{
        collections,
        memberships,
        loading,
        error,
        saving,
        gitHubRepoExists,
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
        enableGitHub,
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
