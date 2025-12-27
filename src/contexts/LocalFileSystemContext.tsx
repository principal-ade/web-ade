'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { LocalFileSystemAdapter } from '@/lib/client/LocalFileSystemAdapter';
import {
  storeRepoHandle,
  getRepoHandle,
  removeRepoHandle,
  verifyPermission,
  isFileSystemAccessSupported,
} from '@/lib/client/handleStorage';
import { getGitRemoteFromHandle, type GitRemoteInfo } from '@/lib/client/gitConfigParser';

interface LocalFileSystemState {
  /** Whether the File System Access API is supported */
  isSupported: boolean;
  /** The current adapter for file operations (null if no folder attached) */
  adapter: LocalFileSystemAdapter | null;
  /** The folder name for display */
  folderName: string | null;
  /** Whether we're currently loading/checking a handle */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
}

interface LocalFileSystemContextValue extends LocalFileSystemState {
  /**
   * Open the directory picker and attach a folder
   * @param currentRepoId - The current repo (owner/repo) to check against
   * @returns Object with result info, or null if cancelled
   */
  pickDirectory: (currentRepoId: string) => Promise<{
    attached: boolean;
    matchedRepo: boolean;
    detectedRepo: GitRemoteInfo | null;
  } | null>;

  /**
   * Attach a specific folder to a repo (after user confirmation)
   * @param handle - The directory handle to attach
   * @param repoId - The repo to attach it to
   */
  attachFolder: (
    handle: FileSystemDirectoryHandle,
    repoId: string
  ) => Promise<void>;

  /**
   * Check if a repo has a stored handle and restore it
   * @param repoId - The repo to check
   * @returns true if handle was restored, false otherwise
   */
  checkAndRestoreHandle: (repoId: string) => Promise<boolean>;

  /**
   * Disconnect the current local folder
   * @param repoId - The repo to disconnect from
   */
  disconnectFolder: (repoId: string) => Promise<void>;

  /**
   * Clear any error state
   */
  clearError: () => void;
}

const LocalFileSystemContext = createContext<LocalFileSystemContextValue | null>(null);

export function LocalFileSystemProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocalFileSystemState>({
    isSupported: false,
    adapter: null,
    folderName: null,
    isLoading: false,
    error: null,
  });

  // Check browser support on mount
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isSupported: isFileSystemAccessSupported(),
    }));
  }, []);

  const pickDirectory = useCallback(
    async (currentRepoId: string) => {
      if (!state.isSupported) {
        setState((prev) => ({
          ...prev,
          error: 'File System Access API is not supported in this browser',
        }));
        return null;
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Show directory picker
        const handle = await window.showDirectoryPicker({
          id: 'web-ade-local-folder',
          mode: 'readwrite',
          startIn: 'documents',
        });

        // Check for git remote
        const gitRemote = await getGitRemoteFromHandle(handle);

        if (gitRemote) {
          // Check if it matches the current repo
          if (gitRemote.fullName === currentRepoId) {
            // Perfect match - attach directly
            await storeRepoHandle(currentRepoId, handle);
            const adapter = new LocalFileSystemAdapter(handle);

            setState((prev) => ({
              ...prev,
              adapter,
              folderName: handle.name,
              isLoading: false,
            }));

            return {
              attached: true,
              matchedRepo: true,
              detectedRepo: gitRemote,
            };
          } else {
            // Different repo detected - let caller handle navigation
            setState((prev) => ({ ...prev, isLoading: false }));

            return {
              attached: false,
              matchedRepo: false,
              detectedRepo: gitRemote,
            };
          }
        } else {
          // No git remote found - let caller decide what to do
          setState((prev) => ({ ...prev, isLoading: false }));

          return {
            attached: false,
            matchedRepo: false,
            detectedRepo: null,
          };
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // User cancelled the picker
          setState((prev) => ({ ...prev, isLoading: false }));
          return null;
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: `Failed to access folder: ${(err as Error).message}`,
        }));
        return null;
      }
    },
    [state.isSupported]
  );

  const attachFolder = useCallback(
    async (handle: FileSystemDirectoryHandle, repoId: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Verify we have permission
        const hasPermission = await verifyPermission(handle);
        if (!hasPermission) {
          throw new Error('Permission denied');
        }

        await storeRepoHandle(repoId, handle);
        const adapter = new LocalFileSystemAdapter(handle);

        setState((prev) => ({
          ...prev,
          adapter,
          folderName: handle.name,
          isLoading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: `Failed to attach folder: ${(err as Error).message}`,
        }));
      }
    },
    []
  );

  const checkAndRestoreHandle = useCallback(async (repoId: string) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const stored = await getRepoHandle(repoId);
      if (!stored) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return false;
      }

      // Verify permission
      const hasPermission = await verifyPermission(stored.handle);
      if (!hasPermission) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return false;
      }

      const adapter = new LocalFileSystemAdapter(stored.handle);

      setState((prev) => ({
        ...prev,
        adapter,
        folderName: stored.folderName,
        isLoading: false,
      }));

      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: `Failed to restore folder: ${(err as Error).message}`,
      }));
      return false;
    }
  }, []);

  const disconnectFolder = useCallback(async (repoId: string) => {
    try {
      await removeRepoHandle(repoId);
      setState((prev) => ({
        ...prev,
        adapter: null,
        folderName: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Failed to disconnect folder: ${(err as Error).message}`,
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: LocalFileSystemContextValue = {
    ...state,
    pickDirectory,
    attachFolder,
    checkAndRestoreHandle,
    disconnectFolder,
    clearError,
  };

  return (
    <LocalFileSystemContext.Provider value={value}>
      {children}
    </LocalFileSystemContext.Provider>
  );
}

export function useLocalFileSystem(): LocalFileSystemContextValue {
  const context = useContext(LocalFileSystemContext);
  if (!context) {
    throw new Error(
      'useLocalFileSystem must be used within a LocalFileSystemProvider'
    );
  }
  return context;
}
