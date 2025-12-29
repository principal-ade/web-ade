/**
 * VFSContext - React context for Virtual File System
 *
 * Provides VFS operations to components with automatic initialization
 * when repository context is available.
 *
 * Usage:
 * ```tsx
 * const { readFile, writeFile, hasPendingChanges } = useVFS();
 *
 * // Read a file (checks pending layer first, then GitHub)
 * const content = await readFile('src/file.ts');
 *
 * // Write a file (goes to pending layer)
 * await writeFile('src/file.ts', newContent);
 * ```
 */

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';

import {
  VirtualFileSystem,
  createVirtualFileSystem,
  type VFSConfig,
  type PendingFile,
  type VFSStats,
} from '@/lib/vfs';

/**
 * VFS Context interface
 */
interface VFSContextValue {
  // Core file operations
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;

  // Pending changes
  getPendingChanges: () => PendingFile[];
  hasPendingChanges: () => boolean;
  hasPendingChange: (path: string) => boolean;
  getPendingChange: (path: string) => PendingFile | undefined;
  clearPendingChanges: (paths: string[]) => void;
  clearAllPendingChanges: () => void;

  // State
  isInitialized: boolean;
  stats: VFSStats | null;
  currentBranch: string | null;

  // Lifecycle
  initialize: (config: VFSConfig) => Promise<void>;
  refresh: () => Promise<void>;

  // Future: Multi-branch support
  mountBranch: (branch: string) => Promise<void>;
  unmountBranch: (branch: string) => void;
  readFileFromBranch: (path: string, branch: string) => Promise<string>;
  getMountedBranches: () => string[];
}

const VFSContext = createContext<VFSContextValue | null>(null);

/**
 * VFS Provider component
 */
export function VFSProvider({ children }: { children: React.ReactNode }) {
  const vfsRef = useRef<VirtualFileSystem | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [stats, setStats] = useState<VFSStats | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);

  /**
   * Initialize VFS with configuration
   */
  const initialize = useCallback(async (config: VFSConfig) => {
    // Create new instance if config changed or not initialized
    const instance = createVirtualFileSystem(config);
    await instance.initialize();

    vfsRef.current = instance;
    setIsInitialized(true);
    setStats(instance.getStats());
    setCurrentBranch(instance.getCurrentBranch());
  }, []);

  /**
   * Get VFS instance, throwing if not initialized
   */
  const getVFS = useCallback((): VirtualFileSystem => {
    if (!vfsRef.current) {
      throw new Error('VFS not initialized. Call initialize() first.');
    }
    return vfsRef.current;
  }, []);

  /**
   * Update stats after operations that modify pending state
   */
  const updateStats = useCallback(() => {
    if (vfsRef.current) {
      setStats(vfsRef.current.getStats());
    }
  }, []);

  // ============================================
  // Core file operations
  // ============================================

  const readFile = useCallback(async (path: string): Promise<string> => {
    return getVFS().readFile(path);
  }, [getVFS]);

  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    await getVFS().writeFile(path, content);
    updateStats();
  }, [getVFS, updateStats]);

  const exists = useCallback(async (path: string): Promise<boolean> => {
    return getVFS().exists(path);
  }, [getVFS]);

  const unlink = useCallback(async (path: string): Promise<void> => {
    await getVFS().unlink(path);
    updateStats();
  }, [getVFS, updateStats]);

  // ============================================
  // Pending changes
  // ============================================

  const getPendingChanges = useCallback((): PendingFile[] => {
    return vfsRef.current?.getPendingChanges() ?? [];
  }, []);

  const hasPendingChanges = useCallback((): boolean => {
    return vfsRef.current?.hasPendingChanges() ?? false;
  }, []);

  const hasPendingChange = useCallback((path: string): boolean => {
    return vfsRef.current?.hasPendingChange(path) ?? false;
  }, []);

  const getPendingChange = useCallback((path: string): PendingFile | undefined => {
    return vfsRef.current?.getPendingChange(path);
  }, []);

  const clearPendingChanges = useCallback((paths: string[]): void => {
    vfsRef.current?.clearPendingChanges(paths);
    updateStats();
  }, [updateStats]);

  const clearAllPendingChanges = useCallback((): void => {
    vfsRef.current?.clearAllPendingChanges();
    updateStats();
  }, [updateStats]);

  // ============================================
  // Lifecycle
  // ============================================

  const refresh = useCallback(async (): Promise<void> => {
    await vfsRef.current?.refresh();
  }, []);

  // ============================================
  // Future: Multi-branch support
  // ============================================

  const mountBranch = useCallback(async (branch: string): Promise<void> => {
    await getVFS().mountBranch(branch);
  }, [getVFS]);

  const unmountBranch = useCallback((branch: string): void => {
    getVFS().unmountBranch(branch);
  }, [getVFS]);

  const readFileFromBranch = useCallback(async (path: string, branch: string): Promise<string> => {
    return getVFS().readFileFromBranch(path, branch);
  }, [getVFS]);

  const getMountedBranches = useCallback((): string[] => {
    return vfsRef.current?.getMountedBranches() ?? [];
  }, []);

  // ============================================
  // Context value
  // ============================================

  const value: VFSContextValue = {
    // Core operations
    readFile,
    writeFile,
    exists,
    unlink,

    // Pending changes
    getPendingChanges,
    hasPendingChanges,
    hasPendingChange,
    getPendingChange,
    clearPendingChanges,
    clearAllPendingChanges,

    // State
    isInitialized,
    stats,
    currentBranch,

    // Lifecycle
    initialize,
    refresh,

    // Multi-branch
    mountBranch,
    unmountBranch,
    readFileFromBranch,
    getMountedBranches,
  };

  return (
    <VFSContext.Provider value={value}>
      {children}
    </VFSContext.Provider>
  );
}

/**
 * Hook to access VFS context
 */
export function useVFS(): VFSContextValue {
  const context = useContext(VFSContext);
  if (!context) {
    throw new Error('useVFS must be used within a VFSProvider');
  }
  return context;
}

/**
 * Hook to access VFS context, returning null if not available
 * Useful for optional VFS usage
 */
export function useVFSOptional(): VFSContextValue | null {
  return useContext(VFSContext);
}
