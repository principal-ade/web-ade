/**
 * usePresenceData - Hook for fetching and subscribing to user's presence data
 *
 * This hook connects to the Control Tower server to fetch real-time
 * session information, including which devices/tabs the user has repositories open on.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTrafficControllerUrl, getWebSocketToken } from '@/lib/control-tower/config';
import { useControlTowerClient } from '@/lib/control-tower/useControlTowerClient';

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
 * @returns Sessions, current agentId, loading state, connection status, and error
 */
export function usePresenceData(repository?: string): UsePresenceDataResult {
  const { isAuthenticated, user } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string>();
  const [sessions, setSessions] = useState<RepositorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  // Fetch access token when user authenticates
  useEffect(() => {
    async function fetchToken() {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      try {
        // Use a default repository to get a room token for global presence
        const repoForToken = repository || 'principal-ai/repository-traffic-controller';
        const token = await getWebSocketToken(repoForToken);

        if (!token) {
          throw new Error('Failed to get room token');
        }

        // Parse token to get agentId
        const { agentId } = parseJWT(token);
        setCurrentAgentId(agentId);
        setAccessToken(token);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch presence token'));
        setLoading(false);
      }
    }

    void fetchToken();
  }, [isAuthenticated, user, repository]);

  // Connect to Control Tower WebSocket (only if we have a token)
  const shouldConnect = !!accessToken;
  const controlTower = useControlTowerClient(
    shouldConnect
      ? {
          serverUrl: getTrafficControllerUrl(),
          accessToken: accessToken!,
          roomId: '__global_presence__',
          autoConnect: true,
          enableReconnection: true,
        }
      : {
          serverUrl: '',
          accessToken: '',
          autoConnect: false,
        }
  );

  // Extract sessions from presence data
  useEffect(() => {
    if (!controlTower.connected || !controlTower.roomState || !user) {
      setLoading(!controlTower.connected && accessToken !== null);
      return;
    }

    // Find current user in the room state
    const currentUser = Array.from(controlTower.roomState.users.values()).find(
      (u) => u.id === user.login || u.id === user.id.toString()
    );

    // Extract openRepositories from user metadata if available
    const presenceData = currentUser?.metadata as PresenceData | undefined;
    if (presenceData?.openRepositories) {
      setSessions(presenceData.openRepositories);
    } else {
      setSessions([]);
    }

    setLoading(false);
    setError(undefined);
  }, [controlTower.connected, controlTower.roomState, user, accessToken]);

  // Handle connection errors
  useEffect(() => {
    if (controlTower.error) {
      setError(controlTower.error);
      setLoading(false);
    }
  }, [controlTower.error]);

  // Refetch by reconnecting
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    // Trigger token refetch by resetting
    const token = await getWebSocketToken(repository || 'principal-ai/repository-traffic-controller');
    if (token) {
      setAccessToken(token);
    }
  }, [repository]);

  return {
    sessions,
    currentAgentId,
    loading,
    error,
    connected: controlTower.connected,
    refetch,
  };
}
