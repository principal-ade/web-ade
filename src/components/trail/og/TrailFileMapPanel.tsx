/**
 * `FileMapPanel` — the Satori-safe File City map for the trail OG cards.
 *
 * Lifted out of `TrailBriefCardOG` so it can be rendered standalone as a
 * map-only image (`/api/og/trail/[id]/map`) for the live feed `TrailCard`, as
 * well as inline in the full OG card. Renders the directory districts (back
 * layer), the trail's touched-file squares (colored by file type), the dashed
 * trail threading them in order, and a stop dot at each. Pure presentational +
 * inline styles; every container sets `display: flex` (Satori requirement).
 *
 * The map geometry is computed upstream (`projectTouchedCity` /
 * `buildTrailFileMap`) and passed in via `map`, so this stays presentational.
 */

import React from 'react';
import { OG_COLORS } from './ogTheme';
import type { FileMapData } from './fileCityProjection';

/**
 * The File City map panel — touched-file squares + dashed trail.
 *
 * By default it's absolutely placed on the right of the 1200×628 OG card. Pass
 * `standalone` to render it as a self-contained `map.w`×`map.h` box (no card
 * offset) — used by the map-only image route.
 */
export function FileMapPanel({
  map,
  standalone = false,
}: {
  map: FileMapData;
  standalone?: boolean;
}) {
  const trailPath =
    map.centers.length > 1
      ? `M ${map.centers[0]!.x} ${map.centers[0]!.y} ` +
        map.centers
          .slice(1)
          .map((c) => `L ${c.x} ${c.y}`)
          .join(' ')
      : '';

  return (
    <div
      style={{
        position: standalone ? 'relative' : 'absolute',
        // Standalone (feed card): fill the slot flush — no border/radius, since
        // the card's own rounded clip handles corners. Inside the OG card: a
        // bordered, rounded panel floating on the dark card.
        ...(standalone
          ? { borderRadius: 0 }
          : {
              top: (628 - map.h) / 2,
              right: 50,
              border: `1px solid ${OG_COLORS.border}`,
              borderRadius: 0,
            }),
        width: map.w,
        height: map.h,
        display: 'flex',
        background: OG_COLORS.backgroundSecondary,
        overflow: 'hidden',
      }}
    >
      {/* Directory platforms — back layer, the whole repo's folder structure. */}
      {map.districts.map((d, i) => (
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.w,
            height: d.h,
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${OG_COLORS.border}`,
            borderRadius: 0,
            display: 'flex',
          }}
        />
      ))}

      {/* Touched file squares, colored by file type. */}
      {map.rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: r.color,
            borderRadius: 0,
            display: 'flex',
          }}
        />
      ))}

      {/* Dashed trail above the file squares. */}
      {trailPath ? (
        <svg
          width={map.w}
          height={map.h}
          viewBox={`0 0 ${map.w} ${map.h}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <path
            d={trailPath}
            fill="none"
            stroke={OG_COLORS.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 5"
            opacity={0.85}
          />
        </svg>
      ) : null}

      {/* Stop dots — one per touched building center, on top of the trail. */}
      {map.centers.map((c, i) => {
        const d = 11;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.x - d / 2,
              top: c.y - d / 2,
              width: d,
              height: d,
              borderRadius: 9999,
              background: OG_COLORS.primary,
              border: `2px solid ${OG_COLORS.background}`,
              display: 'flex',
            }}
          />
        );
      })}
    </div>
  );
}
