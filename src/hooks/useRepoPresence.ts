/**
 * useRepoPresence - Hook to register presence when viewing a repository
 *
 * This hook uses the shared Control Tower connection from ControlTowerContext
 * and joins the repository room, enabling presence tracking for the current user.
 */

'use client';

import { useEffect, useState } from 'react';
import { useControlTower } from '@/contexts/ControlTowerContext';

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
 * Uses the shared Control Tower connection from ControlTowerProvider.
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
  const { connected, roomId, error, loading: contextLoading, joinRoom } = useControlTower();
  const [joining, setJoining] = useState(false);

  // Join the repository room when connected
  useEffect(() => {
    if (!connected || !repoId || joining) {
      return;
    }

    // Don't rejoin if already in the room
    if (roomId === repoId) {
      return;
    }

    setJoining(true);

    joinRoom(repoId)
      .then(() => {
        console.log(`[useRepoPresence] Joined room ${repoId} (branch: ${branch})`);
      })
      .catch((err) => {
        console.error(`[useRepoPresence] Failed to join room ${repoId}:`, err);
      })
      .finally(() => {
        setJoining(false);
      });
  }, [connected, repoId, roomId, branch, joinRoom, joining]);

  return {
    connected,
    inRoom: roomId === repoId,
    error: error || undefined,
    loading: contextLoading || joining,
  };
}
