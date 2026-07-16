/**
 * Repo Analysis API
 *
 * GET  /api/repo-analysis/[owner]/[repo]
 *   Reads the S3-cached analysis and reports whether it's stale (its `sha` vs
 *   the repo's current HEAD). Never boots a VM — this is the cheap read the page
 *   paints first, so it's never blank for a repo analyzed before.
 *
 *   Response is intentionally SLIM so mega-repos (linux/kibana) stay under the
 *   Amplify/CloudFront ~6 MB SSR ceiling:
 *     - meta + scalars (fileCount, totalLinesGlobal, authorCount, …)
 *     - top-N precomputedContributors (rest via GET .../contributors)
 *     - identityByEmail overlay seed
 *   NOT shipped here (stay in S3 / other routes):
 *     - byEmail, personOwnership → GET .../ownership
 *     - lineCounts (per-file heights) → deferred separate endpoint later
 *     - totalLines (per-file blame totals) → server-only; client uses scalars/stats
 *     - shortlog `contributors` → redundant when precomputed exists
 *
 * POST /api/repo-analysis/[owner]/[repo]
 *   The refresh: reuses the repo's warm VM (git fetch + re-sweep) or boots a new
 *   one and LAUNCHES the git sweep DETACHED, then returns 202 immediately. The
 *   VM clones/sweeps on its own and uploads the result (per-file line counts +
 *   contributor ownership map) straight to the S3 cache via a pre-signed URL —
 *   so the multi-minute sweep is never held open by this request (and never hits
 *   the platform's gateway timeout). The client polls GET until the cache turns
 *   fresh, or an error record lands.
 *
 * This is the server-side producer of the same data the electron-app computes
 * locally — so the metrics exist even when no desktop app is running. It fills
 * the line-counts route's ">= 2000 files needs the electron-app" gap.
 *
 * Public repos run anonymously; private repos use the caller's GitHub token
 * (cookie), which is embedded host-side in the clone URL and scrubbed from the
 * VM remote right after the clone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { launchRepoAnalysis, RepoAnalysisError } from '@/lib/repo-analysis/run';
import {
  getRepoAnalysisFromS3,
  getRepoVmId,
  getRepoVmPointer,
  setRepoVmId,
  getRepoAnalysisErrorFromS3,
  storeRepoAnalysisErrorInS3,
  clearRepoAnalysisErrorInS3,
  presignAnalysisUploadUrls,
  MEGA_UPLOAD_URL_TTL_SECONDS,
  getRepoIdentityMapFromS3,
  storeRepoAnalysisInS3,
  extractCarouselEnrichmentFromAnalysis,
  storeCarouselEnrichment,
} from '@/lib/repo-analysis/s3-cache';
import { resolveHeadSha } from '@/lib/trails/github-access';
import { transformAnalysis, needsTransform } from '@/lib/repo-analysis/transform';

// Needs the Node runtime (AWS SDK + Freestyle client), not edge. Both handlers
// are now fast: GET is a cache read; POST only boots/refs a VM and launches a
// detached job (~seconds), so the old multi-minute duration cap is unnecessary.
export const runtime = 'nodejs';
export const maxDuration = 60;

/** How long after a launch a run is still presumed in flight — matches the
 *  client's poll deadline, so `inProgress` ages out exactly when the client
 *  would give up polling. Sized for a cold clone + full blame sweep of a large
 *  repo (e.g. opencode ≈ 11 min; mysql/mysql-server ≈ 30+ min). */
const RUN_IN_PROGRESS_WINDOW_MS = 60 * 60 * 1000;
/** Tolerance for comparing the VM-stamped `generatedAt` against the host-stamped
 *  launch time (two clocks) — only used in the no-token fallback where staleness
 *  can't be decided by sha. */
const LAUNCH_CLOCK_SKEW_MS = 60 * 1000;

/**
 * How many precomputed contributors ride on the main GET. Covers About avatars
 * (~4) and the first screen of the Contributors pane; the rest is paged via
 * GET .../contributors. Sized so even dense identity rows stay well under the
 * Amplify response ceiling when combined with meta (full list alone is ~6 MB
 * on torvalds/linux).
 */
const INLINE_CONTRIBUTORS_LIMIT = 200;

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

