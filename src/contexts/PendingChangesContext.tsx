'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

/**
 * Metadata for a file that has been read (used for tracking SHAs for commits)
 */
export interface FileMetadata {
  sha: string;
  originalContent: string;
  loadedAt: Date;
}

/**
 * Represents a pending file change that hasn't been committed yet
 */
export interface PendingFileChange {
  path: string;
  originalContent: string;
  newContent: string;
  sha?: string;  // Git SHA for conflict detection (undefined for new files)
  modifiedAt: Date;
  isNewFile?: boolean;  // True if this is a new file being created
}

/**
 * Context value interface
 */
interface PendingChangesContextValue {
  pendingChanges: Map<string, PendingFileChange>;
  fileMetadata: Map<string, FileMetadata>;
  hasPendingChanges: boolean;
  pendingChangesCount: number;
  setFileMetadata: (path: string, metadata: FileMetadata) => void;
  getFileMetadata: (path: string) => FileMetadata | undefined;
  addPendingChange: (change: PendingFileChange) => void;
  addPendingChangeFromWrite: (path: string, newContent: string) => boolean;
  addNewFilePendingChange: (path: string, content: string) => void;
  updatePendingChange: (path: string, newContent: string) => void;
  removePendingChange: (path: string) => void;
  clearAllPendingChanges: () => void;
  getPendingChangesArray: () => PendingFileChange[];
}

const PendingChangesContext = createContext<PendingChangesContextValue | undefined>(undefined);

/**
 * Provider component for pending changes state
 */
export function PendingChangesProvider({ children }: { children: React.ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingFileChange>>(new Map());
  const [fileMetadata, setFileMetadataState] = useState<Map<string, FileMetadata>>(new Map());

  // Ref mirrors of the maps so read-only callbacks can stay identity-stable.
  // Without this, every setFileMetadata call (which fires on every successful
  // readFile) invalidates addPendingChangeFromWrite, which cascades into
  // enhancedActions / explorerActions and re-triggers PierreSnippetView's
  // effect — producing an infinite Loading flash on walkthrough snippets.
  const fileMetadataRef = useRef(fileMetadata);
  const pendingChangesRef = useRef(pendingChanges);
  useEffect(() => { fileMetadataRef.current = fileMetadata; }, [fileMetadata]);
  useEffect(() => { pendingChangesRef.current = pendingChanges; }, [pendingChanges]);

  const hasPendingChanges = pendingChanges.size > 0;
  const pendingChangesCount = pendingChanges.size;

  // Store file metadata when a file is read (SHA and original content)
  const setFileMetadata = useCallback((path: string, metadata: FileMetadata) => {
    setFileMetadataState(prev => {
      const next = new Map(prev);
      next.set(path, metadata);
      return next;
    });
  }, []);

  const getFileMetadata = useCallback((path: string) => {
    return fileMetadataRef.current.get(path);
  }, []);

  const addPendingChange = useCallback((change: PendingFileChange) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(change.path, change);
      return next;
    });
  }, []);

  // Helper function called when panel's writeFile action is invoked
  // Returns true if successful, false if metadata not found
  const addPendingChangeFromWrite = useCallback((path: string, newContent: string): boolean => {
    const metadata = fileMetadataRef.current.get(path);
    if (!metadata) {
      console.warn('[PendingChanges] No metadata found for file:', path);
      return false;
    }

    // Don't add if content hasn't changed
    if (metadata.originalContent === newContent) {
      // Remove from pending if it was previously changed
      setPendingChanges(prev => {
        if (!prev.has(path)) return prev;
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      return true;
    }

    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(path, {
        path,
        originalContent: metadata.originalContent,
        newContent,
        sha: metadata.sha,
        modifiedAt: new Date(),
      });
      return next;
    });
    return true;
  }, []);

  // Add a pending change for a new file that doesn't exist yet
  // Used by features like backlog init that create new files
  const addNewFilePendingChange = useCallback((path: string, content: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(path, {
        path,
        originalContent: '',
        newContent: content,
        sha: undefined,  // No SHA for new files
        modifiedAt: new Date(),
        isNewFile: true,
      });
      return next;
    });
  }, []);

  const updatePendingChange = useCallback((path: string, newContent: string) => {
    setPendingChanges(prev => {
      const existing = prev.get(path);
      if (!existing) return prev;

      const next = new Map(prev);
      next.set(path, {
        ...existing,
        newContent,
        modifiedAt: new Date(),
      });
      return next;
    });
  }, []);

  const removePendingChange = useCallback((path: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const clearAllPendingChanges = useCallback(() => {
    setPendingChanges(new Map());
  }, []);

  const getPendingChangesArray = useCallback(() => {
    return Array.from(pendingChangesRef.current.values());
  }, []);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingChanges.size]);

  return (
    <PendingChangesContext.Provider
      value={{
        pendingChanges,
        fileMetadata,
        hasPendingChanges,
        pendingChangesCount,
        setFileMetadata,
        getFileMetadata,
        addPendingChange,
        addPendingChangeFromWrite,
        addNewFilePendingChange,
        updatePendingChange,
        removePendingChange,
        clearAllPendingChanges,
        getPendingChangesArray,
      }}
    >
      {children}
    </PendingChangesContext.Provider>
  );
}

/**
 * Hook to access pending changes context
 */
export function usePendingChanges() {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error('usePendingChanges must be used within a PendingChangesProvider');
  }
  return context;
}
