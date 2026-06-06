/**
 * `TrailMarketingCardOG` — the fallback social-preview card for trails that
 * aren't publicly viewable (private repo, not-found, or access-gated), and the
 * card the bare domain (`/api/og`) unfurls.
 *
 * Crawlers fetch the OG image unauthenticated, so a private trail's real
 * title/summary must never appear in an unfurl. Instead we show a branded
 * "Code trails" card mirroring the home hero (`src/app/page.tsx`): a
 * left-aligned headline + tagline beside the File City diagram — a top-down
 * grid of file squares with a dashed trail wiring numbered markers, the same
 * look as `TrailCityDiagram` on the landing page.
 *
 * Satori-safe (see `ogTheme.ts`): the city grid + markers are plain
 * absolutely-positioned divs, the dashed trail is one inline SVG `<path>`, the
 * footprints are inlined SVG, and every color is baked hex from
 * `iceTangerineDarkTheme` (the alpha tints `TrailCityDiagram` derives at
 * runtime are precomputed, blended over the background). Same component renders
 * in the OG route and in Storybook.
 */

import React from 'react';
import { OG_COLORS, OG_FONT } from './ogTheme';

export interface TrailMarketingCardOGProps {
  /** Headline (default: "Code trails"). */
  headline?: string;
  /** Tagline under the headline (matches the home hero). */
  tagline?: string;
}

// File City grid geometry (panel-space px; the panel is its own coord system).
const CITY = 540;
const CELL = 42;
const OFFSET = 18;
const COLS = 12;
const ROWS = 12;
const SQUARE = CELL - 8; // inset so squares read as separate "files"

/**
 * `TrailCityDiagram`'s precomputed building palette — the live diagram tints
 * `primary`/`text` with alpha at runtime; Satori can't, so these are blended
 * over the `#0d274d` background ahead of time. Keep in sync with `ogTheme.ts`.
 */
const CITY_PALETTE = [
  '#393349', // primary @ 0.18
  '#5a3d45', // primary @ 0.32
  '#1d365a', // text @ 0.08
  '#284263', // text @ 0.14
  '#385170', // text @ 0.22
] as const;

/** Deterministic RNG (mulberry32) — same seed/draw order as `TrailCityDiagram`
 *  so the marketing grid matches the landing diagram's layout. */
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface Cell {
  x: number;
  y: number;
  fill: string;
}

/** Numbered marker cells (col,row) the dashed trail walks through, in order. */
const MARKER_CELLS: Array<{ col: number; row: number; label: string }> = [
  { col: 1, row: 10, label: '1' },
  { col: 3, row: 8, label: '2' },
  { col: 5, row: 10, label: '3' },
  { col: 3, row: 6, label: '4' },
];

function cellCenter(col: number, row: number) {
  return { x: OFFSET + col * CELL + CELL / 2, y: OFFSET + row * CELL + CELL / 2 };
}

/** Build the top-down city grid (some cells skipped to break up the grid). */
function buildCity(pinned: ReadonlySet<string>): Cell[] {
  const rng = mulberry32(7);
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isPinned = pinned.has(`${c},${r}`);
      const skipRoll = rng();
      rng(); // keep the draw sequence aligned with TrailCityDiagram
      rng();
      const colorRoll = rng();
      if (!isPinned && skipRoll < 0.18) continue;
      cells.push({
        x: OFFSET + c * CELL + 4,
        y: OFFSET + r * CELL + 4,
        fill: CITY_PALETTE[Math.floor(colorRoll * CITY_PALETTE.length)]!,
      });
    }
  }
  return cells;
}

/** The File City diagram — top-down file grid + dashed trail + numbered
 *  markers, anchored on the right of the card. An optional caption sits over a
 *  bottom fade (mirroring `TrailCityDiagram`'s fade-to-background strip). */
