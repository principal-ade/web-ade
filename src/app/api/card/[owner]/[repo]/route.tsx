/**
 * Repo Card Image Generation API (next/og based)
 *
 * GET /api/card/[owner]/[repo] - Generate a 1200×628 Open Graph / Twitter card
 * PNG for a repository: owner avatar + repo name + stats beside a fully-colored
 * File City map of the whole codebase.
 *
 * Uses Next.js ImageResponse (Satori-based) with the presentational
 * `RepoCardOG` component (shared with Storybook). The city map is built from
 * the live GitHub tree via `buildRepoFileMap`.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { RepoCardOG } from '@/components/repo/og/RepoCardOG';
import { buildRepoFileMap } from '@/lib/repo/repo-file-map';

const WIDTH = 1200;
const HEIGHT = 628;
// Square map panel on the right of the card (matches FileMapPanel placement).
const MAP_SIZE = 548;

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
  stargazers_count: number;
  language: string | null;
}

interface GitHubTree {
  tree: Array<{ type: string }>;
}

interface RouteParams {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const { owner, repo } = await params;
    const noCache = request.nextUrl.searchParams.get('nocache') === '1';

    console.log('[Card API] Generating card:', { owner, repo });

    // Base URL for our own file-city-data endpoint (Lambda/Amplify-aware).
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host}`;

    // Fetch repo metadata, file count, and the projected city map in parallel.
    const [repoResponse, treeResponse, fileMap] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'web-ade-card-generator',
        },
        next: { revalidate: 3600 },
      }),
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'web-ade-card-generator',
          },
          next: { revalidate: 3600 },
        }
      ),
      buildRepoFileMap(baseUrl, owner, repo, MAP_SIZE),
    ]);

    if (!repoResponse.ok) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const repoData: GitHubRepo = await repoResponse.json();

    let fileCount = 0;
    if (treeResponse.ok) {
      const treeData: GitHubTree = await treeResponse.json();
      fileCount = treeData.tree?.filter((item) => item.type === 'blob').length || 0;
    }

    const duration = Date.now() - startTime;
    console.log('[Card API] Generated card:', {
      owner,
      repo,
      buildings: fileMap?.rects.length ?? 0,
      duration: `${duration}ms`,
      baseUrl,
    });

    return new ImageResponse(
      (
        <RepoCardOG
          owner={owner}
          repo={repoData.name}
          ownerAvatarUrl={repoData.owner.avatar_url}
          description={repoData.description ?? undefined}
          stars={repoData.stargazers_count}
          language={repoData.language ?? undefined}
          files={fileCount}
          fileMap={fileMap}
        />
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        headers: {
          'Cache-Control': noCache
            ? 'no-store'
            : 'public, max-age=3600, s-maxage=86400',
        },
      }
    );
  } catch (error) {
    console.error('[Card API] Error generating card:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to generate card', message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
