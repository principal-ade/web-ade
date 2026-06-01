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
import {
  ogDateStamp,
  ogEyebrow,
  ogStripMarkdown,
  ogTruncate,
} from '@/components/trail/og/ogTheme';
import type { TrailPayload } from '@/lib/trails/types';

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

    const { payload }: ByIdResponse = await res.json();

    const isShared = !!payload.share;
    const request_ = payload.request?.trim();
    const heading =
      isShared && request_ && request_.length > 0 ? request_ : payload.title;

    const signOffs = payload.signOffs ?? [];
    const reviewers = signOffs.map((s) => s.author).filter(Boolean);
    const noteAuthorCount = new Set(
      (payload.notes ?? []).map((n) => n.author).filter(Boolean),
    ).size;
    const visitorCount =
      (payload.visitors?.named.length ?? 0) +
      (payload.visitors?.anonymousCount ?? 0);

    // ~200 chars ≈ 3 lines at the body's 26px size — keeps the summary clear
    // of the footer strip (the live Satori build ignores `lineClamp`).
    const summary = payload.summary
      ? ogTruncate(ogStripMarkdown(payload.summary), 200)
      : undefined;

    return ogResponse(
      <TrailBriefCardOG
        heading={heading}
        eyebrow={ogEyebrow(payload.purpose, signOffs.length > 0)}
        author={payload.author}
        createdLabel={ogDateStamp(payload.createdAt, Date.now()) ?? undefined}
        summary={summary}
        stopCount={payload.markers?.length ?? 0}
        reviewers={reviewers}
        noteAuthorCount={noteAuthorCount}
        visitorCount={visitorCount}
      />,
      noCache,
    );
  } catch (error) {
    console.error('[Trail OG] Error generating image:', error);
    // Never 500 to a crawler — fall back to the branded card.
    return ogResponse(<TrailMarketingCardOG />, noCache);
  }
}
