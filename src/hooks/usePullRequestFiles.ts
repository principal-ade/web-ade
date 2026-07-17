import { useEffect, useRef, useState } from 'react';
import type { ChangedFile } from '@/lib/activity/commitLayers';

/**
 * Batch-fetches the changed-file lists for a set of PR numbers (from the
 * cached PR files API) and returns a `prNumber → ChangedFile[]` map, for
 * building an aggregate PR heatmap on the city. Results accumulate across
 * calls and are cached per-PR in a ref so re-renders don't refetch.
 */
export function usePullRequestFiles(
  owner: string,
  repo: string,
  prNumbers: number[],
  { enabled = true, cap = 30 }: { enabled?: boolean; cap?: number } = {},
) {
  const [filesByPr, setFilesByPr] = useState<Map<number, ChangedFile[]>>(
    new Map(),
  );
  const cacheRef = useRef<Map<number, ChangedFile[]>>(new Map());

  useEffect(() => {
    cacheRef.current = new Map();
    setFilesByPr(new Map());
  }, [owner, repo]);

  const wanted = enabled ? prNumbers.slice(0, cap) : [];
  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;

    const toFetch = wanted.filter(
      (n) => !cacheRef.current.has(n),
    );

    const rebuild = () => {
      if (cancelled) return;
      const next = new Map<number, ChangedFile[]>();
      for (const n of wanted) {
        const hit = cacheRef.current.get(n);
        if (hit) next.set(n, hit);
      }
      setFilesByPr(next);
    };

    if (toFetch.length === 0) {
      rebuild();
      return;
    }

    (async () => {
      await Promise.all(
        toFetch.map(async (prNumber) => {
          try {
            const res = await fetch(
              `/api/github/repo/${owner}/${repo}/pull-requests/${prNumber}/files`,
            );
            if (!res.ok) return;
            const data = await res.json();
            const files: ChangedFile[] = (data.files ?? []).map(
              (f: { filename: string; status: string; additions?: number; deletions?: number }) => ({
                filename: f.filename,
                status: f.status,
                additions: f.additions ?? 0,
                deletions: f.deletions ?? 0,
              }),
            );
            cacheRef.current.set(prNumber, files);
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

  return filesByPr;
}
