/**
 * Card Image Generation API (next/og based)
 *
 * GET /api/card/[owner]/[repo] - Generate a Twitter card PNG for a repository
 *
 * Uses Next.js ImageResponse (Satori-based) for OG image generation.
 * No external dependencies needed - works on serverless environments.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// Twitter card dimensions
const WIDTH = 1200;
const HEIGHT = 628;

// Card dimensions (maintain aspect ratio)
const CARD_HEIGHT = HEIGHT - 40;
const CARD_WIDTH = Math.round(CARD_HEIGHT * 0.6);

// Language to color mapping
const languageColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#ffd43b',
  Rust: '#dea584',
  Go: '#00add8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#cc342d',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

const DEFAULT_COLOR = '#6b7280';

// License border colors
const licenseBorderColors: Record<string, string> = {
  MIT: '#228b22',
  BSD: '#228b22',
  'BSD-3-Clause': '#228b22',
  ISC: '#228b22',
  'Apache-2.0': '#d97706',
  'GPL-3.0': '#2255aa',
  'LGPL-3.0': '#2255aa',
  'GPL-2.0': '#2255aa',
  'AGPL-3.0': '#2255aa',
  'MPL-2.0': '#8b5cf6',
  UNLICENSED: '#dc2626',
};

function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function getStarColor(count: number): string {
  if (count >= 100000) return '#ffd700';
  if (count >= 10000) return '#c0c0c0';
  if (count >= 5000) return '#cd7f32';
  return '#f97316';
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - percent));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - percent));
  const b = Math.max(0, (num & 0xff) * (1 - percent));
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

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

    // Fetch repo data
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'web-ade-card-generator',
        },
        next: { revalidate: 3600 },
      }
    );

    if (!repoResponse.ok) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const repoData: GitHubRepo = await repoResponse.json();

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

    // Get colors
    const baseColor = repoData.language
      ? languageColors[repoData.language] || DEFAULT_COLOR
      : DEFAULT_COLOR;
    const cardBg = darkenColor(baseColor, 0.6);
    const cardBorder = darkenColor(baseColor, 0.7);
    const cardHighlight = darkenColor(baseColor, 0.4);
    const windowGradient = [darkenColor(baseColor, 0.85), darkenColor(baseColor, 0.8)];
    const panelGradient = [darkenColor(baseColor, 0.4), darkenColor(baseColor, 0.6)];
    const panelBorder = darkenColor(baseColor, 0.3);

    const stars = repoData.stargazers_count;
    const starColor = stars > 0 ? getStarColor(stars) : cardHighlight;
    const licenseBorder = repoData.license?.spdx_id
      ? licenseBorderColors[repoData.license.spdx_id] || cardHighlight
      : null;

    // Build File City URL
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const fileCityUrl = `${baseUrl}/api/file-city/${owner}/${repo}?width=400&height=300&nocache=1`;

    const duration = Date.now() - startTime;
    console.log('[Card API] Generated card:', { owner, repo, duration: `${duration}ms` });

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
              flexDirection: 'column',
              backgroundColor: cardBg,
              padding: '8px 12px 28px 12px',
              border: `4px solid ${cardBorder}`,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Header - Avatar and Stars */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 0,
                marginLeft: -12,
                marginRight: -12,
                marginTop: -8,
                minHeight: 24,
                position: 'relative',
                zIndex: 2,
              }}
            >
              {/* Owner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 10 }}>
                <img
                  src={`https://github.com/${owner}.png?size=80`}
                  alt={owner}
                  width={40}
                  height={40}
                  style={{
                    borderRight: '1px solid rgba(255,255,255,0.3)',
                    borderBottom: '1px solid rgba(255,255,255,0.3)',
                    marginBottom: -12,
                    backgroundColor: cardBorder,
                    position: 'relative',
                    zIndex: 10,
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#e0e0e0',
                    alignSelf: 'flex-end',
                  }}
                >
                  {owner}
                </span>
              </div>

              {/* Stars */}
              {stars > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    alignSelf: 'flex-end',
                    marginRight: 12,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: starColor }}>
                    {formatCount(stars)}
                  </span>
                  <span style={{ fontSize: 14, color: starColor }}>★</span>
                </div>
              )}
            </div>

            {/* Sprite Window */}
            <div
              style={{
                width: '100%',
                height: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(180deg, ${windowGradient[0]} 0%, ${windowGradient[1]} 100%)`,
                border: `2px solid ${cardHighlight}`,
                position: 'relative',
                overflow: 'hidden',
                zIndex: 1,
              }}
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

              {/* File count badge */}
              {fileCount > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: '2px 6px',
                    fontSize: 12,
                    color: '#e0e0e0',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 1h7l3 3v11H3V1z" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
                    <path d="M10 1v3h3" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
                  </svg>
                  {formatCount(fileCount)}
                </div>
              )}
            </div>

            {/* Name Plate */}
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: `linear-gradient(180deg, ${cardBorder} 0%, ${cardBg} 100%)`,
                padding: '6px 8px',
                border: `2px solid ${starColor}`,
              }}
            >
              <span
                style={{
                  fontSize: Math.max(8, Math.min(14, (14 * 24) / Math.max(repoData.name.length, 1))),
                  fontWeight: 700,
                  color: starColor,
                }}
              >
                {repoData.name}
              </span>
            </div>

            {/* Description Panel */}
            <div
              style={{
                marginTop: 0,
                padding: 8,
                background: `linear-gradient(180deg, ${panelGradient[0]} 0%, ${panelGradient[1]} 100%)`,
                borderLeft: `1px solid ${panelBorder}`,
                borderRight: `1px solid ${panelBorder}`,
                borderBottom: `1px solid ${panelBorder}`,
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              {repoData.description && (
                <span
                  style={{
                    fontSize: Math.max(9, 14 - Math.max(0, (repoData.description.length - 100) / 30)),
                    color: '#e0e0e0',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {repoData.description.slice(0, 200)}
                  {repoData.description.length > 200 ? '...' : ''}
                </span>
              )}
            </div>

            {/* Language badge - bottom left */}
            {repoData.language && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 4,
                  left: 8,
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#e0e0e0',
                }}
              >
                {repoData.language}
              </div>
            )}

            {/* License badge - bottom right */}
            {repoData.license?.spdx_id && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  backgroundColor: licenseBorder || cardHighlight,
                  padding: '3px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {repoData.license.spdx_id}
              </div>
            )}
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
