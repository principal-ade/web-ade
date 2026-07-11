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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { HighlightLayer } from '@industry-theme/file-city-panel';
// Type-only: erased at build, so the AWS SDK in s3-cache never enters this bundle.
import type { RepoAnalysisErrorRecord } from '@/lib/repo-analysis/s3-cache';
// Type-only: erased at build, so the Redis client in identity-cache never enters
// this bundle.
import type { IdentityByEmail } from '@/lib/repo-analysis/identity-cache';
import {
  buildMergedContributionLayers,
  type ContributionAnalysis,
} from '@/lib/repo-analysis/contributionLayers';

/** What the slim repo-analysis GET returns (the fields we use). Heavy maps
 *  (byEmail, personOwnership, lineCounts, totalLines, shortlog contributors)
 *  are omitted; ownership and the full contributor list are paged separately. */
export interface RepoAnalysisPayload extends ContributionAnalysis {
  owner: string;
  repo: string;
  generatedAt: string;
  durationMs?: number;
  authorCount: number;
  /**
   * Per-file newline counts for building heights. Omitted from the slim GET
   * (deferred endpoint); when absent the city stays flat for heights.
   */
  lineCounts?: Record<string, number>;
  fileCount: number;
  totalLinesGlobal: number;
  /** True when more precomputedContributors exist beyond the inline head. */
  contributorsTruncated?: boolean;
  /** Cursor for GET .../contributors when truncated; null when complete. */
  contributorsNextCursor?: number | null;
  /** Server still holds per-file lineCounts in S3 (heights fetch later). */
  lineCountsAvailable?: boolean;
  /** Commit the analysis was computed at (cache freshness key). */
  sha?: string | null;
  /** Pre-resolved blame-email → GitHub account overlay (lowercased keys), embedded
   *  by the GET route so the contributor list draws avatars/logins with no client
   *  round-trip. Empty until a repo's first visit warms it. */
  identityByEmail?: IdentityByEmail;
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
  /** The last persisted analysis failure for this repo, or null if the most
   *  recent run succeeded (failures are cleared on success). */
  lastError: RepoAnalysisErrorRecord | null;
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
  /** True while the paginated /ownership fetch is in flight. */
  ownershipLoading: boolean;
  /** True while the remainder of precomputedContributors is paging in. */
  contributorsLoading: boolean;
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
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [contributorsLoading, setContributorsLoading] = useState(false);

  // Mirror the latest analysis/meta into refs so `run`'s poll loop can read them
  // without widening `run`'s deps (which would re-fire the mount effect on every
  // update). Assigning during render is intentional — refs aren't reactive.
  const analysisRef = useRef(analysis);
  const metaRef = useRef(meta);
  analysisRef.current = analysis;
  metaRef.current = meta;
  // Bumped on every owner/repo change; an in-flight poll loop bails the moment
  // it sees its captured epoch go stale.
  const epochRef = useRef(0);
  // Accumulated person-key → file → lines ownership, eagerly fetched from the
  // paginated /ownership endpoint. Populated via a background page-through
  // (runs once after analysis loads) and read by the contributionLayers memo
  // to build highlight layers on hover.
  const personOwnershipRef = useRef<Record<string, Record<string, number>>>({});

  const applyResult = useCallback((payload: RepoAnalysisPayload) => {
    setAnalysis(payload);
    // Just analyzed HEAD — warm VM now exists, cache is fresh.
    setMeta({
      hasWarmVm: true,
      sha: payload.sha ?? null,
      currentSha: payload.sha ?? null,
      stale: false,
      lastError: null,
    });
    setState({ kind: 'done' });
  }, []);

  // Poll the shared cache until THIS run lands a fresh result, records a failure,
  // or we hit the deadline (a platform-killed run writes neither and must not
  // spin the UI forever). Baselines distinguish "produced by this run" from
  // whatever was already on screen: a rebuild of the same commit keeps `sha` but
  // always bumps `generatedAt`, so completion keys off `generatedAt`; the server
  // clears any prior error at launch, so an error with a NEW `failedAt` is ours.
  // Shared by `run` (after firing the POST) and the mount effect (resuming a run
  // that was already in flight when the page loaded).
  const pollUntilComplete = useCallback(
    async (baselineGeneratedAt: string | null, baselineErrorAt: string | null) => {
      const myEpoch = epochRef.current;
      // Sized for a large repo's cold clone + full blame sweep (e.g. opencode
      // ≈ 11 min); matches the server's `inProgress` window.
      const DEADLINE_MS = 15 * 60 * 1000;
      const INTERVAL_MS = 4000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < DEADLINE_MS) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
        if (epochRef.current !== myEpoch) return; // repo changed out from under us
        let data: {
          cached?: boolean;
          generatedAt?: string;
          sha?: string | null;
          currentSha?: string | null;
          stale?: boolean;
          hasWarmVm?: boolean;
          lastError?: RepoAnalysisMeta['lastError'];
        };
        try {
          const res = await fetch(`/api/repo-analysis/${owner}/${repo}`);
          if (!res.ok) continue; // transient (e.g. a momentary 5xx) — keep polling
          data = await res.json();
        } catch {
          continue; // transient network blip — keep polling
        }
        if (epochRef.current !== myEpoch) return;

        if (data.lastError && data.lastError.failedAt !== baselineErrorAt) {
          setMeta({
            hasWarmVm: Boolean(data.hasWarmVm),
            sha: data.cached ? (data.sha ?? null) : null,
            currentSha: data.currentSha ?? null,
            stale: Boolean(data.stale),
            lastError: data.lastError,
          });
          setState({ kind: 'error', message: data.lastError.message || 'Analysis failed' });
          return;
        }
        if (data.cached && data.generatedAt && data.generatedAt !== baselineGeneratedAt) {
          applyResult(data as RepoAnalysisPayload);
          return;
        }
      }

