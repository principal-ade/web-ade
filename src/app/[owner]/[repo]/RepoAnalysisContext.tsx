'use client';

/**
 * Shares the Freestyle VM repo-analysis result across the repo page so both the
 * trigger control (RepoAnalysisButton) and the 3D city (RightPane) can read it.
 *
 * MVP convenience: the analysis is expensive (boots a VM, clones, blames), so
 * the result is cached in localStorage keyed by `{owner}/{repo}` and rehydrated
 * on mount. That lets us iterate on the contribution-coverage UI without
 * re-running the VM sweep on every reload. Clear it with `clear()` (or the
 * button's "↻ re-run") to force a fresh analysis.
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
  buildContributionLayers,
  totalLinesOwned,
  type ContributionAnalysis,
} from '@/lib/repo-analysis/contributionLayers';

/** What the POST /api/repo-analysis route returns (the fields we use). */
export interface RepoAnalysisPayload extends ContributionAnalysis {
  owner: string;
  repo: string;
  generatedAt: string;
  durationMs: number;
  authorCount: number;
  lineCounts: Record<string, number>;
  fileCount: number;
  totalLinesGlobal: number;
}

export type RepoAnalysisState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

interface RepoAnalysisContextValue {
  analysis: RepoAnalysisPayload | null;
  state: RepoAnalysisState;
  /** Run the VM sweep (or no-op if already running); caches the result. */
  run: () => Promise<void>;
  /** Drop the cached result and clear the selection. */
  clear: () => void;
  /** Currently highlighted contributor email (lowercased), or null. */
  selectedEmail: string | null;
  setSelectedEmail: (email: string | null) => void;
  /** Contributors sorted by lines owned (desc), with a per-author line total. */
  contributors: Array<{ name: string; email: string; commits: number; lines: number }>;
  /** Highlight layers for the selected contributor, or null when none picked. */
  contributionLayers: HighlightLayer[] | null;
}

const RepoAnalysisContext = createContext<RepoAnalysisContextValue | null>(null);

function storageKey(owner: string, repo: string): string {
  return `repo-analysis:${owner}/${repo}`;
}

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
  const [selectedEmail, setSelectedEmailRaw] = useState<string | null>(null);

  // Rehydrate from localStorage on mount / when the repo changes.
  useEffect(() => {
    setSelectedEmailRaw(null);
    try {
      const raw = localStorage.getItem(storageKey(owner, repo));
      if (raw) {
        setAnalysis(JSON.parse(raw) as RepoAnalysisPayload);
        setState({ kind: 'done' });
        return;
      }
    } catch {
      /* ignore malformed cache */
    }
    setAnalysis(null);
    setState({ kind: 'idle' });
  }, [owner, repo]);

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
      setState({ kind: 'done' });
      try {
        localStorage.setItem(storageKey(owner, repo), JSON.stringify(payload));
      } catch {
        /* quota / serialization — keep the in-memory copy regardless */
      }
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [owner, repo]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(owner, repo));
    } catch {
      /* ignore */
    }
    setAnalysis(null);
    setSelectedEmailRaw(null);
    setState({ kind: 'idle' });
  }, [owner, repo]);

  const setSelectedEmail = useCallback((email: string | null) => {
    setSelectedEmailRaw(email ? email.toLowerCase() : null);
  }, []);

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

  const contributionLayers = useMemo(() => {
    if (!analysis || !selectedEmail) return null;
    const layers = buildContributionLayers(analysis, selectedEmail);
    return layers.length > 0 ? layers : null;
  }, [analysis, selectedEmail]);

  const value = useMemo<RepoAnalysisContextValue>(
    () => ({
      analysis,
      state,
      run,
      clear,
      selectedEmail,
      setSelectedEmail,
      contributors,
      contributionLayers,
    }),
    [analysis, state, run, clear, selectedEmail, setSelectedEmail, contributors, contributionLayers],
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
