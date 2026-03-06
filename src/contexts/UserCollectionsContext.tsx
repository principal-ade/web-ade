'use client';

/**
 * UserCollectionsContext
 *
 * Provides state management for user-created collections.
 * Uses GitHub as the single source of truth - no localStorage caching.
 * Collections are fetched from GitHub on auth and written directly on changes.
 *
 * Memberships are stored inside each collection's `members` array (not separately).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { Collection, CollectionMembership } from '@principal-ai/alexandria-collections';
import { useAuth } from './AuthContext';
import { withTelemetrySpan } from '@/lib/telemetry';
import type { CollectionVisibility } from '@/lib/collections/github-repo-manager';

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
  memberships: CollectionMembership[]; // Derived from collections for backward compatibility
  loading: boolean;
  error: Error | null;
  saving: boolean;

  // GitHub state
  gitHubRepoExists: boolean;
  gitHubRepoUrl: string | null;

  // Visibility state
  visibility: CollectionVisibility;
  setVisibility: (visibility: CollectionVisibility) => void;

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
  addRepository: (collectionId: string, repositoryId: string, initialMetadata?: Record<string, unknown>) => Promise<void>;
  removeRepository: (collectionId: string, repositoryId: string) => Promise<void>;
  updateMembershipMetadata: (
    collectionId: string,
    repositoryId: string,
    metadata: Record<string, unknown>
  ) => Promise<void>;

  // Utility functions
  getCollectionRepositories: (collectionId: string) => string[];
  getCollectionRepositoryInfos: (collectionId: string) => RepositoryInfo[];
  getCollection: (id: string) => Collection | undefined;
  isUserCollection: (id: string) => boolean;
  refresh: () => Promise<void>;

  // GitHub functions
  enableGitHub: (visibility?: CollectionVisibility) => Promise<void>;
}

const UserCollectionsContext = createContext<UserCollectionsContextValue | undefined>(undefined);

/** Generate a unique collection ID */
function generateCollectionId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function UserCollectionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [gitHubRepoExists, setGitHubRepoExists] = useState(false);
  const [gitHubRepoUrl, setGitHubRepoUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<CollectionVisibility>('public');

  // Ref to track latest collections for sync operations (avoids stale closure issues)
  const collectionsRef = useRef<Collection[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    collectionsRef.current = collections;
  }, [collections]);

  // Derive memberships from collections for backward compatibility
  const memberships = useMemo<CollectionMembership[]>(() => {
    return collections.flatMap(collection =>
      (collection.members || []).map(member => ({
        ...member,
        collectionId: collection.id,
      }))
    );
  }, [collections]);

  // Save collections to GitHub (memberships are inside collections.members)
  const saveToGitHub = useCallback(async (
    newCollections: Collection[],
    repoExists: boolean,
    targetVisibility: CollectionVisibility = 'public'
  ): Promise<{ repoUrl?: string }> => {
    setSaving(true);
    try {
      // Extract memberships from collections for API compatibility
      const allMemberships = newCollections.flatMap(collection =>
        (collection.members || []).map(member => ({
          ...member,
          collectionId: collection.id,
        }))
      );

      const response = await fetch('/api/github/collections', {
        method: repoExists ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections: newCollections,
          memberships: allMemberships,
          visibility: targetVisibility,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save to GitHub');
      }

      const data = await response.json();
      return { repoUrl: data.repoUrl };
    } finally {
      setSaving(false);
    }
  }, []);

  // Load collections from GitHub
  const loadFromGitHub = useCallback(async () => {
    if (!isAuthenticated) {
      setCollections([]);
      setGitHubRepoExists(false);
      setGitHubRepoUrl(null);
      setLoading(false);
      return;
    }

    await withTelemetrySpan('api.github.collections.load', async (emit) => {
      try {
        setLoading(true);
        setError(null);

        emit('collections.load.started');

        const response = await fetch('/api/github/collections');

        if (!response.ok) {
          if (response.status === 401) {
            emit('collections.load.unauthorized');
            setCollections([]);
            setGitHubRepoExists(false);
            setGitHubRepoUrl(null);
            return;
          }
          throw new Error('Failed to load collections from GitHub');
        }

        const data = await response.json();

        if (!data.exists) {
          emit('collections.load.github.not-found');
        } else {
          emit('collections.load.github.fetch', {
            repoUrl: data.repoUrl || 'unknown',
          });
        }

        setGitHubRepoExists(data.exists);
        setGitHubRepoUrl(data.repoUrl || null);

        // Collections already have members inside them from the API
        setCollections(data.collections || []);

        // Count memberships for telemetry
        const membershipCount = (data.collections || []).reduce(
          (acc: number, c: Collection) => acc + (c.members?.length || 0),
          0
        );

        emit('collections.load.success', {
          collectionCount: (data.collections || []).length,
          membershipCount,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load collections'));
        emit('collections.load.error', {
          'error.message': err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      } finally {
        setLoading(false);
      }
    });
  }, [isAuthenticated]);

  // Load from GitHub when authenticated
  useEffect(() => {
    loadFromGitHub();
  }, [loadFromGitHub]);

  // Create a new collection
  const createCollection = useCallback(
    async (name: string, description?: string, icon?: string): Promise<Collection> => {
      return await withTelemetrySpan('api.github.collections.create', async (emit) => {
        emit('collection.create.started', {
          collectionName: name,
          ...(icon && { icon }),
          ...(description && { description }),
        });

        emit('collection.create.validate');

        const now = Date.now();
        const newCollection: Collection = {
          id: generateCollectionId(),
          name,
          description,
          icon,
          createdAt: now,
          updatedAt: now,
          members: [],
          visibility,
          owner: user?.login || '',
          ownerType: 'user',
        };

        const newCollections = [...collectionsRef.current, newCollection];

        // Emit appropriate GitHub event based on whether repo exists
        if (gitHubRepoExists) {
          emit('collection.create.github.update');
        } else {
          emit('collection.create.github.init', {
            repoUrl: gitHubRepoUrl || 'creating',
          });
        }

        // Save to GitHub first, then update state
        const result = await saveToGitHub(newCollections, gitHubRepoExists, visibility);

        emit('collection.create.github.commit');

        // Update ref immediately
        collectionsRef.current = newCollections;
        setCollections(newCollections);

        // If repo was just created, update state
        if (result.repoUrl && !gitHubRepoExists) {
          setGitHubRepoExists(true);
          setGitHubRepoUrl(result.repoUrl);
        }

        emit('collection.create.success', {
          collectionId: newCollection.id,
        });

        return newCollection;
      });
    },
    [gitHubRepoExists, gitHubRepoUrl, saveToGitHub, user?.login, visibility]
  );

  // Update a collection
  const updateCollection = useCallback(
    async (id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt'>>): Promise<void> => {
      const newCollections = collectionsRef.current.map((col) =>
        col.id === id
          ? { ...col, ...updates, updatedAt: Date.now() }
          : col
      );

      // Update ref immediately
      collectionsRef.current = newCollections;

      // Update state immediately (optimistic update) to keep UI in sync
      setCollections(newCollections);

      // Save to GitHub in background
      const result = await saveToGitHub(newCollections, gitHubRepoExists, visibility);

      if (result.repoUrl && !gitHubRepoExists) {
        setGitHubRepoExists(true);
        setGitHubRepoUrl(result.repoUrl);
      }
    },
    [gitHubRepoExists, saveToGitHub, visibility]
  );

  // Delete a collection
  const deleteCollection = useCallback(async (id: string): Promise<void> => {
    const newCollections = collectionsRef.current.filter((col) => col.id !== id);

    // Update ref immediately
    collectionsRef.current = newCollections;

    // Save to GitHub first, then update state
    const result = await saveToGitHub(newCollections, gitHubRepoExists, visibility);
    setCollections(newCollections);

    if (result.repoUrl && !gitHubRepoExists) {
      setGitHubRepoExists(true);
      setGitHubRepoUrl(result.repoUrl);
    }
  }, [gitHubRepoExists, saveToGitHub, visibility]);

  // Add a repository to a collection
  const addRepository = useCallback(
    async (
      collectionId: string,
      repositoryId: string,
      initialMetadata?: Record<string, unknown>
    ): Promise<void> => {
      // Fetch repository info to check if it's a fork
      const metadata: Record<string, unknown> = { ...initialMetadata };
      try {
        const [owner, repo] = repositoryId.split('/');
        const response = await fetch(`/api/github/repo/${owner}/${repo}?action=info`);
        if (response.ok) {
          const repoInfo = await response.json();
          if (repoInfo.fork && repoInfo.parent) {
            metadata.sourceRepository = {
              owner: repoInfo.parent.owner.login,
              name: repoInfo.parent.name,
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
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };

      // Add membership to the collection's members array
      const newCollections = collectionsRef.current.map((col) =>
        col.id === collectionId
          ? { ...col, members: [...(col.members || []), newMembership], updatedAt: Date.now() }
          : col
      );

      // Update ref immediately so subsequent calls have latest data
      collectionsRef.current = newCollections;

      // Save to GitHub first, then update state
      const result = await saveToGitHub(newCollections, gitHubRepoExists, visibility);
      setCollections(newCollections);

      if (result.repoUrl && !gitHubRepoExists) {
        setGitHubRepoExists(true);
        setGitHubRepoUrl(result.repoUrl);
      }
    },
    [gitHubRepoExists, saveToGitHub, visibility]
  );

  // Remove a repository from a collection
  const removeRepository = useCallback(
    async (collectionId: string, repositoryId: string): Promise<void> => {
      const newCollections = collectionsRef.current.map((col) =>
        col.id === collectionId
          ? {
              ...col,
              members: (col.members || []).filter((m) => m.repositoryId !== repositoryId),
              updatedAt: Date.now(),
            }
          : col
      );

      // Update ref immediately
      collectionsRef.current = newCollections;

      // Save to GitHub first, then update state
      const result = await saveToGitHub(newCollections, gitHubRepoExists, visibility);
      setCollections(newCollections);

      if (result.repoUrl && !gitHubRepoExists) {
        setGitHubRepoExists(true);
        setGitHubRepoUrl(result.repoUrl);
      }
    },
    [gitHubRepoExists, saveToGitHub, visibility]
  );

  // Update membership metadata (for region assignments, positions, etc.)
  const updateMembershipMetadata = useCallback(
    async (
      collectionId: string,
      repositoryId: string,
      metadata: Record<string, unknown>
    ): Promise<void> => {
      const newCollections = collectionsRef.current.map((col) =>
        col.id === collectionId
          ? {
              ...col,
              members: (col.members || []).map((m) =>
                m.repositoryId === repositoryId
                  ? { ...m, metadata: { ...m.metadata, ...metadata } }
                  : m
              ),
              updatedAt: Date.now(),
            }
          : col
      );

      // Update ref immediately so subsequent calls have latest data
      collectionsRef.current = newCollections;

      // Update state immediately (optimistic update) to keep UI in sync
      // This prevents the snap-back issue during drag-and-drop
      setCollections(newCollections);

      // Save to GitHub in background
      const result = await saveToGitHub(newCollections, gitHubRepoExists, visibility);

      if (result.repoUrl && !gitHubRepoExists) {
        setGitHubRepoExists(true);
        setGitHubRepoUrl(result.repoUrl);
      }
    },
    [gitHubRepoExists, saveToGitHub, visibility]
  );

  // Get all repository IDs in a collection
  const getCollectionRepositories = useCallback(
    (collectionId: string): string[] => {
      const collection = collectionsRef.current.find((c) => c.id === collectionId);
      return (collection?.members || []).map((m) => m.repositoryId);
    },
    []
  );

  // Get all repository infos with source repository metadata
  const getCollectionRepositoryInfos = useCallback(
    (collectionId: string): RepositoryInfo[] => {
      const collection = collectionsRef.current.find((c) => c.id === collectionId);
      return (collection?.members || []).map((m) => ({
        repositoryId: m.repositoryId,
        sourceRepository: m.metadata?.sourceRepository as { owner: string; name: string } | undefined,
      }));
    },
    []
  );

  // Get a collection by ID
  const getCollection = useCallback(
    (id: string): Collection | undefined => {
      return collectionsRef.current.find((col) => col.id === id);
    },
    []
  );

  // Check if a collection ID belongs to user collections
  const isUserCollection = useCallback(
    (id: string): boolean => {
      return collectionsRef.current.some((col) => col.id === id);
    },
    []
  );

  // Refresh data from GitHub
  const refresh = useCallback(async (): Promise<void> => {
    await loadFromGitHub();
  }, [loadFromGitHub]);

  // Enable GitHub (create repo if it doesn't exist)
  const enableGitHub = useCallback(async (targetVisibility: CollectionVisibility = 'public'): Promise<void> => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to enable GitHub');
    }

    setSaving(true);
    try {
      // Extract memberships from collections for API
      const allMemberships = collectionsRef.current.flatMap(collection =>
        (collection.members || []).map(member => ({
          ...member,
          collectionId: collection.id,
        }))
      );

      const response = await fetch('/api/github/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections: collectionsRef.current,
          memberships: allMemberships,
          visibility: targetVisibility,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create GitHub repo');
      }

      const data = await response.json();
      setGitHubRepoExists(true);
      setGitHubRepoUrl(data.repoUrl || null);
      setVisibility(targetVisibility);
    } finally {
      setSaving(false);
    }
  }, [isAuthenticated]);

  return (
    <UserCollectionsContext.Provider
      value={{
        collections,
        memberships, // Derived from collections for backward compatibility
        loading,
        error,
        saving,
        gitHubRepoExists,
        gitHubRepoUrl,
        visibility,
        setVisibility,
        createCollection,
        updateCollection,
        deleteCollection,
        addRepository,
        removeRepository,
        updateMembershipMetadata,
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
