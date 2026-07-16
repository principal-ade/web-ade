'use client';

/**
 * `/status` — an unlinked ops page for the line-count / contributor-coverage jobs
 * (the Freestyle-VM "repo analysis" runs). Polls `GET /api/repo-analysis/status`
 * and groups every repo into In progress · Stalled · Failed · Recently done, so a
 * run that's mid-flight — or one that failed and why — is visible in one place
 * without opening each repo. Failed/stalled rows carry a Rebuild button that
 * re-POSTs the per-repo analysis endpoint.
 *
 * Read-only aggregation over data the run path already writes to S3; no new job
 * state is stored (see src/lib/repo-analysis/s3-cache.ts → listRepoAnalysisJobs).
 */
import { useTheme } from '@principal-ade/industry-theme';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gauge,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Job {
  owner: string;
  repo: string;
  status: 'inProgress' | 'stalled' | 'failed' | 'done';
  launchedAt: string | null;
  vmId: string | null;
  generatedAt: string | null;
  sha: string | null;
  error: { stage: string; message: string; failedAt: string } | null;
}

/** A repo's recent GitHub rate-limit pressure (from the trails access path).
 *  `scope` is whether the throttled call used the shared anonymous budget or a
 *  user token; `count` accumulates across hits since `firstHitAt`. */
interface RateLimitRecord {
  owner: string;
  repo: string;
  scope: 'anon' | 'user';
  source: string;
  requestPath?: string;
  count: number;
  firstHitAt: string;
  lastHitAt: string;
}

/** The status tabs — the four job buckets share a shape; rate-limit hits don't. */
type TabKey = Job['status'] | 'rateLimited';

interface StatusResponse {
  generatedAt: string;
  tokenQuota: {
    remaining: number;
    limit: number;
    resetEpochSeconds: number;
  } | null;
  counts: {
    inProgress: number;
    stalled: number;
    failed: number;
    done: number;
    rateLimited: number;
  };
  inProgress: Job[];
  stalled: Job[];
  failed: Job[];
  done: Job[];
  rateLimited: RateLimitRecord[];
}

const POLL_MS = 5000;