      if (epochRef.current !== myEpoch) return;
      setState({
        kind: 'error',
        message:
          'Analysis is taking longer than expected. It may still be running — refresh in a minute.',
      });
    },
    [owner, repo, applyResult]
  );

  // Kick off a refresh and reflect its outcome, WITHOUT depending on the POST's
  // response body. The POST returns 202 the moment the VM job is launched (and
  // the gateway can cut the connection regardless), so the result arrives via the
  // shared cache, not this response. Treat a 200 payload as a fast-path; for a
  // 202 / empty body, poll the cache.
  const run = useCallback(async () => {
    // Baselines captured BEFORE the optimistic clear.
    const baselineGeneratedAt = analysisRef.current?.generatedAt ?? null;
    const baselineErrorAt = metaRef.current?.lastError?.failedAt ?? null;

    // Optimistically clear the displayed error so a prior failure doesn't linger
    // under the spinner; the server clears the persisted breadcrumb in parallel.
    setMeta((m) => (m ? { ...m, lastError: null } : m));
    setState({ kind: 'running' });

    try {
      const res = await fetch(`/api/repo-analysis/${owner}/${repo}`, {
        method: 'POST',
      });
      const text = await res.text();
      if (res.status === 200 && text) {
        // Fast path: a completed analysis returned inline. (The normal path is a
        // 202 "started" — the VM publishes to the cache and we poll for it below.)
        applyResult(JSON.parse(text) as RepoAnalysisPayload);
        return;
      }
      if (!res.ok && text) {
        // A real, non-empty error body (e.g. a 502 launch failure) is terminal —
        // polling won't change it.
        let message = `HTTP ${res.status}`;
        try {
          message = (JSON.parse(text) as { error?: string }).error ?? message;
        } catch {
          /* non-JSON error body — keep the HTTP status message */
        }
        setState({ kind: 'error', message });
        return;
      }
      // 202 / empty body → the job is running on the VM; fall through to polling.
    } catch {
      // Network error / abort → the run may still be completing; fall through.
    }

    await pollUntilComplete(baselineGeneratedAt, baselineErrorAt);
  }, [owner, repo, applyResult, pollUntilComplete]);

  // On mount / repo change: read the shared server cache (GET) and paint it,
  // then kick off a background refresh when the server reports it stale.
  useEffect(() => {
    // Invalidate any poll loop still running for the previous repo.
    epochRef.current += 1;
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
          lastError: data.lastError ?? null,
        });
        if (data.cached) {
          setAnalysis(data as RepoAnalysisPayload);
          setState({ kind: 'done' });
        }
        if (data.inProgress) {
          // A run (started here on an earlier visit, or by someone else) is still
          // publishing — attach to it by polling, instead of going idle or firing
          // a duplicate. Baselines = whatever we just painted, so the poll resolves
          // when the in-flight run lands something newer.
          setState({ kind: 'running' });
          void pollUntilComplete(
            data.cached ? (data.generatedAt ?? null) : null,
            data.lastError?.failedAt ?? null
          );
        } else if (!data.lastError && (!data.cached || data.stale)) {
          // Auto-build on load: either this repo has never been analyzed, or its
          // cached result is behind HEAD. Kick off a run in the background so the
          // page populates without a manual button press; any cached data we just
          // painted stays on screen meanwhile.
          //
          // We skip this when the last run for this repo is on record as FAILED —
          // a repo whose clone/blame errors (e.g. a Freestyle import failure) must
          // not re-trigger an expensive VM run on every single visit. The panel's
          // button is still there for a manual retry.
          void run();
        }
        // Cached + up to date (or a recorded failure) — nothing to launch.
      } catch {
        /* offline / transient — stay idle, the user can trigger a run */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [owner, repo, run, pollUntilComplete]);

  // Eagerly page through /ownership to hydrate highlight layers.
  // Runs once after analysis loads; accumulates into personOwnershipRef.
  useEffect(() => {
    if (!analysis) return;
    // If analysis already carries personOwnership (e.g. pre-transform),
    // seed the ref and skip the fetch.
    if (analysis.personOwnership) {
      personOwnershipRef.current = analysis.personOwnership;
      return;
    }
    let cancelled = false;
    setOwnershipLoading(true);
    const fetchOwnership = async () => {
      let cursor = 0;
      // Keep pages small: on mega-repos (linux) top owners have huge path maps;
      // limit=200 returns ~413 from Amplify (~6 MB ceiling). limit=50 stays ~3.5 MB.
      const limit = 50;
      while (!cancelled) {
        try {
          const res = await fetch(
            `/api/repo-analysis/${owner}/${repo}/ownership?cursor=${cursor}&limit=${limit}`,
          );
          if (!res.ok) break;
          const data = await res.json();
          if (cancelled) break;
          for (const entry of data.page ?? []) {
            personOwnershipRef.current[entry.key] = entry.ownership;
          }
          if (data.nextCursor == null) break;
          cursor = data.nextCursor;
        } catch {
          break;
        }
      }
      if (!cancelled) setOwnershipLoading(false);
    };
    void fetchOwnership();
    return () => {
      cancelled = true;
      setOwnershipLoading(false);
    };
  }, [owner, repo, analysis?.sha]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page the remainder of precomputedContributors when the main GET only
  // shipped a head (contributorsTruncated). About avatars use the head;
  // Contributors pane grows as pages land. Keyed only on sha so partial
  // merges don't re-enter the loop.
  useEffect(() => {
    if (!analysis?.contributorsTruncated || !analysis.sha) {
      setContributorsLoading(false);
      return;
    }
    const analysisSha = analysis.sha;
    let cursor = analysis.contributorsNextCursor ?? analysis.precomputedContributors?.length ?? 0;
    const seen = new Set((analysis.precomputedContributors ?? []).map((c) => c.key));
    let cancelled = false;
    setContributorsLoading(true);
    const fetchContributors = async () => {
      const limit = 500;
      while (!cancelled) {
        try {
          const res = await fetch(
            `/api/repo-analysis/${owner}/${repo}/contributors?cursor=${cursor}&limit=${limit}`,
          );
          if (!res.ok) break;
          const data = (await res.json()) as {
            page?: NonNullable<RepoAnalysisPayload['precomputedContributors']>;
            nextCursor?: number | null;
          };
          if (cancelled) break;
          const page = data.page ?? [];
          if (page.length > 0) {
            setAnalysis((prev) => {
              if (!prev || prev.sha !== analysisSha) return prev;
              const merged = [...(prev.precomputedContributors ?? [])];
              for (const row of page) {
                if (seen.has(row.key)) continue;
                seen.add(row.key);
                merged.push(row);
              }
              return {
                ...prev,
                precomputedContributors: merged,
                contributorsTruncated: data.nextCursor != null,
                contributorsNextCursor: data.nextCursor ?? null,
              };
            });
          }
          if (data.nextCursor == null) break;
          cursor = data.nextCursor;
        } catch {
          break;
        }
      }
      if (!cancelled) setContributorsLoading(false);
    };
    void fetchContributors();
    return () => {
      cancelled = true;
      setContributorsLoading(false);
    };
    // Re-page when the cache generation changes (new sweep) or repo changes —
    // not on each partial merge of pages into analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, analysis?.sha, analysis?.generatedAt]);

  const clear = useCallback(() => {
    setAnalysis(null);
    setMeta(null);
    setSelectedEmailsRaw([]);
    setState({ kind: 'idle' });
    setOwnershipLoading(false);
    setContributorsLoading(false);
    personOwnershipRef.current = {};
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
    // Prefer precomputed (person-merged + stats). Shortlog is no longer on the
    // slim GET wire.
    if (analysis.precomputedContributors?.length) {
      return analysis.precomputedContributors.map((pc) => ({
        name: pc.name,
        email: pc.emails[0] ?? pc.key,
        commits: pc.commits,
        lines: pc.stats.lines,
      }));
    }
    return (analysis.contributors ?? []).map((c) => ({
      name: c.name,
      email: c.email,
      commits: c.commits,
      lines: 0,
    }));
  }, [analysis]);

  const selectedEmailsKey = selectedEmails.join(',');
  const contributionLayers = useMemo(() => {
    if (!analysis || selectedEmails.length === 0) return null;
    // Hydrate with eagerly-loaded personOwnership so highlight layers
    // resolve even though the main API response strips it for payload size.
    // totalLines is also stripped — layer builder falls back to absolute intensity.
    const hydrated = Object.keys(personOwnershipRef.current).length > 0
      ? { ...analysis, personOwnership: personOwnershipRef.current }
      : analysis;
    const layers = buildMergedContributionLayers(hydrated, selectedEmails);
    return layers.length > 0 ? layers : null;
    // selectedEmailsKey stands in for the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, selectedEmailsKey, ownershipLoading]);

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
      ownershipLoading,
      contributorsLoading,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis, state, meta, run, clear, selectedEmail, setSelectedEmail, selectedEmailsKey, setSelectedEmails, contributors, contributionLayers, ownershipLoading, contributorsLoading],
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
