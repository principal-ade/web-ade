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
  type RepoAnalysisJobRecord,
} from '@/lib/repo-analysis/s3-cache';

// AWS SDK → Node runtime. Force-dynamic so the status is always live, never a
// build-time snapshot.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same window the per-repo GET uses: how long after launch a run is still
 *  presumed in flight before it's treated as stalled. */
const RUN_IN_PROGRESS_WINDOW_MS = 15 * 60 * 1000;
/** Tolerance when comparing the VM-stamped result time against the host-stamped
 *  launch time (two clocks), so a just-finished run reads as done, not stalled. */
const LAUNCH_CLOCK_SKEW_MS = 60 * 1000;

type JobStatus = 'inProgress' | 'stalled' | 'failed' | 'done';

export interface RepoAnalysisJob extends RepoAnalysisJobRecord {
  status: JobStatus;
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

export async function GET() {
  try {
    const now = Date.now();
    const records = await listRepoAnalysisJobs();
    const jobs: RepoAnalysisJob[] = records
      .map((r) => ({ ...r, status: deriveStatus(r, now) }))
      .sort((a, b) => activityMs(b) - activityMs(a));

    const inProgress = jobs.filter((j) => j.status === 'inProgress');
    const stalled = jobs.filter((j) => j.status === 'stalled');
    const failed = jobs.filter((j) => j.status === 'failed');
    // Completed set can be large; the page only needs the recent tail.
    const done = jobs.filter((j) => j.status === 'done').slice(0, 50);

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      counts: {
        inProgress: inProgress.length,
        stalled: stalled.length,
        failed: failed.length,
        done: jobs.length - inProgress.length - stalled.length - failed.length,
      },
      inProgress,
      stalled,
      failed,
      done,
    });
  } catch (err) {
    console.error('[Repo Analysis Status] failed to list jobs:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
