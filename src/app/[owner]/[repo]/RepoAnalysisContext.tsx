'use client';

/**
 * Shares the Freestyle VM repo-analysis result across the repo page so both the
 * status block (RepoAnalysisStatus) and the 3D city (RightPane) can read it.
 *
 * Stale-while-revalidate: on mount we GET the S3-cached analysis (shared across
 * users/devices) and paint it, then read the server's `stale` flag (the cache's
 * commit `sha` vs the repo's current HEAD). When stale, we POST a refresh in the
 * background while keeping the old data on screen, so the view never blanks for a
 * repo that's been analyzed before. The shared S3 cache is the single source of
 * truth — there is no client-side localStorage copy.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { HighlightLayer } from '@industry-theme/file-city-panel';
import {
  buildMergedContributionLayers,
  totalLinesOwned,
  type ContributionAnalysis,
} from '@/lib/repo-analysis/contributionLayers';

/** What the repo-analysis route returns (the fields we use). GET and POST share
 *  the analysis fields; GET adds `cached`/`stale`/`currentSha`, POST adds
 *  `durationMs`. */
export interface RepoAnalysisPayload extends ContributionAnalysis {
  owner: string;
  repo: string;
  generatedAt: string;
  durationMs?: number;
  authorCount: number;
  lineCounts: Record<string, number>;
  fileCount: number;
  totalLinesGlobal: number;
  /** Commit the analysis was computed at (cache freshness key). */
  sha?: string | null;
}

export type RepoAnalysisState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/** Server-reported freshness for the status block: does a warm VM exist, what
 *  commit was last analyzed, and is it behind the repo's current HEAD. */
export interface RepoAnalysisMeta {
  hasWarmVm: boolean;
  /** Last analyzed commit (the cached `sha`), or null if never analyzed. */
  sha: string | null;
  /** Repo's current HEAD, or null if it couldn't be resolved. */
  currentSha: string | null;
  /** `sha !== currentSha` — a refresh is due. */
  stale: boolean;
}

interface RepoAnalysisContextValue {
  analysis: RepoAnalysisPayload | null;
  state: RepoAnalysisState;
  /** Warm-VM / last-commit / staleness for the status block; null until the
   *  mount GET resolves. */
  meta: RepoAnalysisMeta | null;
  /** Run the VM sweep (or no-op if already running); caches the result. */
  run: () => Promise<void>;
  /** Drop the cached result and clear the selection. */
  clear: () => void;
  /** Representative highlighted email (first of the selected person's emails),
   *  or null — kept for single-email callers. */
  selectedEmail: string | null;
  setSelectedEmail: (email: string | null) => void;
  /** All blame emails of the highlighted person (a merged identity owns several);
   *  the highlight is the union of files across them. */
  selectedEmails: string[];
  setSelectedEmails: (emails: string[] | null) => void;
  /** Contributors sorted by lines owned (desc), with a per-author line total. */
  contributors: Array<{ name: string; email: string; commits: number; lines: number }>;
  /** Highlight layers for the selected contributor, or null when none picked. */
  contributionLayers: HighlightLayer[] | null;
}

const RepoAnalysisContext = createContext<RepoAnalysisContextValue | null>(null);

export function RepoAnalysisProvider({
  owner,
  repo,
  children,
}: {
  owner: string;
  repo: string;
  children: ReactNode;
}) {
  const [analysis, setAnalysis] = useState<RepoAnalysisPayload | null>(null);
  const [state, setState] = useState<RepoAnalysisState>({ kind: 'idle' });
  const [meta, setMeta] = useState<RepoAnalysisMeta | null>(null);
  const [selectedEmails, setSelectedEmailsRaw] = useState<string[]>([]);

  // POST a refresh: runs the VM sweep, overwrites the server cache, and swaps in
  // the fresh result. Keeps the existing `analysis` on screen while it runs, so
  // a stale-revalidate never blanks the view.
  const run = useCallback(async () => {
    setState({ kind: 'running' });
    try {
      const res = await fetch(`/api/repo-analysis/${owner}/${repo}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const payload = data as RepoAnalysisPayload;
      setAnalysis(payload);
      // Just analyzed HEAD — warm VM now exists, cache is fresh.
      setMeta({
        hasWarmVm: true,
        sha: payload.sha ?? null,
        currentSha: payload.sha ?? null,
        stale: false,
      });
      setState({ kind: 'done' });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [owner, repo]);

  // On mount / repo change: read the shared server cache (GET) and paint it,
  // then kick off a background refresh when the server reports it stale.
  useEffect(() => {
    setSelectedEmailsRaw([]);
    setAnalysis(null);
    setMeta(null);
    setState({ kind: 'idle' });
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/repo-analysis/${owner}/${repo}`);
        if (cancelled) return;
        const data = await res.json();
        if (cancelled || !res.ok) return;
        // Freshness for the status block — set whether or not a cache exists.
        setMeta({
          hasWarmVm: Boolean(data.hasWarmVm),
          sha: data.cached ? (data.sha ?? null) : null,
          currentSha: data.currentSha ?? null,
          stale: Boolean(data.stale),
        });
        if (data.cached) {
          setAnalysis(data as RepoAnalysisPayload);
          setState({ kind: 'done' });
          // HEAD moved since the cache was computed — refresh behind the scenes.
          if (data.stale) void run();
        }
        // No server cache — the first analysis stays opt-in (idle).
      } catch {
        /* offline / transient — stay idle, the user can trigger a run */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [owner, repo, run]);

  const clear = useCallback(() => {
    setAnalysis(null);
    setMeta(null);
    setSelectedEmailsRaw([]);
    setState({ kind: 'idle' });
  }, []);

  const setSelectedEmails = useCallback((emails: string[] | null) => {
    setSelectedEmailsRaw(
      emails ? emails.map((e) => e.toLowerCase()) : [],
    );
  }, []);
  const setSelectedEmail = useCallback(
    (email: string | null) => setSelectedEmails(email ? [email] : null),
    [setSelectedEmails],
  );
  const selectedEmail = selectedEmails[0] ?? null;

  const contributors = useMemo(() => {
    if (!analysis) return [];
    // Drive the list off `contributors` (has names) but show blame-line totals.
    return analysis.contributors
      .map((c) => ({
        name: c.name,
        email: c.email,
        commits: c.commits,
        lines: totalLinesOwned(analysis, c.email),
      }))
      .sort((a, b) => b.lines - a.lines);
  }, [analysis]);

  const selectedEmailsKey = selectedEmails.join(',');
  const contributionLayers = useMemo(() => {
    if (!analysis || selectedEmails.length === 0) return null;
    const layers = buildMergedContributionLayers(analysis, selectedEmails);
    return layers.length > 0 ? layers : null;
    // selectedEmailsKey stands in for the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, selectedEmailsKey]);

  const value = useMemo<RepoAnalysisContextValue>(
    () => ({
      analysis,
      state,
      meta,
      run,
      clear,
      selectedEmail,
      setSelectedEmail,
      selectedEmails,
      setSelectedEmails,
      contributors,
      contributionLayers,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis, state, meta, run, clear, selectedEmail, setSelectedEmail, selectedEmailsKey, setSelectedEmails, contributors, contributionLayers],
  );

  return (
    <RepoAnalysisContext.Provider value={value}>
      {children}
    </RepoAnalysisContext.Provider>
  );
}

export function useRepoAnalysis(): RepoAnalysisContextValue {
  const ctx = useContext(RepoAnalysisContext);
  if (!ctx) {
    throw new Error('useRepoAnalysis must be used within a RepoAnalysisProvider');
  }
  return ctx;
}
