/**
 * usePresenceData - Hook for fetching and subscribing to user's presence data
 *
 * This hook connects to the Control Tower server to fetch real-time
 * session information, including which devices/tabs the user has repositories open on.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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
  refetch: () => Promise<void>;
}

/**
 * Fetches room token from the auth API
 */
async function fetchRoomToken(repository: string, branch: string = 'main'): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/room-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repository, branch }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch room token');
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error fetching room token:', error);
    return null;
  }
}

/**
 * Parses JWT to extract agentId and other metadata
 */
function parseJWT(token: string): { agentId?: string; userId?: string; clientType?: string } {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return {};

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    return {};
  }
}

/**
 * Hook to fetch and subscribe to presence data for the current user
 *
 * @param repository - Optional repository to scope the presence data to
 * @returns Sessions, current agentId, loading state, and error
 */
export function usePresenceData(repository?: string): UsePresenceDataResult {
  const { isAuthenticated, user } = useAuth();
  const [sessions, setSessions] = useState<RepositorySession[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const fetchPresence = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // For now, we'll use a temporary repository to get a room token
      // In the future, this should use the actual repository the user is viewing
      const repoForToken = repository || 'principal-ai/example-repo';
      const token = await fetchRoomToken(repoForToken);

      if (!token) {
        throw new Error('Failed to get room token');
      }

      // Parse token to get agentId and clientType
      const { agentId } = parseJWT(token);
      setCurrentAgentId(agentId);

      // TODO: Connect to Control Tower WebSocket to fetch real-time presence data
      // For now, we'll set empty sessions
      // In a full implementation, this would:
      // 1. Connect to WebSocket server
      // 2. Join the __global_presence__ room
      // 3. Listen for presence_updated events
      // 4. Parse the user's session data

      setSessions([]);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch presence'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, repository]);

  // Fetch presence data on mount and when auth state changes
  useEffect(() => {
    void fetchPresence();
  }, [fetchPresence]);

  return {
    sessions,
    currentAgentId,
    loading,
    error,
    refetch: fetchPresence,
  };
}
