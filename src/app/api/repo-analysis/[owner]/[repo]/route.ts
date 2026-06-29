/**
 * Repo Analysis API (MVP — test retrieval)
 *
 * POST /api/repo-analysis/[owner]/[repo]
 *   Boots a Freestyle VM, clones the repo, runs an in-VM git sweep, and returns
 *   the analysis inline: per-file line counts (3D building heights) + a
 *   contributor ownership map (highlight coverage).
 *
 * This is the server-side producer of the same data the electron-app computes
 * locally — so the metrics exist even when no desktop app is running. It fills
 * the line-counts route's ">= 2000 files needs the electron-app" gap.
 *
 * Scope: retrieval only. No S3 cache and no sha-keyed storage yet (a later
 * optimization). Public repos run anonymously; private repos use the caller's
 * GitHub token (cookie), which is embedded host-side in the clone URL and
 * scrubbed from the VM remote right after the clone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { runRepoAnalysis, RepoAnalysisError } from '@/lib/repo-analysis/run';

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

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const userToken = (await getGitHubToken()) ?? undefined;
  const startedAt = Date.now();

  try {
    const analysis = await runRepoAnalysis({ owner, repo, userToken });
    return NextResponse.json({
      owner,
      repo,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      authorCount: Object.keys(analysis.byEmail).length,
      ...analysis,
    });
  } catch (err) {
    if (err instanceof RepoAnalysisError) {
      // `clone` failing on a private repo without a token is the common 4xx case.
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
