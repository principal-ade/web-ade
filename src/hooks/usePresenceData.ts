/**
 * usePresenceData - Hook for fetching and subscribing to user's presence data
 *
 * This hook uses the shared Control Tower connection from ControlTowerContext
 * to fetch real-time session information.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useControlTower } from '@/contexts/ControlTowerContext';

/**
 * Repository session information from the server
 */
export interface RepositorySession {
  repoId: string;
  branch: string;
  openedAt: number;
  lastActivity: number;
  currentFile?: string;
  hasUnsavedChanges?: boolean;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
  };
  agentId: string;
  clientType?: 'desktop' | 'web';
}

/**
 * Presence data for the current user
 */
export interface PresenceData {
  openRepositories: RepositorySession[];
  activeRepository?: string;
  visible: boolean;
  statusMessage?: string;
  currentActivity?: {
    type: 'editing' | 'reviewing' | 'debugging' | 'idle';
    details?: string;
  };
}

interface UsePresenceDataResult {
  sessions: RepositorySession[];
  currentAgentId?: string;
  loading: boolean;
  error?: Error;
  connected: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and subscribe to presence data for the current user
 *
 * Uses the shared Control Tower connection from ControlTowerProvider.
 *
 * @param repository - Optional repository to scope the presence data to (unused, kept for API compat)
 * @returns Sessions, current agentId, loading state, connection status, and error
 */
export function usePresenceData(repository?: string): UsePresenceDataResult {
  const { user } = useAuth();
  const { connected, roomState, error: connectionError, loading: contextLoading } = useControlTower();
  const [sessions, setSessions] = useState<RepositorySession[]>([]);

  // Extract sessions from presence data
  useEffect(() => {
    if (!connected || !roomState || !user) {
      setSessions([]);
      return;
    }

    try {
      // Find current user in the room state
      const currentUser = Array.from(roomState.users.values()).find(
        (u) => u.id === user.login || u.id === user.id.toString()
      );

      // Extract openRepositories from user metadata if available
      const presenceData = currentUser?.metadata as PresenceData | undefined;
      if (presenceData?.openRepositories) {
        setSessions(presenceData.openRepositories);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error('[usePresenceData] Error extracting sessions:', err);
      setSessions([]);
    }
  }, [connected, roomState, user]);

  // Refetch is a no-op now since we use a shared connection
  const refetch = useCallback(async () => {
    // The shared connection handles reconnection automatically
  }, []);

  // Suppress unused variable warning
  void repository;

  return {
    sessions,
    currentAgentId: undefined, // Not available from context currently
    loading: contextLoading,
    error: connectionError || undefined,
    connected,
    refetch,
  };
}
