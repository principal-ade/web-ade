/**
 * Repo Analysis API
 *
 * GET  /api/repo-analysis/[owner]/[repo]
 *   Reads the S3-cached analysis and reports whether it's stale (its `sha` vs
 *   the repo's current HEAD). Never boots a VM — this is the cheap read the page
 *   paints first, so it's never blank for a repo analyzed before.
 *
 * POST /api/repo-analysis/[owner]/[repo]
 *   The refresh: reuses the repo's warm VM (git fetch + re-sweep) or boots a new
 *   one, runs the in-VM git sweep, OVERWRITES the S3 cache (latest only), and
 *   returns the analysis inline. Per-file line counts (3D building heights) + a
 *   contributor ownership map (highlight coverage).
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
import { runRepoAnalysis, RepoAnalysisError } from '@/lib/repo-analysis/run';
import {
  getRepoAnalysisFromS3,
  storeRepoAnalysisInS3,
  getRepoVmId,
  setRepoVmId,
  getRepoAnalysisErrorFromS3,
  storeRepoAnalysisErrorInS3,
  clearRepoAnalysisErrorInS3,
} from '@/lib/repo-analysis/s3-cache';
import { resolveHeadSha } from '@/lib/trails/github-access';

// A full clone + blame sweep of a large repo can take minutes — must run on the
// Node runtime with a raised duration cap, not edge.
export const runtime = 'nodejs';
export const maxDuration = 300;

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
  const [cached, currentSha, warmVmId, lastError] = await Promise.all([
    getRepoAnalysisFromS3(owner, repo),
    token ? resolveHeadSha(owner, repo, token) : Promise.resolve(null),
    getRepoVmId(owner, repo),
    // Auxiliary observability read — a sidecar failure must never blank the page,
    // so unlike the reads above this one degrades to null instead of throwing.
    getRepoAnalysisErrorFromS3(owner, repo).catch((err) => {
      console.error('[Repo Analysis] getRepoAnalysisErrorFromS3 failed:', err);
      return null;
    }),
  ]);
  const hasWarmVm = warmVmId != null;

  if (!cached) {
    return NextResponse.json({ cached: false, owner, repo, currentSha, hasWarmVm, lastError });
  }

  const stale = currentSha != null && currentSha !== cached.sha;
  return NextResponse.json({
    ...cached.analysis,
    cached: true,
    owner,
    repo,
    sha: cached.sha,
    currentSha,
    stale,
    hasWarmVm,
    lastError,
    generatedAt: cached.generatedAt,
    authorCount: Object.keys(cached.analysis.byEmail).length,
  });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const userToken = (await getGitHubToken()) ?? undefined;
  const startedAt = Date.now();

  try {
    const existingVmId = (await getRepoVmId(owner, repo)) ?? undefined;
    const { analysis, vmId } = await runRepoAnalysis({
      owner,
      repo,
      userToken,
      existingVmId,
    });

    const generatedAt = new Date().toISOString();
    // Best-effort persistence: a cache/registry write must never fail the run.
    // Record the warm VM first so a concurrent click can already reuse it.
    await setRepoVmId(owner, repo, vmId).catch((err) =>
      console.error('[Repo Analysis] setRepoVmId failed:', err)
    );
    await storeRepoAnalysisInS3({
      owner,
      repo,
      sha: analysis.sha || null,
      generatedAt,
      generatedBy: 'web-ade',
      analysis,
    }).catch((err) =>
      console.error('[Repo Analysis] storeRepoAnalysisInS3 failed:', err)
    );
    // This run succeeded — drop any stale failure breadcrumb for the repo.
    await clearRepoAnalysisErrorInS3(owner, repo).catch((err) =>
      console.error('[Repo Analysis] clearRepoAnalysisErrorInS3 failed:', err)
    );

    return NextResponse.json({
      ...analysis,
      owner,
      repo,
      sha: analysis.sha || null,
      generatedAt,
      durationMs: Date.now() - startedAt,
      authorCount: Object.keys(analysis.byEmail).length,
    });
  } catch (err) {
    // `clone` failing on a private repo without a token is a benign auth case
    // (a different caller with a token would succeed) — don't record it as a
    // repo failure. Persist every genuine failure so it's retrievable later.
    const isAuthMiss =
      err instanceof RepoAnalysisError && err.stage === 'clone' && !userToken;
    if (!isAuthMiss) {
      await storeRepoAnalysisErrorInS3({
        owner,
        repo,
        stage: err instanceof RepoAnalysisError ? err.stage : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        failedAt: new Date().toISOString(),
      }).catch((e) =>
        console.error('[Repo Analysis] storeRepoAnalysisErrorInS3 failed:', e)
      );
    }

    if (err instanceof RepoAnalysisError) {
      const status = err.stage === 'clone' && !userToken ? 401 : 502;
      return NextResponse.json(
        { error: err.message, stage: err.stage, owner, repo },
        { status }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), owner, repo },
      { status: 500 }
    );
  }
}
