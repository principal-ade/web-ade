'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useMemo } from 'react';

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface FileCityProps {
  className?: string;
  cols?: number;
  rows?: number;
  cellW?: number;
  cellH?: number;
  /** Outer padding between the city and the SVG edge, in viewBox units. */
  padding?: number;
  /** Seed for the deterministic RNG that picks building sizes + colors. */
  seed?: number;
  /** Probability [0..1] that a non-pinned cell is left empty. */
  skipChance?: number;
  /** Optional grid cells to force as full-sized buildings (e.g. for
   *  markers that will be layered on top by a parent). */
  pinnedCells?: ReadonlyArray<{ col: number; row: number }>;
  /** Override the fill palette. Defaults to theme-derived tints. */
  palette?: ReadonlyArray<string>;
  /** Render the rounded dark background rect. Turn off if the city is
   *  being composited onto an existing surface. */
  showBackground?: boolean;
  /** Fade-to-background gradient strip along the bottom edge, matching
   *  the look used on the landing page. */
  showBottomFade?: boolean;
}

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

function withAlpha(color: string, alpha: number): string {
  if (/^#([0-9a-f]{3}){1,2}$/i.test(color)) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, '0');
    return `#${hex}${a}`;
  }
  return color;
}

function buildCity(
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  offsetX: number,
  offsetY: number,
  palette: ReadonlyArray<string>,
  pinned: ReadonlySet<string>,
  seed: number,
  skipChance: number,
): Building[] {
  const rng = mulberry32(seed);
  const cells: Building[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isPinned = pinned.has(`${c},${r}`);
      const skipRoll = rng();
      // Roll sizes to keep the RNG sequence stable across visual
      // tweaks, even though uniform mode ignores them.
      rng();
      rng();
      const colorRoll = rng();
      if (!isPinned && skipRoll < skipChance) continue;
      const w = cellW - 8;
      const h = cellH - 8;
      cells.push({
        x: offsetX + c * cellW + (cellW - w) / 2,
        y: offsetY + r * cellH + (cellH - h) / 2,
        w,
        h,
        fill: palette[Math.floor(colorRoll * palette.length)]!,
      });
    }
  }
  return cells;
}

/**
 * Theme-driven top-down "file city" — a grid of building rectangles with
 * varied size and tint. Extracted from `TrailCityDiagram` so the city
 * can be reused on its own (without markers, trail, snippet, or
 * collaboration stamps).
 */
export function FileCity({
  className,
  cols = 12,
  rows = 12,
  cellW = 50,
  cellH = 50,
  padding = 40,
  seed = 7,
  skipChance = 0.18,
  pinnedCells,
  palette: paletteProp,
  showBackground = true,
  showBottomFade = false,
}: FileCityProps) {
  const { theme } = useTheme();
  const accent = theme.colors.primary ?? '#22d3ee';
  const text = theme.colors.text ?? '#f8fafc';
  const bg = theme.colors.background ?? '#0a0f14';

  const viewW = cols * cellW + padding * 2;
  const viewH = rows * cellH + padding * 2;

  const palette = useMemo(
    () =>
      paletteProp ?? [
        withAlpha(accent, 0.18),
        withAlpha(accent, 0.32),
        withAlpha(text, 0.08),
        withAlpha(text, 0.14),
        withAlpha(text, 0.22),
      ],
    [paletteProp, accent, text],
  );

  const pinned = useMemo(
    () => new Set((pinnedCells ?? []).map(p => `${p.col},${p.row}`)),
    [pinnedCells],
  );

  const buildings = useMemo(
    () =>
      buildCity(
        cols,
        rows,
        cellW,
        cellH,
        padding,
        padding,
        palette,
        pinned,
        seed,
        skipChance,
      ),
    [cols, rows, cellW, cellH, padding, palette, pinned, seed, skipChance],
  );

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className={className}
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
      role="img"
      aria-label="A top-down city of files"
    >
      {showBottomFade && (
        <defs>
          <linearGradient id="file-city-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={bg} stopOpacity={0} />
            <stop offset="100%" stopColor={bg} stopOpacity={0.7} />
          </linearGradient>
        </defs>
      )}

      {showBackground && (
        <rect x={0} y={0} width={viewW} height={viewH} fill={bg} rx={12} />
      )}

      {buildings.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill={b.fill}
          stroke={withAlpha(text, 0.08)}
          strokeWidth={0.5}
          rx={2}
        />
      ))}

      {showBottomFade && (
        <rect
          x={0}
          y={viewH - 80}
          width={viewW}
          height={80}
          fill="url(#file-city-fade)"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
