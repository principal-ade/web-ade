/**
 * Trail File City map image — `GET /api/og/trail/[id]/map`.
 *
 * Renders ONLY the trail's File City touched-file map (the same
 * `FileMapPanel` the full OG card uses) as a square PNG, so the live feed
 * `TrailCard` can drop it in as a lazy `<img>` without building the city on the
 * client. Phase 1 of the feed map; later replaceable by a live highlight map.
 *
 * Resolves straight from S3 (id pointer → payload) and trusts the index's
 * stamped `repoVisibility` — the SAME public signal the feed
 * (`listPublicTrails`) already uses. This deliberately avoids the per-request
 * anonymous GitHub access check the full OG card does: the feed loads many maps
 * at once, and a burst of unauthenticated GitHub probes blows the 60/hr
 * anonymous rate limit, blanking every map. The city build still goes through
 * `/api/file-city-data` (server `GITHUB_TOKEN`, cached). On a private/missing
 * trail or any error we return a blank panel — never a 500, never leaking a
 * private trail's structure.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { FileMapPanel } from '@/components/trail/og/TrailFileMapPanel';
import { OG_COLORS } from '@/components/trail/og/ogTheme';
import { buildTrailFileMap } from '@/lib/trails/trail-file-map';
import { getIdPointer, getIndex, getPayload } from '@/lib/trails/s3-storage';

const MAP_SIZE = 500;

/** A blank square panel — the graceful fallback when there's no map. */
function blankPanel() {
  return (
    <div
      style={{
        display: 'flex',
        width: MAP_SIZE,
        height: MAP_SIZE,
        background: OG_COLORS.backgroundSecondary,
      }}
    />
  );
}

function mapResponse(node: React.ReactElement, noCache: boolean) {
  return new ImageResponse(node, {
    width: MAP_SIZE,
    height: MAP_SIZE,
    headers: {
      'Cache-Control': noCache
        ? 'no-store'
        : 'public, max-age=3600, s-maxage=86400',
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const noCache = request.nextUrl.searchParams.get('nocache') === '1';

  try {
    const { id } = await params;

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host}`;

    // Resolve from S3 — no anonymous GitHub access check (see file header).
    const pointer = await getIdPointer(id);
    if (!pointer) return mapResponse(blankPanel(), noCache);
    const { owner, repo } = pointer;

    // Only render maps for repos the index has stamped public — same signal
    // the feed trusts. Missing/private → blank, so we never leak structure.
    const index = await getIndex(owner, repo);
    if (index.repoVisibility !== 'public') return mapResponse(blankPanel(), noCache);

    const payload = await getPayload(owner, repo, id);
    if (!payload) return mapResponse(blankPanel(), noCache);

    const fileMap = await buildTrailFileMap(baseUrl, owner, repo, payload, MAP_SIZE);
    if (!fileMap) return mapResponse(blankPanel(), noCache);

    return mapResponse(<FileMapPanel map={fileMap} standalone />, noCache);
  } catch (error) {
    console.error('[Trail map OG] Error generating image:', error);
    return mapResponse(blankPanel(), noCache);
  }
}
