'use client';

/**
 * UserCollectionsContext
 *
 * Provides state management for user-created collections (workspaces).
 * Uses WorkspaceManager from alexandria-core-library with a localStorage adapter.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { WorkspaceManager } from '@principal-ai/alexandria-core-library/github';
import type { Workspace, WorkspaceMembership } from '@principal-ai/alexandria-core-library/types';
import { LocalStorageFileSystemAdapter } from '@/lib/storage/LocalStorageFileSystemAdapter';

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
  workspaces: Workspace[];
  memberships: WorkspaceMembership[];
  loading: boolean;
  error: Error | null;

  // Workspace CRUD
  createWorkspace: (
    name: string,
    description?: string,
    icon?: string
  ) => Promise<Workspace>;
  updateWorkspace: (
    id: string,
    updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>
  ) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;

  // Membership management
  addRepository: (workspaceId: string, repositoryId: string) => Promise<void>;
  removeRepository: (workspaceId: string, repositoryId: string) => Promise<void>;

  // Utility functions
  getWorkspaceRepositories: (workspaceId: string) => string[];
  getWorkspaceRepositoryInfos: (workspaceId: string) => RepositoryInfo[];
  getWorkspace: (id: string) => Workspace | undefined;
  isUserWorkspace: (id: string) => boolean;
  refresh: () => Promise<void>;
}

const UserCollectionsContext = createContext<UserCollectionsContextValue | undefined>(undefined);

// Singleton adapter and manager instances
let adapter: LocalStorageFileSystemAdapter | null = null;
let manager: WorkspaceManager | null = null;

function getManager(): WorkspaceManager {
  if (!adapter) {
    adapter = new LocalStorageFileSystemAdapter();
  }
  if (!manager) {
    manager = new WorkspaceManager('/', adapter);
  }
  return manager;
}

export function UserCollectionsProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load workspaces and memberships from localStorage
  const loadData = useCallback(async () => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const wsManager = getManager();
      const loadedWorkspaces = await wsManager.getWorkspaces();
      setWorkspaces(loadedWorkspaces || []);

      // Load memberships for all workspaces
      const allMemberships: WorkspaceMembership[] = [];
      for (const ws of loadedWorkspaces || []) {
        const wsMemberships = await wsManager.getWorkspaceMemberships(ws.id);
        allMemberships.push(...wsMemberships);
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

  // Create a new workspace
  const createWorkspace = useCallback(
    async (name: string, description?: string, icon?: string): Promise<Workspace> => {
      const wsManager = getManager();
      const newWorkspace = await wsManager.createWorkspace({
        name,
        description,
        icon,
      });

      // Update local state
      setWorkspaces((prev) => [...prev, newWorkspace]);

      return newWorkspace;
    },
    []
  );

  // Update a workspace
  const updateWorkspace = useCallback(
    async (id: string, updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>): Promise<void> => {
      const wsManager = getManager();
      const updatedWorkspace = await wsManager.updateWorkspace(id, updates);

      // Update local state
      setWorkspaces((prev) =>
        prev.map((ws) => (ws.id === id ? updatedWorkspace : ws))
      );
    },
    []
  );

  // Delete a workspace
  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    const wsManager = getManager();
    await wsManager.deleteWorkspace(id);

    // Update local state
    setWorkspaces((prev) => prev.filter((ws) => ws.id !== id));
    setMemberships((prev) => prev.filter((m) => m.workspaceId !== id));
  }, []);

  // Add a repository to a workspace
  const addRepository = useCallback(
    async (workspaceId: string, repositoryId: string): Promise<void> => {
      const wsManager = getManager();

      // Fetch repository info to check if it's a fork
      let metadata: Record<string, unknown> | undefined;
      try {
        const [owner, repo] = repositoryId.split('/');
        const response = await fetch(`/api/github/repo/${owner}/${repo}`);
        if (response.ok) {
          const repoInfo = await response.json();
          if (repoInfo.sourceRepository) {
            metadata = {
              sourceRepository: repoInfo.sourceRepository,
            };
          }
        }
      } catch (err) {
        console.warn('Failed to fetch repository info:', err);
        // Continue without metadata if fetch fails
      }

      await wsManager.addRepositoryToWorkspace(repositoryId, workspaceId, metadata);

      // Update local state
      const newMembership: WorkspaceMembership = {
        repositoryId,
        workspaceId,
        addedAt: Date.now(),
        metadata,
      };
      setMemberships((prev) => [...prev, newMembership]);
    },
    []
  );

  // Remove a repository from a workspace
  const removeRepository = useCallback(
    async (workspaceId: string, repositoryId: string): Promise<void> => {
      const wsManager = getManager();
      await wsManager.removeRepositoryFromWorkspace(repositoryId, workspaceId);

      // Update local state
      setMemberships((prev) =>
        prev.filter(
          (m) => !(m.workspaceId === workspaceId && m.repositoryId === repositoryId)
        )
      );
    },
    []
  );

  // Get all repository IDs in a workspace
  const getWorkspaceRepositories = useCallback(
    (workspaceId: string): string[] => {
      return memberships
        .filter((m) => m.workspaceId === workspaceId)
        .map((m) => m.repositoryId);
    },
    [memberships]
  );

  // Get all repository infos with source repository metadata
  const getWorkspaceRepositoryInfos = useCallback(
    (workspaceId: string): RepositoryInfo[] => {
      return memberships
        .filter((m) => m.workspaceId === workspaceId)
        .map((m) => ({
          repositoryId: m.repositoryId,
          sourceRepository: m.metadata?.sourceRepository as { owner: string; name: string } | undefined,
        }));
    },
    [memberships]
  );

  // Get a workspace by ID
  const getWorkspace = useCallback(
    (id: string): Workspace | undefined => {
      return workspaces.find((ws) => ws.id === id);
    },
    [workspaces]
  );

  // Check if a workspace ID belongs to user collections
  // User workspace IDs are UUIDs generated by WorkspaceManager
  const isUserWorkspace = useCallback(
    (id: string): boolean => {
      return workspaces.some((ws) => ws.id === id);
    },
    [workspaces]
  );

  // Refresh data from localStorage
  const refresh = useCallback(async (): Promise<void> => {
    await loadData();
  }, [loadData]);

  return (
    <UserCollectionsContext.Provider
      value={{
        workspaces,
        memberships,
        loading,
        error,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        addRepository,
        removeRepository,
        getWorkspaceRepositories,
        getWorkspaceRepositoryInfos,
        getWorkspace,
        isUserWorkspace,
        refresh,
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
