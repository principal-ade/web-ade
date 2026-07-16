/**
 * Repo Analysis Status API
 *
 * GET /api/repo-analysis/status
 *   Cross-repo view of the line-count / contributor-coverage jobs. Enumerates the
 *   S3 records every run already writes (warm-VM pointer, result, failure) and
 *   classifies each repo into one of four buckets so an ops/status page can show
 *   what's in flight and what broke — without opening any repo page:
 *
 *     - inProgress — a run launched within the in-progress window with no result
 *       from it yet and no failure on record (the client would still be polling).
 *     - stalled    — a run launched LONGER ago than that window, still no result
 *       and no error: the VM most likely died mid-sweep and never published. This
 *       is the "it failed and left no breadcrumb" case, made visible.
 *     - failed     — a failure record is the latest signal (VM published an error,
 *       or a launch threw). Carries `stage` + `message` for investigation.
 *     - done       — a result whose publish time is at/after the last launch.
 *
 * Read-only and cheap: no VM is booted and result bodies are never downloaded
 * (status is derived from the warm-VM/result/error metadata alone).
 */
import { NextResponse } from 'next/server';
import {
  listRepoAnalysisJobs,
  listRepoRateLimitHits,
  type RepoAnalysisJobRecord,
} from '@/lib/repo-analysis/s3-cache';

// AWS SDK → Node runtime. Force-dynamic so the status is always live, never a
// build-time snapshot.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same window the per-repo GET uses: how long after launch a run is still
 *  presumed in flight before it's treated as stalled. */
const RUN_IN_PROGRESS_WINDOW_MS = 60 * 60 * 1000;
/** Tolerance when comparing the VM-stamped result time against the host-stamped
 *  launch time (two clocks), so a just-finished run reads as done, not stalled. */
const LAUNCH_CLOCK_SKEW_MS = 60 * 1000;
/** Only rate-limit hits from the last day reflect *current* throttling pressure;
 *  older records linger in S3 harmlessly (like completed results) but aren't shown. */
const RATE_LIMIT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Cap the rate-limit list the page renders. */
const RATE_LIMIT_MAX_ROWS = 50;

type JobStatus = 'inProgress' | 'stalled' | 'failed' | 'done';

export interface RepoAnalysisJob extends RepoAnalysisJobRecord {
  status: JobStatus;
}

/** The GITHUB_TOKEN budget at a glance — `null` means "couldn't probe / no
 *  token set", so the page hides the card instead of rendering a question. */
export interface TokenQuota {
  remaining: number;
  limit: number;
  resetEpochSeconds: number;
}

/** Classify one merged record. Mirrors the per-repo GET's derivation: a result
 *  counts as "from this launch" when it was generated at/after the launch (sha
 *  isn't available here without a GitHub call, so time is the sole signal). A
 *  failure wins only when it's the freshest signal — a success after it clears it. */
function deriveStatus(r: RepoAnalysisJobRecord, now: number): JobStatus {
  const launchedAtMs = r.launchedAt ? Date.parse(r.launchedAt) : NaN;
  const generatedMs = r.generatedAt ? Date.parse(r.generatedAt) : NaN;
  const errorAtMs = r.error?.failedAt ? Date.parse(r.error.failedAt) : NaN;

  const hasResultFromLaunch =
    Number.isFinite(generatedMs) &&
    (!Number.isFinite(launchedAtMs) || generatedMs >= launchedAtMs - LAUNCH_CLOCK_SKEW_MS);

  // A failure is the outcome only if no result superseded it.
  const errorIsLatest =
    Number.isFinite(errorAtMs) && (!Number.isFinite(generatedMs) || errorAtMs >= generatedMs);
  if (errorIsLatest) return 'failed';

  if (Number.isFinite(launchedAtMs) && !hasResultFromLaunch) {
    return now - launchedAtMs < RUN_IN_PROGRESS_WINDOW_MS ? 'inProgress' : 'stalled';
  }
  return 'done';
}

/** Most-recent-activity timestamp for a record, for sorting within a bucket. */
function activityMs(r: RepoAnalysisJobRecord): number {
  return Math.max(
    r.error?.failedAt ? Date.parse(r.error.failedAt) : 0,
    r.generatedAt ? Date.parse(r.generatedAt) : 0,
    r.launchedAt ? Date.parse(r.launchedAt) : 0
  );
}

/** Best-effort GitHub rate-limit probe for the server's GITHUB_TOKEN (the
 *  budget the repo-analysis VM runs actually draw on). `null` on any failure
 *  so the status page just hides the card — the jobs view is still useful. */
async function fetchTokenQuota(): Promise<TokenQuota | null> {
  // The VM clone/publish runs use the user-pinned $GITHUB_TOKEN, so report
  // on that. With no token set, there's nothing to show.
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      // Don't let a slow GitHub response stall the status page.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    // We only care about the core budget (REST) — search/graphql/integration
    //  limits are separate groups; the page surfaces remaining/limit/reset.
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    // The /rate_limit body is canonical, but the response headers are stamped
    //  on every GitHub response; prefer them so the body shape never matters.
    if (remaining !== null && limit !== null && reset !== null) {
      return {
        remaining: Number(remaining),
        limit: Number(limit),
        resetEpochSeconds: Number(reset),
      };
    }
    // Fall back to the body only if headers were stripped (e.g. a proxy).
    const body = (await res.json()) as {
      rate?: { remaining?: number; limit?: number; reset?: number };
    };
    const r = body.rate;
    if (
      r &&
      typeof r.remaining === 'number' &&
      typeof r.limit === 'number' &&
      typeof r.reset === 'number'
    ) {
      return { remaining: r.remaining, limit: r.limit, resetEpochSeconds: r.reset };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const now = Date.now();
    const [records, rateLimitRecords, tokenQuota] = await Promise.all([
      listRepoAnalysisJobs(),
      listRepoRateLimitHits(),
      fetchTokenQuota(),
    ]);
    const jobs: RepoAnalysisJob[] = records
      .map((r) => ({ ...r, status: deriveStatus(r, now) }))
      .sort((a, b) => activityMs(b) - activityMs(a));

    const inProgress = jobs.filter((j) => j.status === 'inProgress');
    const stalled = jobs.filter((j) => j.status === 'stalled');
    const failed = jobs.filter((j) => j.status === 'failed');
    // Completed set can be large; the page only needs the recent tail.
    const done = jobs.filter((j) => j.status === 'done').slice(0, 50);

    // Only recent throttling reflects current pressure; freshest first.
    const rateLimited = rateLimitRecords
      .filter((r) => {
        const last = Date.parse(r.lastHitAt);
        return Number.isFinite(last) && now - last < RATE_LIMIT_RECENT_WINDOW_MS;
      })
      .sort((a, b) => Date.parse(b.lastHitAt) - Date.parse(a.lastHitAt))
      .slice(0, RATE_LIMIT_MAX_ROWS);

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      tokenQuota,
      counts: {
        inProgress: inProgress.length,
        stalled: stalled.length,
        failed: failed.length,
        done: jobs.length - inProgress.length - stalled.length - failed.length,
        rateLimited: rateLimited.length,
      },
      inProgress,
      stalled,
      failed,
      done,
      rateLimited,
    });
  } catch (err) {
    console.error('[Repo Analysis Status] failed to list jobs:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