/** GitHub token from the user's cookie (private-repo clone); null when absent. */
async function getGitHubToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Read the cached analysis and tell the client whether it's stale. Compares the
 * cache's `sha` (the commit the sweep ran against) to the repo's current HEAD,
 * resolved cheaply via the GitHub API — no clone, no VM. When HEAD can't be
 * resolved (no token), `currentSha` is null and `stale` is left false so the
 * client doesn't refetch-storm.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const token = (await getGitHubToken()) ?? process.env.GITHUB_TOKEN ?? '';
  const [cached, currentSha, vmPointer, lastError, identityMap] = await Promise.all([
    getRepoAnalysisFromS3(owner, repo),
    token ? resolveHeadSha(owner, repo, token) : Promise.resolve(null),
    getRepoVmPointer(owner, repo),
    // Auxiliary observability read — a sidecar failure must never blank the page,
    // so unlike the reads above this one degrades to null instead of throwing.
    getRepoAnalysisErrorFromS3(owner, repo).catch((err) => {
      console.error('[Repo Analysis] getRepoAnalysisErrorFromS3 failed:', err);
      return null;
    }),
    // Pre-resolved blame-email → GitHub-account overlay, embedded below so the
    // page draws avatars/logins with no client round-trip. Best-effort: a missing
    // or unreadable map just means the client resolves lazily (and warms it).
    getRepoIdentityMapFromS3(owner, repo).catch((err) => {
      console.error('[Repo Analysis] getRepoIdentityMapFromS3 failed:', err);
      return null;
    }),
  ]);
  const hasWarmVm = vmPointer != null;

  // Is a run still in flight (so a freshly-reloaded page should resume polling
  // rather than sit idle)? A run was LAUNCHED recently (`vmPointer.updatedAt` is
  // the launch time) AND we don't yet hold its result AND nothing has failed.
  // "Hold its result" is decided sha-first (clock-free): the cache matches HEAD.
  // Only when HEAD is unknown (no token) do we fall back to a timestamp check
  // with a skew margin, so a just-finished run isn't misread as still running.
  const launchedAtMs = vmPointer?.updatedAt ? Date.parse(vmPointer.updatedAt) : NaN;
  const recentLaunch =
    Number.isFinite(launchedAtMs) && Date.now() - launchedAtMs < RUN_IN_PROGRESS_WINDOW_MS;
  const cacheGenMs = cached?.generatedAt ? Date.parse(cached.generatedAt) : NaN;
  const resultFromThisLaunch =
    cached != null &&
    ((currentSha != null && currentSha === cached.sha) ||
      (Number.isFinite(cacheGenMs) &&
        Number.isFinite(launchedAtMs) &&
        cacheGenMs >= launchedAtMs - LAUNCH_CLOCK_SKEW_MS));
  const inProgress = recentLaunch && !resultFromThisLaunch && lastError == null;

  if (!cached) {
    return NextResponse.json({
      cached: false,
      owner,
      repo,
      currentSha,
      hasWarmVm,
      inProgress,
      lastError,
    });
  }

  const stale = currentSha != null && currentSha !== cached.sha;

  // Lazy transform: first GET after a fresh sweep detects raw byEmail without
  // precomputedContributors, runs the transform, and writes the result back
  // to S3 so subsequent reads skip the transform entirely.
  if (needsTransform(cached.analysis)) {
    try {
      const identityByEmail = identityMap?.identityByEmail ?? {};
      const transformed = transformAnalysis(cached.analysis, identityByEmail);
      // Mutate in place so the response below uses the transformed data
      cached.analysis.precomputedContributors = transformed.precomputedContributors;
      cached.analysis.personOwnership = transformed.personOwnership;
      // Persist so subsequent reads are instant (fire-and-forget)
      storeRepoAnalysisInS3(cached).catch((err) => {
        console.error('[Repo Analysis] storeRepoAnalysisInS3 (post-transform) failed:', err);
      });
    } catch (err) {
      console.error('[Repo Analysis] transform failed, serving raw byEmail:', err);
    }
  }

  // Warm carousel enrichment sidecar (fire-and-forget) — populates the lightweight
  // cache so buildCarousel never downloads the multi-MB byEmail blob.
  const enrichment = extractCarouselEnrichmentFromAnalysis(cached.analysis);
  storeCarouselEnrichment(owner, repo, enrichment).catch((err) => {
    console.error('[Repo Analysis] storeCarouselEnrichment failed:', err);
  });

  // Slim response: only scalars + a head of precomputedContributors. Heavy maps
  // (byEmail, personOwnership, lineCounts, totalLines, shortlog contributors)
  // stay in S3 / sibling routes so mega-repos fit under Amplify's ~6 MB ceiling.
  const fullPrecomputed = cached.analysis.precomputedContributors;
  const authorCount = fullPrecomputed
    ? fullPrecomputed.length
    : Object.keys(cached.analysis.byEmail).length;

  const precomputedHead = fullPrecomputed
    ? fullPrecomputed.slice(0, INLINE_CONTRIBUTORS_LIMIT)
    : undefined;
  const contributorsTruncated = Boolean(
    fullPrecomputed && fullPrecomputed.length > INLINE_CONTRIBUTORS_LIMIT,
  );

  return NextResponse.json({
    cached: true,
    owner,
    repo,
    sha: cached.sha,
    currentSha,
    stale,
    hasWarmVm,
    inProgress,
    lastError,
    generatedAt: cached.generatedAt,
    authorCount,
    fileCount: cached.analysis.fileCount,
    totalLinesGlobal: cached.analysis.totalLinesGlobal,
    // Optional head of person list (lines-desc). Full list: GET .../contributors.
    ...(precomputedHead ? { precomputedContributors: precomputedHead } : {}),
    contributorsTruncated,
    contributorsNextCursor: contributorsTruncated ? INLINE_CONTRIBUTORS_LIMIT : null,
    // Per-file height map is deferred (separate endpoint later). Signal so the
    // client doesn't treat absence as "analysis failed."
    lineCountsAvailable: true,
    identityByEmail: identityMap?.identityByEmail ?? {},
  });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  // ?mega=true → 24h idle timeout + presigned URL TTL for repos with 100k+ files
  const mega = _req.nextUrl.searchParams.get('mega') === 'true';
  const idleTimeoutSeconds = mega ? 86400 : undefined;

  const userToken = (await getGitHubToken()) ?? undefined;

  try {
    // A new run supersedes any prior failure — drop the stale error breadcrumb
    // up front so a client polling the cache mid-run doesn't read the old
    // failure as this run's outcome. (The VM writes a fresh error record if THIS
    // run fails.) Best-effort: a clear failure must never abort the run.
    await clearRepoAnalysisErrorInS3(owner, repo).catch((err) =>
      console.error('[Repo Analysis] clearRepoAnalysisErrorInS3 (pre-run) failed:', err)
    );

    const existingVmId = (await getRepoVmId(owner, repo)) ?? undefined;
    // Scoped, expiring URLs the VM uploads its result (or failure) to directly —
    // so the multi-minute clone+sweep can run DETACHED on the VM and publish to
    // the shared cache itself, instead of being held open by this request.
    const { analysisUrl, errorUrl } = await presignAnalysisUploadUrls(
      owner,
      repo,
      mega ? MEGA_UPLOAD_URL_TTL_SECONDS : undefined
    );

    const { vmId } = await launchRepoAnalysis({
      owner,
      repo,
      userToken,
      existingVmId,
      analysisUrl,
      errorUrl,
      idleTimeoutSeconds,
    });

    // Record the warm VM so the next run (and a concurrent click) reuses it.
    await setRepoVmId(owner, repo, vmId).catch((err) =>
      console.error('[Repo Analysis] setRepoVmId failed:', err)
    );

    // 202: the job is RUNNING on the VM and publishes its result to S3 when done.
    // The client polls GET until the cache turns fresh (or an error record lands).
    return NextResponse.json(
      { status: 'started', owner, repo, vmId },
      { status: 202 }
    );
  } catch (err) {
    // Only VM create/launch failures reach here — the clone+sweep run detached on
    // the VM and report their own failures via the uploaded error record. Persist
    // and surface launch failures so the client doesn't poll a job that never ran.
    await storeRepoAnalysisErrorInS3({
      owner,
      repo,
      stage: err instanceof RepoAnalysisError ? err.stage : 'unknown',
      message: err instanceof Error ? err.message : String(err),
      failedAt: new Date().toISOString(),
    }).catch((e) =>
      console.error('[Repo Analysis] storeRepoAnalysisErrorInS3 failed:', e)
    );

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stage: err instanceof RepoAnalysisError ? err.stage : 'unknown',
        owner,
        repo,
      },
      { status: 502 }
    );
  }
}
