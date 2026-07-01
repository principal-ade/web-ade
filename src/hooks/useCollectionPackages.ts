/**
 * useCollectionPackages - Centralized hook for fetching package data for collection repositories
 *
 * Used by:
 * - WorldsPageProvider
 * - SharedCollectionsProvider
 *
 * Features:
 * - Progressive loading (each repo's packages arrive independently)
 * - Preserves existing packages when collection changes (only removes stale repos)
 * - Proper cleanup with AbortController
 * - Loading and error state tracking per repo
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { PackageLayer } from '@industry-theme/repository-composition-panels';

export interface UseCollectionPackagesResult {
  /** Package data keyed by repository ID (e.g., "owner/repo") */
  packages: Record<string, PackageLayer[]>;
  /** Set of repository IDs currently loading */
  loadingRepos: Set<string>;
  /** Set of repository IDs that failed to load */
  failedRepos: Set<string>;
  /** Whether any repos are currently loading */
  isLoading: boolean;
  /** Retry fetching packages for failed repos */
  retryFailed: () => void;
}

/**
 * Hook for fetching and managing package data for a collection's repositories
 *
 * @param collectionRepositories - Array of repository IDs (e.g., ["owner/repo1", "owner/repo2"])
 * @returns Package data, loading state, and error handling utilities
 */
export function useCollectionPackages(
  collectionRepositories: string[] | undefined
): UseCollectionPackagesResult {
  const [packages, setPackages] = useState<Record<string, PackageLayer[]>>({});
  const [loadingRepos, setLoadingRepos] = useState<Set<string>>(new Set());
  const [failedRepos, setFailedRepos] = useState<Set<string>>(new Set());

  // Fetch packages for collection repositories
  useEffect(() => {
    if (!collectionRepositories || collectionRepositories.length === 0) {
      setPackages({});
      setLoadingRepos(new Set());
      setFailedRepos(new Set());
      return;
    }

    // Create abort controller for cleanup
    const abortController = new AbortController();
    const currentRepoSet = new Set(collectionRepositories);

    // Remove packages for repos no longer in collection (preserve existing)
    setPackages(prev => {
      const filtered: Record<string, PackageLayer[]> = {};
      for (const repoId of Object.keys(prev)) {
        if (currentRepoSet.has(repoId) && prev[repoId]) {
          filtered[repoId] = prev[repoId];
        }
      }
      return filtered;
    });

    // Clear failed status for repos no longer in collection
    setFailedRepos(prev => {
      const filtered = new Set<string>();
      prev.forEach(repoId => {
        if (currentRepoSet.has(repoId)) {
          filtered.add(repoId);
        }
      });
      return filtered;
    });

    // Track repos we're about to fetch
    setLoadingRepos(prev => {
      const next = new Set(prev);
      collectionRepositories.forEach(repoId => next.add(repoId));
      return next;
    });

    // Fetch packages for a single repo
    const fetchPackagesForRepo = async (repoId: string) => {
      const [owner, repo] = repoId.split('/');
      if (!owner || !repo) {
        setLoadingRepos(prev => {
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        });
        return;
      }

      try {
        if (abortController.signal.aborted) return;

        const data = await trpc.github.getRepoPackages.query({ owner, repo });

        if (abortController.signal.aborted) return;

        setPackages(prev => ({
          ...prev,
          [repoId]: data.packages || [],
        }));

        // Clear from failed set if successful
        setFailedRepos(prev => {
          if (!prev.has(repoId)) return prev;
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        });
      } catch (error) {
        if (abortController.signal.aborted) return;

        console.error(`[useCollectionPackages] Failed to fetch packages for ${repoId}:`, error);
        setFailedRepos(prev => {
          const next = new Set(prev);
          next.add(repoId);
          return next;
        });
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingRepos(prev => {
            const next = new Set(prev);
            next.delete(repoId);
            return next;
          });
        }
      }
    };

    // Start fetching all repos
    collectionRepositories.forEach(repoId => {
      queueMicrotask(() => {
        if (abortController.signal.aborted) return;
        fetchPackagesForRepo(repoId);
      });
    });

    // Cleanup: abort in-flight requests
    return () => {
      abortController.abort();
    };
  }, [collectionRepositories]);

  // Retry failed repos
  const retryFailed = useCallback(() => {
    if (failedRepos.size === 0) return;

    const reposToRetry = Array.from(failedRepos);

    // Clear failed status for repos we're retrying
    setFailedRepos(new Set());

    // Mark as loading
    setLoadingRepos(prev => {
      const next = new Set(prev);
      reposToRetry.forEach(repoId => next.add(repoId));
      return next;
    });

    // Fetch each failed repo
    reposToRetry.forEach(async (repoId) => {
      const [owner, repo] = repoId.split('/');
      if (!owner || !repo) {
        setLoadingRepos(prev => {
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        });
        return;
      }

      try {
        const data = await trpc.github.getRepoPackages.query({ owner, repo });

        setPackages(prev => ({
          ...prev,
          [repoId]: data.packages || [],
        }));
      } catch (error) {
        console.error(`[useCollectionPackages] Retry failed for ${repoId}:`, error);
        setFailedRepos(prev => {
          const next = new Set(prev);
          next.add(repoId);
          return next;
        });
      } finally {
        setLoadingRepos(prev => {
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        });
      }
    });
  }, [failedRepos]);

  const isLoading = useMemo(() => loadingRepos.size > 0, [loadingRepos]);

  return {
    packages,
    loadingRepos,
    failedRepos,
    isLoading,
    retryFailed,
  };
}
