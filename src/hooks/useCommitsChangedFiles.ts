import { useEffect, useRef, useState } from 'react';
import type { GitHubCommitDetailResponse } from '@/types/api';
import type { ChangedFile } from '@/lib/activity/commitLayers';

/**
 * Batch-fetches the changed-file lists for a set of commit SHAs (from the
 * cached commit-detail API) and returns a `sha → ChangedFile[]` map, for
 * building an aggregate churn heatmap. Results accumulate across calls and are
 * cached per-sha in a ref so re-renders don't refetch. Capped to avoid hammering
 * the API on large pages; mirrors RepositoryActivityFeedPanel's approach.
 */
export function useCommitsChangedFiles(
  owner: string,
  repo: string,
  shas: string[],
  { enabled = true, cap = 30 }: { enabled?: boolean; cap?: number } = {},
) {
  const [filesByCommit, setFilesByCommit] = useState<Map<string, ChangedFile[]>>(
    new Map(),
  );
  // Per-sha cache that survives re-renders; keyed `${owner}/${repo}@${sha}`.
  const cacheRef = useRef<Map<string, ChangedFile[]>>(new Map());

  // Reset the cache when the repo changes.
  useEffect(() => {
    cacheRef.current = new Map();
    setFilesByCommit(new Map());
  }, [owner, repo]);

  const wanted = enabled ? shas.slice(0, cap) : [];
  // Stable dependency: the set of SHAs we intend to have loaded.
  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;

    const toFetch = wanted.filter(
      (sha) => !cacheRef.current.has(`${owner}/${repo}@${sha}`),
    );

    // Even with nothing new to fetch, rebuild the map so it reflects `wanted`.
    const rebuild = () => {
      if (cancelled) return;
      const next = new Map<string, ChangedFile[]>();
      for (const sha of wanted) {
        const hit = cacheRef.current.get(`${owner}/${repo}@${sha}`);
        if (hit) next.set(sha, hit);
      }
      setFilesByCommit(next);
    };

    if (toFetch.length === 0) {
      rebuild();
      return;
    }

    (async () => {
      await Promise.all(
        toFetch.map(async (sha) => {
          try {
            const res = await fetch(
              `/api/github/repo/${owner}/${repo}/commits/${sha}`,
            );
            if (!res.ok) return;
            const data: GitHubCommitDetailResponse = await res.json();
            const files: ChangedFile[] = (data.files ?? []).map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions ?? 0,
              deletions: f.deletions ?? 0,
            }));
            cacheRef.current.set(`${owner}/${repo}@${sha}`, files);
          } catch {
            // Ignore individual failures — the heatmap is best-effort.
          }
        }),
      );
      rebuild();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, wantedKey]);

  return filesByCommit;
}
