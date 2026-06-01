/**
 * `TrailMarketingCardOG` — the fallback social-preview card for trails that
 * aren't publicly viewable (private repo, not-found, or access-gated).
 *
 * Crawlers fetch the OG image unauthenticated, so a private trail's real
 * title/summary must never appear in an unfurl. Instead we show a branded
 * "Code trails" card styled after the home page hero (`src/app/page.tsx`):
 * the ambient block backdrop (`TrailBackdrop`) + the orange "Code trails"
 * headline + tagline + Principal AI mark.
 *
 * Satori-safe (see `ogTheme.ts`): the backdrop is plain absolutely-positioned
 * divs, the footprints are inlined SVG, and theme colors are baked hex. Same
 * component renders in the OG route and in Storybook.
 */

import React from 'react';
import { OG_COLORS, OG_FONT } from './ogTheme';

export interface TrailMarketingCardOGProps {
  /** Headline (default: "Code trails"). */
  headline?: string;
  /** Tagline under the headline (matches the home hero). */
  tagline?: string;
}

/** Ambient block field, ported/scaled from `TrailBackdrop` for 1200×628. */
const BLOCKS: Array<{ x: number; y: number; w: number; h: number; fill: string; op: number }> = [
  { x: 40, y: 60, w: 150, h: 116, fill: OG_COLORS.primary, op: 0.5 },
  { x: 230, y: 30, w: 92, h: 150, fill: OG_COLORS.accent, op: 0.4 },
  { x: 360, y: 90, w: 132, h: 108, fill: OG_COLORS.primary, op: 0.32 },
  { x: 980, y: 40, w: 116, h: 142, fill: OG_COLORS.accent, op: 0.42 },
  { x: 1120, y: 80, w: 150, h: 120, fill: OG_COLORS.primary, op: 0.34 },
  { x: 60, y: 270, w: 124, h: 108, fill: OG_COLORS.accent, op: 0.36 },
  { x: 1050, y: 250, w: 132, h: 140, fill: OG_COLORS.accent, op: 0.38 },
  { x: 40, y: 470, w: 166, h: 116, fill: OG_COLORS.accent, op: 0.36 },
  { x: 250, y: 500, w: 108, h: 92, fill: OG_COLORS.primary, op: 0.3 },
  { x: 880, y: 480, w: 166, h: 124, fill: OG_COLORS.primary, op: 0.32 },
  { x: 1090, y: 500, w: 150, h: 116, fill: OG_COLORS.accent, op: 0.34 },
  { x: 470, y: 510, w: 150, h: 100, fill: OG_COLORS.primary, op: 0.22 },
  { x: 660, y: 500, w: 132, h: 108, fill: OG_COLORS.accent, op: 0.24 },
];

/** Footprint glyph, ported from `Footprint` in `src/app/page.tsx`. */
function Footprint({ side, size, color }: { side: 'left' | 'right'; size: number; color: string }) {
  // Rotated 90° to walk left→right; alternating feet step above/below the
  // centerline (matching the home hero's translateY offset).
  return (
    <svg
      width={size}
      height={size * (18 / 9)}
      viewBox="2 1 9 18"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: `translateY(${side === 'left' ? '-8px' : '8px'}) rotate(90deg)${side === 'right' ? ' scaleX(-1)' : ''}`,
      }}
    >
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M4 13h4" />
    </svg>
  );
}

export function TrailMarketingCardOG({
  headline = 'Code trails',
  tagline = 'A new way to collaborate on software',
}: TrailMarketingCardOGProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: 1200,
        height: 628,
        background: OG_COLORS.background,
        fontFamily: OG_FONT,
        overflow: 'hidden',
      }}
    >
      {/* Ambient backdrop — out-of-focus city blocks. */}
      <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', width: 1200, height: 628 }}>
        {BLOCKS.map((b, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              background: b.fill,
              opacity: b.op,
              borderRadius: 4,
            }}
          />
        ))}
      </div>

      {/* Hero content */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 1200,
          height: 628,
          padding: '0 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 28, height: 56 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Footprint key={i} side={i % 2 === 0 ? 'left' : 'right'} size={18} color={OG_COLORS.primary} />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 110,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 0.95,
            color: OG_COLORS.primary,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: 34,
            color: OG_COLORS.text,
          }}
        >
          {tagline}
        </div>

        {/* Principal AI brand mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            position: 'absolute',
            bottom: 44,
            fontSize: 26,
            fontWeight: 600,
          }}
        >
          <span style={{ color: OG_COLORS.text }}>Principal</span>
          <span style={{ color: OG_COLORS.primary }}>AI</span>
        </div>
      </div>
    </div>
  );
}
