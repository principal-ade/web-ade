/**
 * usePersonalizedFeed - Hook for loading personalized feed repositories
 *
 * Fetches the user's subscribed collections and merges repos into a single list.
 * Falls back to FEATURED_REPOS if not authenticated or no subscriptions.
 *
 * @otel canvas: .principal-views/feed-collections/feed-collections.otel.canvas
 */

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { FEATURED_REPOS } from '@/lib/featured-repos';
import type { FeedRepo } from '@/lib/feed-collections/types';

export interface UsePersonalizedFeedResult {
  /** Repository list for the feed */
  repos: FeedRepo[];
  /** Whether the feed is personalized (vs. featured) */
  isPersonalized: boolean;
  /** Number of collections contributing to the feed */
  collectionCount: number;
  /** Whether the feed is currently loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refresh the feed data */
  refresh: () => void;
}

/**
 * Hook for loading personalized feed repositories
 *
 * @returns Feed repos, loading state, and utility functions
 *
 * @example
 * ```tsx
 * function ActivityFeed() {
 *   const { repos, isPersonalized, isLoading } = usePersonalizedFeed();
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return (
 *     <div>
 *       {isPersonalized && <Badge>Personalized</Badge>}
 *       {repos.map(repo => <RepoCard key={`${repo.owner}/${repo.repo}`} {...repo} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePersonalizedFeed(): UsePersonalizedFeedResult {
  const [repos, setRepos] = useState<FeedRepo[]>(() =>
    FEATURED_REPOS.map((r) => ({
      owner: r.owner,
      repo: r.repo,
      description: r.description,
    }))
  );
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [collectionCount, setCollectionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.feed.getPersonalizedRepos.query();

      setRepos(result.repos);
      setIsPersonalized(result.isPersonalized);
      setCollectionCount(result.collectionCount);
    } catch (err) {
      console.error('[usePersonalizedFeed] Failed to fetch feed:', err);

      // On error, fall back to featured repos
      setRepos(
        FEATURED_REPOS.map((r) => ({
          owner: r.owner,
          repo: r.repo,
          description: r.description,
        }))
      );
      setIsPersonalized(false);
      setCollectionCount(0);

      // Only set error for non-auth errors
      // (unauthorized is expected for logged-out users)
      if (err instanceof Error && !err.message.includes('UNAUTHORIZED')) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    repos,
    isPersonalized,
    collectionCount,
    isLoading,
    error,
    refresh,
  };
}
