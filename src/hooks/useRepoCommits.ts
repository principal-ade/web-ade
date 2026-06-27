import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitHubCommit } from '@/types/api';

/**
 * Paginated fetcher for a repo's default-branch commit history.
 *
 * Hits the cached commits API (`/api/github/repo/[owner]/[name]/commits`), which
 * with no `sha` param returns the repository's default branch (main). Distinct
 * from `useGitHubActivityFeed`, which hard-filters to the last 24 hours — here we
 * want the full history, newest-first, loaded a page at a time.
 */
export function useRepoCommits(
  owner: string,
  repo: string,
  { perPage = 30 }: { perPage?: number } = {},
) {
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `hasMore` is true while the last page came back full — GitHub gives no total.
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
          `/api/github/repo/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load commits (${res.status})`);
        }
        const data = await res.json();
        const next: GitHubCommit[] = data.commits || [];
        pageRef.current = page;
        setHasMore(next.length === perPage);
        setCommits((prev) => (append ? [...prev, ...next] : next));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load commits');
        if (!append) setCommits([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [owner, repo, perPage],
  );

  // Reset and reload whenever the repo changes.
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

  return { commits, loading, loadingMore, error, hasMore, loadMore, refresh };
}