function FileCity({ caption }: { caption?: string }) {
  const pinned = new Set(MARKER_CELLS.map((m) => `${m.col},${m.row}`));
  const cells = buildCity(pinned);
  const markers = MARKER_CELLS.map((m) => ({ ...cellCenter(m.col, m.row), label: m.label }));
  const trailPath =
    `M ${markers[0]!.x} ${markers[0]!.y} ` +
    markers
      .slice(1)
      .map((m) => `L ${m.x} ${m.y}`)
      .join(' ');

  // Leader line from the active (last) marker up to the snippet card's
  // header (left edge, header centerline) — VH L-route, mirroring
  // `TrailCityDiagram`'s leader. Card is at (276,40); header is 34px tall.
  const active = markers[markers.length - 1]!;
  const anchor = { x: 244, y: 53 };
  const leaderPath =
    `M ${active.x} ${active.y} L ${active.x} ${anchor.y + 12} ` +
    `Q ${active.x} ${anchor.y} ${active.x + 12} ${anchor.y} L ${anchor.x} ${anchor.y}`;

  // Highlight the first token of the caption (e.g. "Frame.io") in the brand
  // color; the rest stays body text. Each word is its own flex item so the
  // line wraps word-by-word; the last two words are joined by a non-breaking
  // space so they stay together (e.g. "code collaboration").
  const rawWords = (caption ?? '').split(' ');
  const capWords =
    rawWords.length > 2
      ? [...rawWords.slice(0, -2), rawWords.slice(-2).join(' ')]
      : rawWords;

  return (
    <div
      style={{
        position: 'absolute',
        top: 44,
        right: 50,
        width: CITY,
        height: CITY,
        display: 'flex',
        background: OG_COLORS.backgroundSecondary,
        border: `1px solid ${OG_COLORS.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* File squares */}
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            width: SQUARE,
            height: SQUARE,
            background: c.fill,
            borderRadius: 2,
            display: 'flex',
          }}
        />
      ))}

      {/* Dashed trail polyline wiring the markers + leader to the card */}
      <svg
        width={CITY}
        height={CITY}
        viewBox={`0 0 ${CITY} ${CITY}`}
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
        />
        {caption && (
          <g>
            <path
              d={leaderPath}
              fill="none"
              stroke={OG_COLORS.primary}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.7}
            />
            <circle cx={anchor.x} cy={anchor.y} r={3.5} fill={OG_COLORS.primary} />
          </g>
        )}
      </svg>

      {/* Numbered markers — active (last) one gets a soft glow ring */}
      {markers.map((m, i) => {
        const active = i === markers.length - 1;
        const size = 24;
        return (
          <React.Fragment key={m.label}>
            {active && (
              <div
                style={{
                  position: 'absolute',
                  left: m.x - size / 2 - 6,
                  top: m.y - size / 2 - 6,
                  width: size + 12,
                  height: size + 12,
                  background: OG_COLORS.primary,
                  opacity: 0.2,
                  borderRadius: 8,
                  display: 'flex',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                left: m.x - size / 2,
                top: m.y - size / 2,
                width: size,
                height: size,
                background: OG_COLORS.surface,
                border: `2px solid ${OG_COLORS.primary}`,
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: OG_COLORS.text,
              }}
            >
              {m.label}
            </div>
          </React.Fragment>
        );
      })}

      {/* Snippet card floating over the city (mirrors `TrailCityDiagram`'s
        * SnippetCard) — wired to the active marker, holding the tagline. */}
      {caption && (
        <div
          style={{
            position: 'absolute',
            left: 244,
            top: 36,
            width: 264,
            display: 'flex',
            flexDirection: 'column',
            background: OG_COLORS.surface,
            border: `1.5px solid ${OG_COLORS.primary}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Header band — filename */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 34,
              padding: '0 16px',
              background: '#2c3554',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 14,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: OG_COLORS.textTertiary,
              }}
            >
              feature.ts
            </div>
          </div>
          {/* Body — the tagline, with the lead token brand-colored */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              columnGap: 8,
              rowGap: 2,
              padding: '18px 16px 20px',
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {capWords.map((w, i) => (
              <span
                key={i}
                style={{ display: 'flex', color: i === 0 ? OG_COLORS.primary : OG_COLORS.text }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  headline = 'Code Trails',
  tagline = 'Frame.io for code collaboration',
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
      {/* File City diagram — right side, mirroring the home hero layout. */}
      <FileCity caption={tagline} />

      {/* Hero content — left-aligned, footprints walk toward the city. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          width: 600,
          height: 628,
          padding: '0 80px',
          transform: 'translateY(-36px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 38, marginBottom: 28, height: 56 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Footprint key={i} side={i % 2 === 0 ? 'left' : 'right'} size={18} color={OG_COLORS.primary} />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 0.95,
            whiteSpace: 'nowrap',
            color: OG_COLORS.primary,
          }}
        >
          {headline}
        </div>

        {/* "by Principal AI" byline. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginTop: 18,
            fontSize: 30,
            fontWeight: 600,
          }}
        >
          <span style={{ color: OG_COLORS.textTertiary }}>by</span>
          <span style={{ color: OG_COLORS.text }}>Principal</span>
          <span style={{ color: OG_COLORS.primary }}>AI</span>
        </div>
      </div>
    </div>
  );
}