/** Compact "3m ago" / "2h ago" relative time; absolute on hover via `title`. */
function ago(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Most-recent-activity time for a row, for sorting a merged (failed+stalled)
 *  list so the freshest problem sits on top regardless of which bucket it's in. */
function rowActivity(job: Job): number {
  return Math.max(
    job.error?.failedAt ? Date.parse(job.error.failedAt) : 0,
    job.generatedAt ? Date.parse(job.generatedAt) : 0,
    job.launchedAt ? Date.parse(job.launchedAt) : 0
  );
}

interface TokenQuotaSummary {
  remaining: number;
  limit: number;
  resetEpochSeconds: number;
}

/** The GITHUB_TOKEN quota card: remaining/limit with a bar, and a "resets in
 *  ~Xm" countdown to the next budget refill. GitHub's core rest budget
 *  refills continuously (not all at once), so this is a snapshot, not a hard
 *  deadline — copy reflects that. */
function TokenQuotaCard({ quota }: { quota: TokenQuotaSummary }) {
  const { theme } = useTheme();
  const pct = quota.limit > 0 ? (quota.remaining / quota.limit) * 100 : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const resetInMs = Math.max(0, quota.resetEpochSeconds * 1000 - now);
  const resetInMin = Math.ceil(resetInMs / 60000);
  const resetLabel =
    resetInMs <= 0 ? 'now' : resetInMin < 60 ? `${resetInMin}m` : `${Math.floor(resetInMin / 60)}h ${resetInMin % 60}m`;

  // Green when comfortable, amber when quarter-full, red below ~10%.
  const barColor = pct > 25 ? '#3fb950' : pct > 10 ? '#d29922' : '#f85149';
  return (
    <div
      className="shrink-0 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: theme.colors.border,
        background: `color-mix(in srgb, ${theme.colors.text} 3%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge size={14} style={{ color: barColor }} />
          <span className="text-sm font-semibold" style={{ color: theme.colors.text }}>
            GitHub token quota
          </span>
        </div>
        <span className="text-xs font-mono" style={{ color: theme.colors.textSecondary }}>
          {quota.remaining.toLocaleString()} / {quota.limit.toLocaleString()}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: `color-mix(in srgb, ${theme.colors.text} 8%, transparent)` }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <p
        className="m-0 mt-1.5 text-xs"
        style={{ color: theme.colors.textMuted }}
        title={new Date(quota.resetEpochSeconds * 1000).toLocaleString()}
      >
        Resets in ~{resetLabel} (refreshes continuously).
      </p>
    </div>
  );
}

export default function RepoAnalysisStatusPage() {
  const { theme } = useTheme();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabKey>('inProgress');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/repo-analysis/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const rebuild = useCallback(
    async (owner: string, repo: string) => {
      const id = `${owner}/${repo}`;
      setRebuilding((r) => ({ ...r, [id]: true }));
      try {
        await fetch(`/api/repo-analysis/${owner}/${repo}`, { method: 'POST' });
        await load();
      } finally {
        // A launched run moves the row to In progress on the next poll; clear the
        // local flag so the button isn't stuck if the row lingers a beat.
        setTimeout(() => setRebuilding((r) => ({ ...r, [id]: false })), 1500);
      }
    },
    [load]
  );

  const card: React.CSSProperties = {
    borderColor: theme.colors.border,
    background: `color-mix(in srgb, ${theme.colors.text} 3%, transparent)`,
  };

  // Per-status label/color/icon — the source of truth for a row's accent, so a
  // merged tab (failed + stalled) can still tell each row apart by its own status.
  const STATUS_META: Record<Job['status'], { label: string; color: string; icon: React.ReactNode }> = {
    inProgress: { label: 'In progress', color: theme.colors.primary, icon: <Loader2 size={11} className="animate-spin" /> },
    failed: { label: 'Failed', color: '#f85149', icon: <XCircle size={11} /> },
    stalled: { label: 'Stalled', color: '#d29922', icon: <AlertTriangle size={11} /> },
    done: { label: 'Done', color: '#3fb950', icon: <CheckCircle2 size={11} /> },
  };

  function JobList({ jobs, emptyLabel }: { jobs: Job[]; emptyLabel: string }) {
    return (
      <section className="flex flex-col gap-2">
        {jobs.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm" style={{ color: theme.colors.textMuted }}>
            {emptyLabel}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {jobs.map((job) => {
              const id = `${job.owner}/${job.repo}`;
              const meta = STATUS_META[job.status];
              const needsAttention = job.status === 'failed' || job.status === 'stalled';
              const ts =
                job.status === 'failed'
                  ? (job.error?.failedAt ?? null)
                  : job.status === 'done'
                    ? job.generatedAt
                    : job.launchedAt;
              return (
                <li
                  key={id}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  style={card}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/${job.owner}/${job.repo}`}
                        target="_blank"
                        className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                        style={{ color: theme.colors.text }}
                      >
                        <span className="truncate">
                          {job.owner}/{job.repo}
                        </span>
                        <ExternalLink size={12} className="shrink-0" style={{ color: theme.colors.textMuted }} />
                      </Link>
                      {/* Per-row status pill — the only cue distinguishing failed
                          from stalled now that they share one tab. */}
                      {needsAttention && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            color: meta.color,
                            background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                          }}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {job.status === 'done' && job.sha && (
                        <code
                          className="rounded px-1.5 py-0.5 text-xs"
                          style={{
                            color: theme.colors.textSecondary,
                            background: `color-mix(in srgb, ${theme.colors.text} 7%, transparent)`,
                          }}
                        >
                          {job.sha.slice(0, 7)}
                        </code>
                      )}
                      <span
                        className="whitespace-nowrap text-xs"
                        style={{ color: theme.colors.textMuted }}
                        title={ts ?? undefined}
                      >
                        {ago(ts)}
                      </span>
                      {needsAttention && (
                        <button
                          type="button"
                          onClick={() => rebuild(job.owner, job.repo)}
                          disabled={rebuilding[id]}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ background: theme.colors.primary, color: '#fff' }}
                        >
                          <RefreshCw size={11} />
                          {rebuilding[id] ? 'Starting…' : 'Rebuild'}
                        </button>
                      )}
                    </div>
                  </div>

                  {job.status === 'failed' && job.error && (
                    <div
                      className="rounded-md border px-2.5 py-2 text-xs"
                      style={{
                        borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
                        background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
                        color: theme.colors.textSecondary,
                      }}
                    >
                      <span className="font-semibold" style={{ color: meta.color }}>
                        {job.error.stage}
                      </span>
                      {': '}
                      <span style={{ wordBreak: 'break-word' }}>{job.error.message}</span>
                    </div>
                  )}

                  {job.status === 'stalled' && (
                    <p className="m-0 text-xs" style={{ color: theme.colors.textMuted }}>
                      Launched {ago(job.launchedAt)} and never published a result — the
                      VM likely died mid-sweep. No error was recorded.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  const RATE_LIMIT_COLOR = '#db6d28';

  function RateLimitList({
    records,
    emptyLabel,
  }: {
    records: RateLimitRecord[];
    emptyLabel: string;
  }) {
    return (
      <section className="flex flex-col gap-2">
        {records.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm" style={{ color: theme.colors.textMuted }}>
            {emptyLabel}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {records.map((r) => {
              const id = `${r.owner}/${r.repo}`;
              const scopeLabel = r.scope === 'user' ? 'User token' : 'Anonymous';
              const sourceLabel = r.source === 'page-load' ? 'Page' : r.source === 'api-bot' ? 'Bot' : r.source;
              const sourceColor = r.source === 'page-load' ? '#3fb950' : r.source === 'api-bot' ? '#d29922' : '#8b949e';
              return (
                <li key={id} className="flex flex-col gap-2 rounded-lg border p-3" style={card}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/${r.owner}/${r.repo}`}
                        target="_blank"
                        className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                        style={{ color: theme.colors.text }}
                      >
                        <span className="truncate">
                          {r.owner}/{r.repo}
                        </span>
                        <ExternalLink size={12} className="shrink-0" style={{ color: theme.colors.textMuted }} />
                      </Link>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          color: RATE_LIMIT_COLOR,
                          background: `color-mix(in srgb, ${RATE_LIMIT_COLOR} 15%, transparent)`,
                        }}
                      >
                        {scopeLabel}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          color: sourceColor,
                          background: `color-mix(in srgb, ${sourceColor} 15%, transparent)`,
                        }}
                      >
                        {sourceLabel}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-semibold"
                        style={{
                          color: theme.colors.textSecondary,
                          background: `color-mix(in srgb, ${theme.colors.text} 7%, transparent)`,
                        }}
                        title={`${r.count} rate-limit hit${r.count === 1 ? '' : 's'} since ${r.firstHitAt}`}
                      >
                        ×{r.count}
                      </span>
                      <span
                        className="whitespace-nowrap text-xs"
                        style={{ color: theme.colors.textMuted }}
                        title={r.lastHitAt}
                      >
                        {ago(r.lastHitAt)}
                      </span>
                    </div>
                  </div>
                  {r.requestPath && (
                    <code
                      className="text-xs block mb-1 px-2 py-1 rounded"
                      style={{
                        color: theme.colors.textSecondary,
                        background: `color-mix(in srgb, ${theme.colors.text} 5%, transparent)`,
                        fontFamily: 'monospace',
                      }}
                    >
                      {r.requestPath}
                    </code>
                  )}
                  <p className="m-0 text-xs" style={{ color: theme.colors.textMuted }}>
                    GitHub throttled the {scopeLabel.toLowerCase()} request budget — visitors saw a
                    retry page, not a private-repo wall.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div
      className="h-viewport-fixed w-full overflow-hidden"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col gap-4 px-5 py-8">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-xl font-bold">Repo analysis jobs</h1>
            <p className="m-0 text-sm" style={{ color: theme.colors.textMuted }}>
              Line-count / contributor-coverage runs on Freestyle VMs.
              {data && (
                <>
                  {' '}Updated {ago(data.generatedAt)}.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-opacity hover:opacity-80"
            style={{ borderColor: theme.colors.border, color: theme.colors.textSecondary }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </header>

        {loading && !data && (
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: theme.colors.textMuted }}
          >
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <div
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, #f85149 40%, transparent)',
              background: 'color-mix(in srgb, #f85149 10%, transparent)',
              color: '#f0a0a0',
            }}
          >
                        Couldn&apos;t load status: {error}
          </div>
        )}

        {/* GitHub token budget — the GITHUB_TOKEN the repo-analysis VM runs
            draw on. Hidden when the probe failed or no token is configured, so
            the jobs view is still useful without it. */}
        {data?.tokenQuota && <TokenQuotaCard quota={data.tokenQuota} />}

        {data &&
          (() => {
            // Failed (hard error) and stalled (silent — launched, never published)
            // are both "this run needs a human", so they share one tab; each row's
            // pill still says which it is. Merge and re-sort so the freshest
            // problem leads regardless of bucket.
            const attention = [...data.failed, ...data.stalled].sort(
              (a, b) => rowActivity(b) - rowActivity(a)
            );
            const tabs = [
              {
                key: 'inProgress' as const,
                title: 'In progress',
                icon: <Loader2 size={15} className="animate-spin" />,
                color: theme.colors.primary,
                count: data.inProgress.length,
                jobs: data.inProgress,
                empty: 'No runs in progress.',
              },
              {
                key: 'failed' as const,
                title: 'Failed',
                icon: <XCircle size={15} />,
                color: '#f85149',
                count: attention.length,
                jobs: attention,
                empty: 'Nothing needs attention.',
              },
              {
                key: 'rateLimited' as const,
                title: 'Rate limited',
                icon: <Gauge size={15} />,
                color: RATE_LIMIT_COLOR,
                count: data.rateLimited.length,
                // Rendered by RateLimitList (different row shape), not JobList.
                jobs: undefined,
                empty: 'No rate-limit hits in the last 24h.',
              },
              {
                key: 'done' as const,
                title: 'Recently done',
                icon: <CheckCircle2 size={15} />,
                color: '#3fb950',
                count: data.done.length,
                jobs: data.done,
                empty: 'No completed runs yet.',
              },
            ];
            const active = tabs.find((t) => t.key === activeTab) ?? tabs[0]!;
            return (
              <>
                {/* Tab bar — each tab shows its bucket's count; the active one is
                    underlined in its status color so the palette carries meaning. */}
                <div
                  role="tablist"
                  className="flex shrink-0 flex-wrap gap-1 border-b"
                  style={{ borderColor: theme.colors.border }}
                >
                  {tabs.map((t) => {
                    const on = t.key === active.key;
                    return (
                      <button
                        key={t.key}
                        role="tab"
                        aria-selected={on}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className="-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                        style={{
                          borderColor: on ? t.color : 'transparent',
                          color: on ? theme.colors.text : theme.colors.textMuted,
                        }}
                      >
                        <span style={{ color: t.color, display: 'inline-flex' }}>{t.icon}</span>
                        {t.title}
                        <span
                          className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                          style={{
                            color: t.color,
                            background: `color-mix(in srgb, ${t.color} ${on ? 18 : 12}%, transparent)`,
                          }}
                        >
                          {t.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Only this region scrolls — header, tab bar and footer stay put. */}
                <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 pt-3">
                  {active.key === 'rateLimited' ? (
                    <RateLimitList records={data.rateLimited} emptyLabel={active.empty} />
                  ) : (
                    <JobList jobs={active.jobs ?? []} emptyLabel={active.empty} />
                  )}
                </div>
              </>
            );
          })()}

        <footer
          className="flex shrink-0 items-center gap-1.5 text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          <Clock size={11} />
          Auto-refreshes every {POLL_MS / 1000}s.
        </footer>
      </div>
    </div>
  );
}
