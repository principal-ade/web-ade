/**
 * useRepoPresence - Hook to register presence when viewing a repository
 *
 * This hook connects to the Control Tower server and joins the repository room,
 * enabling presence tracking for the current user on this repo.
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTrafficControllerUrl, getWebSocketToken } from '@/lib/control-tower/config';
import { useControlTowerClient } from '@/lib/control-tower/useControlTowerClient';

interface UseRepoPresenceOptions {
  /** Repository in owner/repo format */
  repoId: string;
  /** Branch name (defaults to 'main') */
  branch?: string;
}

interface UseRepoPresenceResult {
  /** Whether connected to the presence server */
  connected: boolean;
  /** Whether currently in the repository room */
  inRoom: boolean;
  /** Any connection error */
  error?: Error;
  /** Loading state while connecting */
  loading: boolean;
}

/**
 * Hook to register presence when viewing a repository page
 *
 * @param options - Repository ID and optional branch
 * @returns Connection status and any errors
 *
 * @example
 * ```tsx
 * function RepoPage({ owner, repo }: { owner: string; repo: string }) {
 *   const { connected, inRoom, loading } = useRepoPresence({
 *     repoId: `${owner}/${repo}`,
 *     branch: 'main',
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useRepoPresence(options: UseRepoPresenceOptions): UseRepoPresenceResult {
  const { repoId, branch = 'main' } = options;
  const { isAuthenticated, user } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<Error>();

  // Fetch access token for this repository
  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      if (!isAuthenticated || !user || !repoId) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const token = await getWebSocketToken(repoId);

        if (cancelled) return;

        if (!token) {
          throw new Error('Failed to get room token');
        }

        setAccessToken(token);
        setTokenError(undefined);
      } catch (err) {
        if (!cancelled) {
          console.error('[useRepoPresence] Failed to get token:', err);
          setTokenError(err instanceof Error ? err : new Error('Failed to fetch presence token'));
          setLoading(false);
        }
      }
    }

    void fetchToken();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, repoId]);

  // Connect to Control Tower and join the repository room
  const shouldConnect = !!accessToken && !!repoId;
  const { connected, roomId, error: connectionError } = useControlTowerClient(
    shouldConnect
      ? {
          serverUrl: getTrafficControllerUrl(),
          accessToken: accessToken!,
          roomId: repoId, // Join the repository room directly
          autoConnect: true,
          enableReconnection: true,
        }
      : {
          serverUrl: '',
          accessToken: '',
          autoConnect: false,
        }
  );

  // Update loading state when connected
  useEffect(() => {
    if (connected && roomId === repoId) {
      setLoading(false);
    }
  }, [connected, roomId, repoId]);

  // Log connection status for debugging
  useEffect(() => {
    if (connected && roomId) {
      console.log(`[useRepoPresence] Connected to ${roomId} (branch: ${branch})`);
    }
  }, [connected, roomId, branch]);

  return {
    connected,
    inRoom: connected && roomId === repoId,
    error: tokenError || connectionError || undefined,
    loading,
  };
}
