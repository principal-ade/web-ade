/**
 * Root OG Image (next/og based)
 *
 * GET /api/og — the 1200×628 branded social-preview PNG for the bare domain
 * (`app.principal-ade.com`) and any page that doesn't supply its own OG image.
 * Renders the same `TrailMarketingCardOG` the trail route falls back to, so an
 * unfurl of the root URL shows the "Code trails" marketing card instead of
 * nothing.
 *
 * Trail pages override this with `/api/og/trail/[id]` (real per-trail card).
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { TrailMarketingCardOG } from '@/components/trail/og/TrailMarketingCardOG';

const WIDTH = 1200;
const HEIGHT = 628;

export async function GET(request: NextRequest) {
  const noCache = request.nextUrl.searchParams.get('nocache') === '1';

  return new ImageResponse(<TrailMarketingCardOG />, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      'Cache-Control': noCache
        ? 'no-store'
        : 'public, max-age=3600, s-maxage=86400',
    },
  });
}
