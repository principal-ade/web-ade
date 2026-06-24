/**
 * Site index — the agent-facing view of the home page (`/`).
 *
 * The home page is a client-hydrated SPA (onboarding for logged-out callers, a
 * dashboard for signed-in ones), so a programmatic caller handed the bare root
 * URL only sees the loading shell. The middleware rewrites those non-browser
 * navigations here, to an orientation manifest that teaches discovery: what
 * Principal is, how to fetch any trail/topic/repo programmatically (the
 * Accept-header convention), and how to open a trail/tour locally via the CLI.
 *
 * This is the canonical "for agents" doc — repo catalogs and trails point back
 * here for the CLI quickstart instead of repeating it.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CLI_PACKAGE,
  homeIndexMarkdown,
  markdownResponse,
  negotiateFormat,
  type HomeLinks,
} from '@/lib/trails/agent-markdown';

const HINTS =
  'Principal site index, returned as JSON. `agent_access` describes how every ' +
  'shareable page content-negotiates: a browser gets the app, a programmatic ' +
  'caller gets Markdown (default) or JSON (`Accept: application/json`) at the ' +
  'same URL — a trail is a human-authored walkthrough pinned to files and line ' +
  'ranges; read these to understand a codebase before cold-reading the tree. ' +
  '`agent_access.open_locally` is the Principal CLI quickstart for opening a ' +
  'trail or tour in the interactive viewer. Reach a specific repo, trail, or ' +
  'topic by fetching its URL with this same Accept-header convention.';

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

    if (format === 'md') {
      return markdownResponse(homeIndexMarkdown({ origin, links }));
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
        open_locally: {
          summary:
            'Fetching a trail tells you what it says. To open it in the ' +
            'interactive viewer (3D File City, source side-by-side), use the ' +
            'Principal CLI with the bare id or the full /trail/<id> (or ' +
            '/tour/<id>) URL.',
          commands: {
            trailView: `npx -y ${CLI_PACKAGE} trail view <trail-id-or-url>`,
            tourView: `npx -y ${CLI_PACKAGE} tour view <tour-id-or-url>`,
            trailFetch: `npx -y ${CLI_PACKAGE} trail fetch <trail-id-or-url>`,
          },
          viewerNote:
            'The viewer GUI ships macOS arm64 prebuilds only. On other ' +
            'platforms — or a headless/CI agent — use `trail fetch` to print ' +
            'the trail JSON instead of opening the viewer.',
          authNote:
            'For private or gated repos, the CLI resolves your GitHub token ' +
            '(via the gh CLI or a git credential helper) and calls the same ' +
            'API with a Bearer token, so it returns anything your GitHub ' +
            'account can read.',
        },
      },
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
