import { useEffect, useRef, useState } from 'react';
import type { CommitView } from '@industry-theme/file-city-panel';
import type { GitHubCommitDetailResponse } from '@/types/api';

interface Result {
  commit: CommitView | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a commit's metadata + changed-file list and maps it to the
 * `CommitView` shape consumed by FileCityGuidePanel's native commit mode.
 *
 * This reads no patches/parent contents (the previous approach synthesized a
 * diff trail) — the panel lights the changed buildings on the city and lists
 * the files; diffs are out of scope. Returns `null` while idle (no sha) or
 * loading.
 */
export function useCommitView(
  owner: string,
  repo: string,
  sha: string | null,
): Result {
  const [state, setState] = useState<Result>({
    commit: null,
    loading: false,
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (!sha) {
      setState({ commit: null, loading: false, error: null });
      return;
    }
    const id = ++reqId.current;
    // Keep the previously-loaded commit visible while the next one fetches.
    // Blanking to null here would read to the panel as a dismissal (commit
    // slice → null), firing the commit-mode exit animation — the city would
    // dart back toward center then return to the top-right when the new commit
    // lands. Holding the stale value keeps the switch in place.
    setState((prev) => ({ commit: prev.commit, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetch(
          `/api/github/repo/${owner}/${repo}/commits/${sha}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load commit (${res.status})`);
        }
        const detail: GitHubCommitDetailResponse = await res.json();
        if (id !== reqId.current) return; // superseded

        const files = detail.files ?? [];
        const commit: CommitView = {
          sha: detail.sha,
          message: detail.commit.message,
          author: {
            name: detail.commit.author.name,
            login: detail.author?.login,
            avatarUrl: detail.author?.avatar_url,
          },
          authoredAt: detail.commit.author.date,
          parents: detail.parents?.map((p) => p.sha),
          stats: {
            filesChanged: files.length,
            additions: detail.stats?.additions ?? 0,
            deletions: detail.stats?.deletions ?? 0,
          },
          url: detail.html_url,
          files: files.map((f) => ({
            path: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            previousPath: f.previous_filename,
          })),
        };

        setState({ commit, loading: false, error: null });
      } catch (err) {
        if (id !== reqId.current) return;
        setState({
          commit: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load commit',
        });
      }
    })();
  }, [owner, repo, sha]);

  return state;
}
