import { useCallback, useEffect, useRef, useState } from 'react';
import type { components } from '@octokit/openapi-types';

type GitHubIssue = components['schemas']['issue'];
export type IssueStateFilter = 'open' | 'closed' | 'all';

/**
 * Paginated fetcher for a repo's issues, newest-updated first.
 *
 * Mirrors `useRepoCommits`: hits the cached issues list API
 * (`/api/github/repo/[owner]/[name]/issues`), which filters out pull requests
 * and returns full GitHub issue objects. `hasMore` stays true while the last
 * page came back full (GitHub gives no total).
 */
export function useRepoIssues(
  owner: string,
  repo: string,
  {
    perPage = 30,
    state = 'open',
  }: { perPage?: number; state?: IssueStateFilter } = {},
) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
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
          `/api/github/repo/${owner}/${repo}/issues?per_page=${perPage}&page=${page}&state=${state}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load issues (${res.status})`);
        }
        const data = await res.json();
        const next: GitHubIssue[] = data.issues || [];
        pageRef.current = page;
        setHasMore(next.length === perPage);
        setIssues((prev) => (append ? [...prev, ...next] : next));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load issues');
        if (!append) setIssues([]);
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

  return { issues, loading, loadingMore, error, hasMore, loadMore, refresh };
}
