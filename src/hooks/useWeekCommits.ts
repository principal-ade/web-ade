import { useEffect, useRef, useState } from 'react';
import type {
  CommitFileChange,
  CommitView,
  WeekCommitsView,
  WeekStartsOn,
} from '@industry-theme/file-city-panel';
import type { FileTree } from '@principal-ai/repository-abstraction';
import type { GitHubCommit, GitHubCommitDetailResponse } from '@/types/api';

const WEEK_STARTS_ON: WeekStartsOn = 1; // Monday
/** Cap detail fetches so a hyperactive repo can't fire hundreds of calls. */
const MAX_COMMITS = 50;
const DETAIL_CONCURRENCY = 4;

interface Result {
  week: WeekCommitsView | null;
  loading: boolean;
  error: string | null;
}

/** Start of the calendar week containing `asOf` (local midnight). */
function startOfWeek(asOf: Date, weekStartsOn: WeekStartsOn): Date {
  const d = new Date(asOf);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function emptyWeek(
  rangeStart: string,
  asOf: string,
  loading: boolean,
): WeekCommitsView {
  return {
    rangeStart,
    asOf,
    weekStartsOn: WEEK_STARTS_ON,
    commits: [],
    loading,
  };
}

async function fetchCommitDetail(
  owner: string,
  repo: string,
  sha: string,
): Promise<CommitView | null> {
  try {
    const res = await fetch(
      `/api/github/repo/${owner}/${repo}/commits/${sha}`,
    );
    if (!res.ok) return null;
    const detail: GitHubCommitDetailResponse = await res.json();
    const files: CommitFileChange[] = (detail.files ?? []).map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      previousPath: f.previous_filename,
    }));
    return {
      sha: detail.sha,
      message: detail.commit.message,
      author: {
        name: detail.commit.author?.name ?? detail.author?.login ?? 'Unknown',
        login: detail.author?.login,
        avatarUrl: detail.author?.avatar_url,
      },
      authoredAt: detail.commit.author?.date ?? new Date().toISOString(),
      parents: detail.parents?.map((p) => p.sha),
      stats: {
        filesChanged: files.length,
        additions: detail.stats?.additions ?? 0,
        deletions: detail.stats?.deletions ?? 0,
      },
      url: detail.html_url,
      files,
    };
  } catch {
    return null;
  }
}

/**
 * Derive the repo's file state at the start of the week by "undoing" this
 * week's commits from the current file tree.
 *
 * - Files added during the week didn't exist at the start → removed
 * - Files removed during the week existed at the start → added back
 * - Renamed files: previous path existed at the start
 * - Everything else in the current tree existed at the start → unchanged
 */
/** @internal exported for testing */
export function deriveBaseFiles(
  fileTree: FileTree,
  weekCommits: CommitView[],
): CommitFileChange[] {
  const basePaths = new Set(fileTree.allFiles.map((f) => f.path));

  // Walk commits (any order — we only care about adds/removes/renames)
  for (const commit of weekCommits) {
    for (const f of commit.files) {
      if (f.status === 'added') {
        // File was added this week — didn't exist at start
        basePaths.delete(f.path);
      } else if (f.status === 'removed') {
        // File was removed this week — existed at start
        basePaths.add(f.path);
      } else if (f.status === 'renamed' && f.previousPath) {
        // File was renamed — old path existed at start
        basePaths.delete(f.path);
        basePaths.add(f.previousPath);
      }
      // modified/changed/copied: file existed at start, keep as-is
    }
  }

  return Array.from(basePaths, (path) => ({
    path,
    status: 'unchanged' as const,
  }));
}

/**
 * Loads this calendar week's commits (so far) into a {@link WeekCommitsView}
 * for FileCityGuidePanel week mode.
 *
 * Immediately returns a `loading: true` payload so the panel header can show
 * fetch progress. Then lists commits with `since`/`until` and enriches each
 * with a detail call (for `files[]`). Capped at {@link MAX_COMMITS}.
 *
 * Pass `enabled: false` to idle (week = null).
 *
 * When `fileTree` is provided, derives `baseFiles` (the repo's file state at
 * the start of the week) so the playback timeline can show the full starting
 * city before any of this week's commits.
 */
export function useWeekCommits(
  owner: string,
  repo: string,
  enabled: boolean,
  fileTree?: FileTree | null,
): Result {
  const [state, setState] = useState<Result>({
    week: null,
    loading: false,
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState({ week: null, loading: false, error: null });
      return;
    }

    const id = ++reqId.current;
    const asOf = new Date();
    const rangeStart = startOfWeek(asOf, WEEK_STARTS_ON);
    const rangeStartIso = rangeStart.toISOString();
    const asOfIso = asOf.toISOString();

    // Enter week mode immediately with a loading payload (header progress).
    setState({
      week: emptyWeek(rangeStartIso, asOfIso, true),
      loading: true,
      error: null,
    });

    (async () => {
      try {
        // Paginate until we leave the week window or hit the cap.
        const listed: GitHubCommit[] = [];
        let page = 1;
        while (listed.length < MAX_COMMITS) {
          const remaining = MAX_COMMITS - listed.length;
          const perPage = Math.min(100, remaining);
          const res = await fetch(
            `/api/github/repo/${owner}/${repo}/commits?per_page=${perPage}&page=${page}` +
              `&since=${encodeURIComponent(rangeStartIso)}` +
              `&until=${encodeURIComponent(asOfIso)}`,
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              data.error || `Failed to load week commits (${res.status})`,
            );
          }
          const data = await res.json();
          const batch: GitHubCommit[] = data.commits || [];
          if (batch.length === 0) break;
          listed.push(...batch);
          if (batch.length < perPage) break;
          page += 1;
        }

        if (id !== reqId.current) return;

        // Detail-enrich with bounded concurrency.
        const commits: CommitView[] = [];
        for (let i = 0; i < listed.length; i += DETAIL_CONCURRENCY) {
          if (id !== reqId.current) return;
          const slice = listed.slice(i, i + DETAIL_CONCURRENCY);
          const enriched = await Promise.all(
            slice.map((c) => fetchCommitDetail(owner, repo, c.sha)),
          );
          for (const view of enriched) {
            if (view) commits.push(view);
          }
        }

        commits.sort(
          (a, b) =>
            new Date(b.authoredAt).getTime() - new Date(a.authoredAt).getTime(),
        );

        if (id !== reqId.current) return;
        setState({
          week: {
            rangeStart: rangeStartIso,
            asOf: asOfIso,
            weekStartsOn: WEEK_STARTS_ON,
            commits,
            loading: false,
            baseFiles:
              fileTree && commits.length > 0
                ? deriveBaseFiles(fileTree, commits)
                : undefined,
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (id !== reqId.current) return;
        setState({
          week: emptyWeek(rangeStartIso, asOfIso, false),
          loading: false,
          error:
            err instanceof Error ? err.message : 'Failed to load week commits',
        });
      }
    })();
  }, [owner, repo, enabled, fileTree]);

  return state;
}
