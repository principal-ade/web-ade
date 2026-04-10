/**
 * useWatches - Hook for managing watched users and repositories
 *
 * Provides state and mutations for watching/unwatching GitHub users and repos.
 * Data is persisted to S3 via tRPC endpoints.
 */

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { WatchedUser, WatchedRepo } from '@/lib/feed-collections/types';
import {
  MAX_WATCHED_USERS,
  MAX_WATCHED_REPOS,
} from '@/lib/feed-collections/types';

export interface UseWatchesResult {
  /** List of watched users */
  watchedUsers: WatchedUser[];
  /** List of watched repos */
  watchedRepos: WatchedRepo[];
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;

  // Mutations
  /** Watch a GitHub user */
  watchUser: (login: string) => Promise<void>;
  /** Unwatch a GitHub user */
  unwatchUser: (login: string) => Promise<void>;
  /** Watch a repository */
  watchRepo: (owner: string, repo: string) => Promise<void>;
  /** Unwatch a repository */
  unwatchRepo: (owner: string, repo: string) => Promise<void>;

  // Helpers
  /** Check if a user is being watched */
  isWatchingUser: (login: string) => boolean;
  /** Check if a repo is being watched */
  isWatchingRepo: (owner: string, repo: string) => boolean;
  /** Whether the user can watch more users */
  canWatchMoreUsers: boolean;
  /** Whether the user can watch more repos */
  canWatchMoreRepos: boolean;

  /** Refresh the watches data */
  refresh: () => void;
}

/**
 * Hook for managing watched users and repositories
 *
 * @returns Watches state, mutations, and utility functions
 *
 * @example
 * ```tsx
 * function WatchButton({ login }: { login: string }) {
 *   const { isWatchingUser, watchUser, unwatchUser, canWatchMoreUsers } = useWatches();
 *   const isWatching = isWatchingUser(login);
 *
 *   return (
 *     <button
 *       onClick={() => isWatching ? unwatchUser(login) : watchUser(login)}
 *       disabled={!isWatching && !canWatchMoreUsers}
 *     >
 *       {isWatching ? 'Unwatch' : 'Watch'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useWatches(): UseWatchesResult {
  const [watchedUsers, setWatchedUsers] = useState<WatchedUser[]>([]);
  const [watchedRepos, setWatchedRepos] = useState<WatchedRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchWatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.feed.getWatches.query();
      setWatchedUsers(result.watchedUsers);
      setWatchedRepos(result.watchedRepos);
    } catch (err) {
      console.error('[useWatches] Failed to fetch watches:', err);

      // Reset to empty on error
      setWatchedUsers([]);
      setWatchedRepos([]);

      // Only set error for non-auth errors
      if (err instanceof Error && !err.message.includes('UNAUTHORIZED')) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatches();
  }, [fetchWatches, refreshKey]);

  // Mutations
  const watchUser = useCallback(async (login: string) => {
    try {
      const result = await trpc.feed.watchUser.mutate({ login });
      setWatchedUsers(result.watchedUsers);
    } catch (err) {
      console.error('[useWatches] Failed to watch user:', err);
      throw err;
    }
  }, []);

  const unwatchUser = useCallback(async (login: string) => {
    try {
      const result = await trpc.feed.unwatchUser.mutate({ login });
      setWatchedUsers(result.watchedUsers);
    } catch (err) {
      console.error('[useWatches] Failed to unwatch user:', err);
      throw err;
    }
  }, []);

  const watchRepo = useCallback(async (owner: string, repo: string) => {
    try {
      const result = await trpc.feed.watchRepo.mutate({ owner, repo });
      setWatchedRepos(result.watchedRepos);
    } catch (err) {
      console.error('[useWatches] Failed to watch repo:', err);
      throw err;
    }
  }, []);

  const unwatchRepo = useCallback(async (owner: string, repo: string) => {
    try {
      const result = await trpc.feed.unwatchRepo.mutate({ owner, repo });
      setWatchedRepos(result.watchedRepos);
    } catch (err) {
      console.error('[useWatches] Failed to unwatch repo:', err);
      throw err;
    }
  }, []);

  // Helpers
  const isWatchingUser = useCallback(
    (login: string) =>
      watchedUsers.some(
        (u) => u.login.toLowerCase() === login.toLowerCase()
      ),
    [watchedUsers]
  );

  const isWatchingRepo = useCallback(
    (owner: string, repo: string) =>
      watchedRepos.some(
        (r) =>
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
      ),
    [watchedRepos]
  );

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    watchedUsers,
    watchedRepos,
    isLoading,
    error,
    watchUser,
    unwatchUser,
    watchRepo,
    unwatchRepo,
    isWatchingUser,
    isWatchingRepo,
    canWatchMoreUsers: watchedUsers.length < MAX_WATCHED_USERS,
    canWatchMoreRepos: watchedRepos.length < MAX_WATCHED_REPOS,
    refresh,
  };
}
