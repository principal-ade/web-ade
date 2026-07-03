import { useCallback, useEffect, useRef, useState } from 'react';
import type { components } from '@octokit/openapi-types';

type GitHubPullRequestSimple = components['schemas']['pull-request-simple'];
export type PrStateFilter = 'open' | 'closed' | 'all';

/**
 * Paginated fetcher for a repo's pull requests, newest-updated first.
 *
 * Mirrors `useRepoIssues`: hits the cached PR list API
 * (`/api/github/repo/[owner]/[name]/pull-requests`), which returns full GitHub
 * `pull-request-simple` objects. `hasMore` stays true while the last page came
 * back full (GitHub gives no total).
 */
export function useRepoPullRequests(
  owner: string,
  repo: string,
  {
    perPage = 30,
    state = 'open',
  }: { perPage?: number; state?: PrStateFilter } = {},
) {
  const [pullRequests, setPullRequests] = useState<GitHubPullRequestSimple[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/github/repo/${owner}/${repo}/pull-requests?per_page=${perPage}&page=${page}&state=${state}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || `Failed to load pull requests (${res.status})`,
          );
        }
        const data = await res.json();
        const next: GitHubPullRequestSimple[] = data.pullRequests || [];
        pageRef.current = page;
        setHasMore(next.length === perPage);
        setPullRequests((prev) => (append ? [...prev, ...next] : next));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(
          err instanceof Error ? err.message : 'Failed to load pull requests',
        );
        if (!append) setPullRequests([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [owner, repo, perPage, state],
  );

  // Reset and reload whenever the repo or the state filter changes.
  useEffect(() => {
    pageRef.current = 1;
    setHasMore(true);
    fetchPage(1, false);
    return () => abortRef.current?.abort();
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(pageRef.current + 1, true);
  }, [loading, loadingMore, hasMore, fetchPage]);

  const refresh = useCallback(() => {
    pageRef.current = 1;
    setHasMore(true);
    fetchPage(1, false);
  }, [fetchPage]);

  return { pullRequests, loading, loadingMore, error, hasMore, loadMore, refresh };
}
