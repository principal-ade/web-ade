import { useEffect, useRef, useState } from 'react';

export interface CommitTheme {
  title: string;
  summary: string;
  shas: string[];
}

interface ThemeInput {
  sha: string;
  message: string;
  author?: string;
}

interface CacheEntry {
  key: string;
  themes: CommitTheme[];
}

/**
 * Fetches emergent themes clustering a set of commits. Re-requests
 * whenever the underlying SHA set changes; in-flight requests are
 * abandoned when inputs change.
 */
export function useCommitThemes(
  repoName: string,
  commits: ThemeInput[],
  { minCommits = 3 }: { minCommits?: number } = {}
) {
  const [themes, setThemes] = useState<CommitTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<CacheEntry | null>(null);

  // Stable key: sorted SHAs + repo name
  const key = `${repoName}::${commits.map((c) => c.sha).sort().join(',')}`;

  useEffect(() => {
    if (commits.length < minCommits) {
      setThemes([]);
      setError(null);
      return;
    }

    if (cacheRef.current?.key === key) {
      setThemes(cacheRef.current.themes);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch('/api/theme-commits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoName,
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.message,
              author: c.author,
            })),
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${response.status})`);
        }

        const data = (await response.json()) as { themes: CommitTheme[] };
        if (cancelled) return;
        cacheRef.current = { key, themes: data.themes };
        setThemes(data.themes);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setThemes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, minCommits]);

  return { themes, loading, error };
}
