/**
 * Repo catalog — the agent-facing view of an `owner/repo` page.
 *
 * The `/{owner}/{repo}` page is a client-hydrated SPA, so a programmatic caller
 * (curl, an LLM fetcher, an agent handed the bare repo URL) only sees the
 * loading shell. The middleware rewrites those non-browser navigations here,
 * to a manifest with two layers:
 *
 *   - `repo_info` — what the repo *is* (GitHub metadata), which rides for free
 *     on the `/repos/{owner}/{repo}` call the access check already makes.
 *   - `trails` / `tours` — what Principal *knows* about it, from the per-repo
 *     store indexes, each entry carrying a drill-in link.
 *
 * Topics are intentionally absent: they aren't repo-scoped, so there's no
 * per-repo listing to surface here.
 *
 * Access is gated by GitHub read-access (same gate as the per-repo trail/tour
 * endpoints), so only public repos resolve for anonymous callers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/request';
import { getIndex as getTrailIndex } from '@/lib/trails/s3-storage';
import { getIndex as getTourIndex } from '@/lib/tours/s3-storage';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import {
  agentGuidePointer,
  markdownResponse,
  negotiateFormat,
  privateRepoMarkdown,
  repoCatalogMarkdown,
  repoCliHint,
  type AgentFormat,
  type RepoCatalogLinks,
} from '@/lib/trails/agent-markdown';

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * Self-describing affordances for non-browser callers. Links are absolute
 * (resolved from forwarded proxy headers) so they work verbatim when the JSON
 * is read out-of-band by a tool. `trails`/`tours` point at the existing
 * per-repo list endpoints; `self` is this catalog; `humanView` is the SPA page.
 */
function catalogLinks(
  request: NextRequest,
  owner: string,
  repo: string,
): { origin: string; links: RepoCatalogLinks } {
  const h = request.headers;
  const host = h.get('x-forwarded-host') || h.get('host') || request.nextUrl.host;
  const proto =
    h.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  const origin = `${proto}://${host}`;
  const seg = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return {
    origin,
    links: {
      self: `${origin}/api/repos/${seg}`,
      trails: `${origin}/api/trails/${seg}`,
      tours: `${origin}/api/tours/${seg}`,
      humanView: `${origin}/${seg}`,
    },
  };
}

const HINTS =
  'Principal catalog for a GitHub repo, returned as JSON. `repo_info` is ' +
  'GitHub metadata (description, language, topics, stars, default branch). ' +
  '`trails` are human-authored code walkthroughs pinned to files and line ' +
  'ranges — read these to understand the codebase before cold-reading the ' +
  'tree; follow each entry’s `_links.self` for the full trail (markers, ' +
  'summary, diffs) or `_links.humanView` for the interactive page. `tours` ' +
  'are guided introductions. Topics are not repo-scoped and so are not listed ' +
  'here. Access is gated by GitHub repo read-access, so only public repos ' +
  'resolve for anonymous callers.';

function noAccessResponse(format: AgentFormat, humanView: string) {
  if (format === 'md') {
    return markdownResponse(privateRepoMarkdown(humanView), 403);
  }
  return NextResponse.json(
    {
      error: 'No read access to this repository',
      code: ShareErrorCodes.NO_REPO_ACCESS,
      ...repoCliHint(),
    },
    { status: 403 },
  );
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { owner, repo } = await params;

    const format = negotiateFormat(request);
    const { origin, links } = catalogLinks(request, owner, repo);

    // Public repos are readable by logged-out callers; checkRepoAccess falls
    // back to anonymous GitHub when the token is null.
    const githubToken = await getGitHubToken();

    validateOwnerRepo(owner, repo);

    const access = await checkRepoAccess(owner, repo, githubToken ?? null);
    if (!access) {
      return noAccessResponse(format, links.humanView);
    }

    // Trails are authoritative; a tours-store hiccup must not sink the whole
    // catalog, so its index read degrades to an empty list.
    const trailIndex = await getTrailIndex(owner, repo);
    let tourEntries: Awaited<ReturnType<typeof getTourIndex>>['entries'] = [];
    try {
      const tourIndex = await getTourIndex(owner, repo);
      tourEntries = tourIndex.entries;
    } catch (error) {
      console.warn(`[Repos] Tour index unavailable for ${owner}/${repo}:`, error);
    }

    const trails = [...trailIndex.entries]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((e) => ({
        id: e.id,
        title: e.title,
        summaryPreview: e.summaryPreview,
        markerCount: e.markerCount,
        updatedAt: e.updatedAt,
        author: e.createdBy?.githubLogin,
        humanView: `${origin}/trail/${encodeURIComponent(e.id)}`,
        _links: {
          self: `${origin}/api/trails/by-id/${encodeURIComponent(e.id)}`,
          humanView: `${origin}/trail/${encodeURIComponent(e.id)}`,
        },
      }));

    const tours = [...tourEntries]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((e) => ({
        id: e.id,
        title: e.title,
        stepCount: e.stepCount,
        updatedAt: e.updatedAt,
        author: e.createdBy?.githubLogin,
        // Tours render on the repo page (no standalone `/tour/<id>` route);
        // a `?tour=<id>` deep-link selector is a planned follow-up.
        humanView: `${origin}/${owner}/${repo}`,
        _links: { humanView: `${origin}/${owner}/${repo}` },
      }));

    const repo_info = {
      description: access.description,
      primaryLanguage: access.primaryLanguage,
      defaultBranch: access.defaultBranch,
      visibility: access.private ? ('private' as const) : ('public' as const),
      topics: access.topics,
      stars: access.stars,
      homepage: access.homepage,
      htmlUrl: access.htmlUrl,
      pushedAt: access.pushedAt,
    };

    if (format === 'md') {
      return markdownResponse(
        repoCatalogMarkdown({ origin, owner, repo, info: repo_info, trails, tours, links }),
      );
    }

    return NextResponse.json({
      owner,
      repo,
      repo_info,
      trails,
      tours,
      _links: links,
      _hints: `${HINTS} ${agentGuidePointer(origin)}`,
    });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Repos] Catalog error:', error);
    return NextResponse.json(
      { error: 'Failed to build repo catalog' },
      { status: 500 },
    );
  }
}
