/**
 * useFollows - Hook for managing followed users and repositories
 *
 * Provides state and mutations for following/unfollowing GitHub users and repos.
 * Data is persisted to S3 via tRPC endpoints.
 */

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { FollowedUser, FollowedRepo } from '@/lib/feed-collections/types';
import {
  MAX_FOLLOWED_USERS,
  MAX_FOLLOWED_REPOS,
} from '@/lib/feed-collections/types';

export interface UseFollowsResult {
  /** List of followed users */
  followedUsers: FollowedUser[];
  /** List of followed repos */
  followedRepos: FollowedRepo[];
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;

  // Mutations
  /** Follow a GitHub user */
  followUser: (login: string) => Promise<void>;
  /** Unfollow a GitHub user */
  unfollowUser: (login: string) => Promise<void>;
  /** Follow a repository */
  followRepo: (owner: string, repo: string) => Promise<void>;
  /** Unfollow a repository */
  unfollowRepo: (owner: string, repo: string) => Promise<void>;

  // Helpers
  /** Check if a user is being followed */
  isFollowingUser: (login: string) => boolean;
  /** Check if a repo is being followed */
  isFollowingRepo: (owner: string, repo: string) => boolean;
  /** Whether the user can follow more users */
  canFollowMoreUsers: boolean;
  /** Whether the user can follow more repos */
  canFollowMoreRepos: boolean;

  /** Refresh the follows data */
  refresh: () => void;
}

/**
 * Hook for managing followed users and repositories
 *
 * @returns Follows state, mutations, and utility functions
 *
 * @example
 * ```tsx
 * function FollowButton({ login }: { login: string }) {
 *   const { isFollowingUser, followUser, unfollowUser, canFollowMoreUsers } = useFollows();
 *   const isFollowing = isFollowingUser(login);
 *
 *   return (
 *     <button
 *       onClick={() => isFollowing ? unfollowUser(login) : followUser(login)}
 *       disabled={!isFollowing && !canFollowMoreUsers}
 *     >
 *       {isFollowing ? 'Unfollow' : 'Follow'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useFollows(): UseFollowsResult {
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [followedRepos, setFollowedRepos] = useState<FollowedRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchFollows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.feed.getFollows.query();
      setFollowedUsers(result.followedUsers);
      setFollowedRepos(result.followedRepos);
    } catch (err) {
      console.error('[useFollows] Failed to fetch follows:', err);

      // Reset to empty on error
      setFollowedUsers([]);
      setFollowedRepos([]);

      // Only set error for non-auth errors
      if (err instanceof Error && !err.message.includes('UNAUTHORIZED')) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollows();
  }, [fetchFollows, refreshKey]);

  // Mutations
  const followUser = useCallback(async (login: string) => {
    try {
      const result = await trpc.feed.followUser.mutate({ login });
      setFollowedUsers(result.followedUsers);
    } catch (err) {
      console.error('[useFollows] Failed to follow user:', err);
      throw err;
    }
  }, []);

  const unfollowUser = useCallback(async (login: string) => {
    try {
      const result = await trpc.feed.unfollowUser.mutate({ login });
      setFollowedUsers(result.followedUsers);
    } catch (err) {
      console.error('[useFollows] Failed to unfollow user:', err);
      throw err;
    }
  }, []);

  const followRepo = useCallback(async (owner: string, repo: string) => {
    try {
      const result = await trpc.feed.followRepo.mutate({ owner, repo });
      setFollowedRepos(result.followedRepos);
    } catch (err) {
      console.error('[useFollows] Failed to follow repo:', err);
      throw err;
    }
  }, []);

  const unfollowRepo = useCallback(async (owner: string, repo: string) => {
    try {
      const result = await trpc.feed.unfollowRepo.mutate({ owner, repo });
      setFollowedRepos(result.followedRepos);
    } catch (err) {
      console.error('[useFollows] Failed to unfollow repo:', err);
      throw err;
    }
  }, []);

  // Helpers
  const isFollowingUser = useCallback(
    (login: string) =>
      followedUsers.some(
        (u) => u.login.toLowerCase() === login.toLowerCase()
      ),
    [followedUsers]
  );

  const isFollowingRepo = useCallback(
    (owner: string, repo: string) =>
      followedRepos.some(
        (r) =>
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
      ),
    [followedRepos]
  );

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    followedUsers,
    followedRepos,
    isLoading,
    error,
    followUser,
    unfollowUser,
    followRepo,
    unfollowRepo,
    isFollowingUser,
    isFollowingRepo,
    canFollowMoreUsers: followedUsers.length < MAX_FOLLOWED_USERS,
    canFollowMoreRepos: followedRepos.length < MAX_FOLLOWED_REPOS,
    refresh,
  };
}
