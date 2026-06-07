/**
 * Trail OG Image Generation API (next/og based)
 *
 * GET /api/og/trail/[id] — generate the 1200×628 social-preview PNG for a
 * shared trail. Mirrors `/api/card/[owner]/[repo]` (Satori-based
 * `ImageResponse`).
 *
 * Public vs. private fork: crawlers fetch this unauthenticated, so we hit the
 * by-id resolver WITHOUT forwarding the caller's auth — exactly what a
 * crawler sees. The by-id route returns 200 for publicly-readable trails and
 * 403/404 otherwise (it verifies repo access live with no token). On 200 we
 * render the real `TrailBriefCardOG`; on anything else we render the branded
 * `TrailMarketingCardOG` so a private trail's title/summary never leaks into
 * an unfurl.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { TrailBriefCardOG } from '@/components/trail/og/TrailBriefCardOG';
import { TrailMarketingCardOG } from '@/components/trail/og/TrailMarketingCardOG';
import { buildTrailFileMap } from '@/lib/trails/trail-file-map';
import type { TrailPayload } from '@/lib/trails/types';

// File City map panel size (matches `TrailBriefCardOG`'s right panel).
const MAP_SIZE = 500;

const WIDTH = 1200;
const HEIGHT = 628;

interface ByIdResponse {
  owner: string;
  repo: string;
  payload: TrailPayload;
}

function ogResponse(node: React.ReactElement, noCache: boolean) {
  return new ImageResponse(node, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      'Cache-Control': noCache
        ? 'no-store'
        : 'public, max-age=3600, s-maxage=86400',
    },
  });
}

/**
 * GitHub avatar → data URI (best-effort). `handle` is used as a GitHub login;
 * for the repo owner that's exact, for the trail author it's a best guess
 * (falls back to no avatar on a 404). Inlining as a data URI means Satori
 * doesn't have to fetch a redirecting URL at render time.
 */
async function ghAvatarDataUri(handle: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://github.com/${encodeURIComponent(handle)}.png?size=120`);
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${r.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const noCache = request.nextUrl.searchParams.get('nocache') === '1';

  try {
    const { id } = await params;

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host}`;

    // Crawler-equivalent fetch: no auth forwarded, so the resolver only
    // succeeds for publicly-readable trails.
    const res = await fetch(`${baseUrl}/api/trails/by-id/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return ogResponse(<TrailMarketingCardOG />, noCache);
    }

    const { owner, repo, payload }: ByIdResponse = await res.json();

    // Build the trail's File City map: the same full-tree → touched-files
    // projection the preview uses, sourced from this trail's repo + markers.
    // Best-effort — a tree-fetch failure just drops the map, never the card.
    const fileMap = await buildTrailFileMap(baseUrl, owner, repo, payload, MAP_SIZE);

    const isShared = !!payload.share;
    const request_ = payload.request?.trim();
    const heading =
      isShared && request_ && request_.length > 0 ? request_ : payload.title;

    // Avatars (best-effort): owner is an exact GitHub login; author is a guess.
    const ownerAvatarUrl = await ghAvatarDataUri(owner);
    const authorAvatarUrl = payload.author
      ? await ghAvatarDataUri(payload.author)
      : undefined;

    return ogResponse(
      <TrailBriefCardOG
        heading={heading}
        author={
          payload.author
            ? { name: payload.author, avatarUrl: authorAvatarUrl }
            : undefined
        }
        repo={{ name: repo, avatarUrl: ownerAvatarUrl }}
        owner={owner}
        fileMap={fileMap}
      />,
      noCache,
    );
  } catch (error) {
    console.error('[Trail OG] Error generating image:', error);
    // Never 500 to a crawler — fall back to the branded card.
    return ogResponse(<TrailMarketingCardOG />, noCache);
  }
}
