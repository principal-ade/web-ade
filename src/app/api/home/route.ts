/**
 * Site index — the agent-facing view of the home page (`/`).
 *
 * The home page is a client-hydrated SPA (onboarding for logged-out callers, a
 * dashboard for signed-in ones), so a programmatic caller handed the bare root
 * URL only sees the loading shell. The middleware rewrites those non-browser
 * navigations here, to an orientation manifest that teaches discovery: what
 * Principal is, how to fetch any trail/topic/repo programmatically (the
 * Accept-header convention), and the list of public repos that have trails.
 *
 * Only public repos are listed — the same `repoVisibility === 'public'` filter
 * the `/explore` listing uses — so this is safe for anonymous callers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listPublicReposWithTrails } from '@/lib/trails/public-listing';
import {
  homeIndexMarkdown,
  markdownResponse,
  negotiateFormat,
  type HomeLinks,
  type HomeRepoItem,
} from '@/lib/trails/agent-markdown';

// Same 60s staleness budget as `/api/trails/repos`, which reads the same
// per-repo indexes; the lazy visibility backfill is idempotent.
export const revalidate = 60;

const HINTS =
  'Principal site index, returned as JSON. `agent_access` describes how every ' +
  'shareable page content-negotiates: a browser gets the app, a programmatic ' +
  'caller gets Markdown (default) or JSON (`Accept: application/json`) at the ' +
  'same URL. `repos` lists every public repo that has at least one trail — a ' +
  'trail is a human-authored walkthrough pinned to files and line ranges; read ' +
  'these to understand a codebase before cold-reading the tree. Follow each ' +
  "repo's `catalog` link for its trails + tours, or `humanView` for the page. " +
  'Only public repos are listed for anonymous callers.';

/** Absolute origin from forwarded proxy headers, so links work out-of-band. */
function resolveOrigin(request: NextRequest): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') || h.get('host') || request.nextUrl.host;
  const proto =
    h.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    const format = negotiateFormat(request);
    const origin = resolveOrigin(request);

    const links: HomeLinks = {
      self: `${origin}/api/home`,
      explore: `${origin}/explore`,
      humanView: `${origin}/`,
    };

    const publicRepos = await listPublicReposWithTrails();
    const repos: HomeRepoItem[] = publicRepos.map((r) => ({
      owner: r.owner,
      repo: r.repo,
      trailCount: r.trailCount,
      humanView: `${origin}/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`,
    }));

    if (format === 'md') {
      return markdownResponse(homeIndexMarkdown({ origin, repos, links }));
    }

    return NextResponse.json({
      service: 'Principal AI',
      description: 'Guided, human-authored trails through codebases.',
      agent_access: {
        summary:
          'Every shareable page content-negotiates on the Accept header: a ' +
          'browser gets the interactive app; a programmatic caller gets ' +
          'Markdown (default) or JSON (Accept: application/json) at the same URL.',
        routes: [
          {
            pattern: `${origin}/{owner}/{repo}`,
            returns: 'Repo catalog — published trails + tours for a repository',
          },
          {
            pattern: `${origin}/trail/{id}`,
            returns: 'A single trail — markers pinned to files and line ranges',
          },
          {
            pattern: `${origin}/topic/{id}`,
            returns: 'A topic — a curated bundle of trails',
          },
        ],
        cli: 'npx @principal-ai/principal-view-cli',
        cliHint:
          'For private or gated repos, the CLI resolves your GitHub token (via ' +
          'the gh CLI or a git credential helper) and calls the same API with a ' +
          'Bearer token, so it returns anything your GitHub account can read.',
      },
      repos: publicRepos.map((r) => ({
        owner: r.owner,
        repo: r.repo,
        trailCount: r.trailCount,
        lastUpdated: r.lastUpdated,
        humanView: `${origin}/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`,
        catalog: `${origin}/api/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`,
      })),
      _links: links,
      _hints: HINTS,
    });
  } catch (error) {
    console.error('[Home] Site index error:', error);
    return NextResponse.json(
      { error: 'Failed to build site index' },
      { status: 500 },
    );
  }
}
