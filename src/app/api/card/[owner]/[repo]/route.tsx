/**
 * Card Image Generation API (next/og based)
 *
 * GET /api/card/[owner]/[repo] - Generate a Twitter card PNG for a repository
 *
 * Uses Next.js ImageResponse (Satori-based) for OG image generation.
 * Uses CardLayoutOG from the repository-composition-panels package.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { CardLayoutOG } from '@industry-theme/repository-composition-panels/og';

// Twitter card dimensions
const WIDTH = 1200;
const HEIGHT = 628;

// Card dimensions (maintain aspect ratio)
const CARD_HEIGHT = HEIGHT - 40;
const CARD_WIDTH = Math.round(CARD_HEIGHT * 0.6);

// Language to color mapping
const languageColors: Record<string, number> = {
  TypeScript: 0x3178c6,
  JavaScript: 0xf7df1e,
  Python: 0xffd43b,
  Rust: 0xdea584,
  Go: 0x00add8,
  Java: 0xb07219,
  'C++': 0xf34b7d,
  C: 0x555555,
  'C#': 0x178600,
  Ruby: 0xcc342d,
  PHP: 0x4f5d95,
  Swift: 0xf05138,
  Kotlin: 0xa97bff,
  Shell: 0x89e051,
  HTML: 0xe34c26,
  CSS: 0x563d7c,
  Vue: 0x41b883,
  Svelte: 0xff3e00,
};

const DEFAULT_COLOR = 0x6b7280;

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
  license?: {
    spdx_id: string;
  } | null;
  created_at?: string;
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
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

    // Fetch repo data and owner profile in parallel
    const [repoResponse, ownerResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'web-ade-card-generator',
        },
        next: { revalidate: 3600 },
      }),
      fetch(`https://api.github.com/users/${owner}`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'web-ade-card-generator',
        },
        next: { revalidate: 3600 },
      }),
    ]);

    if (!repoResponse.ok) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const repoData: GitHubRepo = await repoResponse.json();
    const ownerData: GitHubUser | null = ownerResponse.ok
      ? await ownerResponse.json()
      : null;
    const ownerDisplayName = ownerData?.name ?? owner;

    // Fetch file count
    let fileCount = 0;
    try {
      const treeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'web-ade-card-generator',
          },
          next: { revalidate: 3600 },
        }
      );
      if (treeResponse.ok) {
        const treeData: GitHubTree = await treeResponse.json();
        fileCount =
          treeData.tree?.filter((item) => item.type === 'blob').length || 0;
      }
    } catch {
      // Ignore
    }

    // Get color for the card
    const color = repoData.language
      ? languageColors[repoData.language] || DEFAULT_COLOR
      : DEFAULT_COLOR;

    // Build File City URL
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const fileCityUrl = `${baseUrl}/api/file-city/${owner}/${repo}?width=400&height=300&nocache=1`;

    const duration = Date.now() - startTime;
    console.log('[Card API] Generated card:', {
      owner,
      repo,
      duration: `${duration}ms`,
    });

    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            backgroundColor: '#0a0a0f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              display: 'flex',
            }}
          >
            <CardLayoutOG
              color={color}
              owner={owner}
              ownerDisplayName={ownerDisplayName}
              stars={repoData.stargazers_count}
              label={repoData.name}
              description={repoData.description ?? undefined}
              files={fileCount}
              language={repoData.language ?? undefined}
              license={repoData.license?.spdx_id}
              createdAt={repoData.created_at}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileCityUrl}
                alt="File City"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </CardLayoutOG>
          </div>
        </div>
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
