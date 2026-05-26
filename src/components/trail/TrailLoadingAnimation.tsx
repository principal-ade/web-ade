'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTheme } from '@principal-ade/industry-theme';

// useLayoutEffect warns under SSR; fall back to useEffect on the server.
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface TrailLoadingAnimationProps {
  /** Pixel width of the animation. When omitted, the component measures its parent. */
  width?: number;
  /** Pixel height of the animation. When omitted, the component measures its parent. */
  height?: number;
  /** Number of grid columns. When omitted, derived from measured width. */
  cols?: number;
  /** Number of grid rows. When omitted, derived from measured height. */
  rows?: number;
  /** Optional message rendered under the animation */
  message?: string;
  /** Milliseconds per draw cycle */
  cycleDuration?: number;
  /** Maximum number of trails kept on screen at once */
  maxTrails?: number;
  /** 0..1 — probability that a given column is included in a trail */
  density?: number;
  /** Upper bound for the fluid surface (px). Ignored when width is set explicitly. Pass Infinity to disable. */
  maxWidth?: number;
  /** Upper bound for the fluid surface (px). Ignored when height is set explicitly. Pass Infinity to disable. */
  maxHeight?: number;
  /** Approximate target cell size (px) when auto-deriving cols/rows */
  targetCellSize?: number;
  /** Padding (px) reserved around the grid inside the measured surface */
  padding?: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PickedRow {
  col: number;
  row: number;
}

function pickTrailRows(
  cols: number,
  rows: number,
  density: number,
  seed: number,
): PickedRow[] {
  const rand = mulberry32(seed);

  // Choose which columns to include based on density. Ensure at least 3
  // points so we always render a meaningful path.
  const selected: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (rand() < density) selected.push(c);
  }
  const minPts = Math.min(3, cols);
  while (selected.length < minPts) {
    const c = Math.floor(rand() * cols);
    if (!selected.includes(c)) selected.push(c);
  }
  selected.sort((a, b) => a - b);

  const picks: PickedRow[] = [];
  let lastRow = Math.floor(rand() * rows);
  for (const c of selected) {
    const drift = Math.floor(rand() * 5) - 2; // -2..+2
    let r = lastRow + drift;
    if (r < 0) r = 0;
    if (r > rows - 1) r = rows - 1;
    picks.push({ col: c, row: r });
    lastRow = r;
  }
  return picks;
}

interface Trail {
  id: number;
  color: string;
  picks: PickedRow[];
}

interface ResolvedTrail extends Trail {
  points: { col: number; row: number; cx: number; cy: number }[];
  pathD: string;
}

function trailColor(id: number): string {
  // Golden-angle hue rotation gives well-separated colors.
  const hue = (id * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 78%, 62%)`;
}

const FLUID_FALLBACK_W = 480;
const FLUID_FALLBACK_H = 480;

export const TrailLoadingAnimation: React.FC<TrailLoadingAnimationProps> = ({
  width: widthProp,
  height: heightProp,
  cols: colsProp,
  rows: rowsProp,
  message = 'Loading trail',
  cycleDuration = 4500,
  maxTrails = 6,
  density = 0.55,
  maxWidth = Infinity,
  maxHeight = Infinity,
  targetCellSize = 40,
  padding = 24,
}) => {
  const { theme } = useTheme();

  const fluid = widthProp == null || heightProp == null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number }>({
    w: widthProp ?? FLUID_FALLBACK_W,
    h: heightProp ?? FLUID_FALLBACK_H,
  });
  const [ready, setReady] = useState<boolean>(!fluid);

  useIsoLayoutEffect(() => {
    if (!fluid) {
      setReady(true);
      return;
    }
    const el = containerRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const update = () => {
      // Measure the PARENT's available space, then collapse to a square so
      // the grid never ends up rectangular. Measuring the container itself
      // would just echo whatever rectangle CSS gave it.
      const rect = parent.getBoundingClientRect();
      const side = Math.min(
        Math.max(120, Math.min(maxWidth, rect.width || FLUID_FALLBACK_W)),
        Math.max(120, Math.min(maxHeight, rect.height || FLUID_FALLBACK_H)),
      );
      setMeasured((prev) =>
        Math.abs(prev.w - side) < 0.5 && Math.abs(prev.h - side) < 0.5
          ? prev
          : { w: side, h: side },
      );
      setReady(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [fluid, maxWidth, maxHeight]);

  const width = widthProp ?? measured.w;
  const height = heightProp ?? measured.h;

  // Usable area shrinks by the padding so the grid never reaches the
  // container edge by default. When auto-deriving cols/rows we collapse
  // to a single side length so the grid stays square — independent
  // width/height-based counts produced a wide rectangle.
  const usableW = Math.max(60, width - padding * 2);
  const usableH = Math.max(60, height - padding * 2);
  const usableSide = Math.min(usableW, usableH);

  const autoCount = Math.max(
    6,
    Math.min(16, Math.round(usableSide / targetCellSize)),
  );
  const cols = colsProp ?? autoCount;
  const rows = rowsProp ?? autoCount;

  // Single cell pitch so the grid is genuinely square — independent
  // width/cols vs height/rows would give rectangular cells.
  const cellSize = Math.min(usableW / cols, usableH / rows);
  const cellW = cellSize;
  const cellH = cellSize;
  const gridW = cellSize * cols;
  const gridH = cellSize * rows;
  const squareSize = cellSize * 0.62;
  const dotR = squareSize * 0.14;

  const cells = useMemo(() => {
    const out: { col: number; row: number; cx: number; cy: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({
          col: c,
          row: r,
          cx: cellW * (c + 0.5),
          cy: cellH * (r + 0.5),
        });
      }
    }
    return out;
  }, [cols, rows, cellW, cellH]);

  const buildTrail = useMemo(
    () =>
      (id: number): Trail => ({
        id,
        color: trailColor(id),
        picks: pickTrailRows(cols, rows, density, 0x1337 + id * 17),
      }),
    [cols, rows, density],
  );

  const [trails, setTrails] = useState<Trail[]>(() => [buildTrail(0)]);

  // When the grid shape changes (resize, prop change), regenerate picks so
  // trails stay on-grid. Layout effect so the corrected picks are committed
  // before the browser paints — otherwise the first paint shows a trail
  // computed against the previous grid and the user sees it "snap".
  useIsoLayoutEffect(() => {
    setTrails((prev) =>
      prev.map((t) => ({
        ...t,
        picks: pickTrailRows(cols, rows, density, 0x1337 + t.id * 17),
      })),
    );
  }, [cols, rows, density]);

  useEffect(() => {
    let nextId = (trails[trails.length - 1]?.id ?? 0) + 1;
    const id = window.setInterval(() => {
      const newTrail = buildTrail(nextId++);
      setTrails((prev) => {
        const next = [...prev, newTrail];
        if (next.length > maxTrails) next.splice(0, next.length - maxTrails);
        return next;
      });
    }, cycleDuration);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildTrail, cycleDuration, maxTrails]);

  const resolvedTrails: ResolvedTrail[] = useMemo(
    () =>
      trails.map((t) => {
        const points = t.picks.map((p) => ({
          col: p.col,
          row: p.row,
          cx: cellW * (p.col + 0.5),
          cy: cellH * (p.row + 0.5),
        }));
        const pathD = points
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`,
          )
          .join(' ');
        return { ...t, points, pathD };
      }),
    [trails, cellW, cellH],
  );

  const latest = resolvedTrails[resolvedTrails.length - 1];
  const settled = resolvedTrails.slice(0, -1);

  // Map of "col:row" -> array of trails passing through that cell (for
  // persisted colored dot stacks on settled trails).
  const settledHits = useMemo(() => {
    const m = new Map<string, ResolvedTrail[]>();
    for (const t of settled) {
      for (const p of t.points) {
        const k = `${p.col}:${p.row}`;
        const arr = m.get(k) ?? [];
        arr.push(t);
        m.set(k, arr);
      }
    }
    return m;
  }, [settled]);

  const drawDuration = cycleDuration * 0.85;

  // Per-point arrival delays based on cumulative segment length, so each
  // square pops exactly when the (linearly drawn) line tip reaches it.
  const latestDelays = useMemo<number[]>(() => {
    if (!latest) return [];
    const pts = latest.points;
    if (pts.length === 0) return [];
    const cum: number[] = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      total += Math.hypot(b.cx - a.cx, b.cy - a.cy);
      cum.push(total);
    }
    if (total === 0) return pts.map(() => 0);
    return cum.map((d) => (d / total) * drawDuration);
  }, [latest, drawDuration]);

  const borderColor = theme.colors.border ?? `${theme.colors.text}33`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        width: fluid ? '100%' : undefined,
        height: fluid ? '100%' : undefined,
      }}
    >
      {message && (
        <div
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[4] ?? '1.5rem',
            fontWeight: 600,
            letterSpacing: '0.01em',
            color: theme.colors.textMuted,
            animation: 'trailTextPulse 2s ease-in-out infinite',
          }}
        >
          {message}
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width: fluid ? measured.w : width,
          height: fluid ? measured.h : height,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ready && (
        <svg
          width={gridW}
          height={gridH}
          viewBox={`0 0 ${gridW} ${gridH}`}
          style={{ overflow: 'visible', maxWidth: '100%', maxHeight: '100%' }}
          role="img"
          aria-label={message || 'Loading'}
        >
        {/* Base grid: squares + dots */}
        {cells.map((cell) => {
          const sx = cell.cx - squareSize / 2;
          const sy = cell.cy - squareSize / 2;
          const hits = settledHits.get(`${cell.col}:${cell.row}`);
          const hasSettledDot = !!hits && hits.length > 0;
          const isLatestHit = latest?.points.some(
            (p) => p.col === cell.col && p.row === cell.row,
          );
          const anyHit = hasSettledDot || isLatestHit;
          return (
            <g key={`cell-${cell.col}-${cell.row}`}>
              <rect
                x={sx}
                y={sy}
                width={squareSize}
                height={squareSize}
                rx={3}
                fill="none"
                stroke={borderColor}
                strokeWidth={1}
                opacity={anyHit ? 0.6 : 0.4}
              />
              {!hasSettledDot && (
                <circle
                  cx={cell.cx}
                  cy={cell.cy}
                  r={dotR}
                  fill={theme.colors.textMuted}
                  opacity={0.55}
                />
              )}
              {/* Persisted colored dots for settled trails passing through */}
              {hits?.map((t) => (
                <circle
                  key={`settled-${t.id}-${cell.col}-${cell.row}`}
                  cx={cell.cx}
                  cy={cell.cy}
                  r={dotR * 1.4}
                  fill={t.color}
                  opacity={0.85}
                />
              ))}
            </g>
          );
        })}

        {/* Settled trails: static lines */}
        {settled.map((t) => (
          <path
            key={`settled-path-${t.id}`}
            d={t.pathD}
            fill="none"
            stroke={t.color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
            style={{
              filter: `drop-shadow(0 0 4px ${t.color})`,
            }}
          />
        ))}

        {/* Active (drawing) trail */}
        {latest && (
          <>
            <path
              key={`active-path-${latest.id}`}
              d={latest.pathD}
              fill="none"
              stroke={latest.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                filter: `drop-shadow(0 0 6px ${latest.color})`,
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: `trailDraw ${drawDuration}ms linear forwards`,
              }}
            />
            {latest.points.map((p, i) => {
              const delay = latestDelays[i] ?? 0;
              const sx = p.cx - squareSize / 2;
              const sy = p.cy - squareSize / 2;
              return (
                <g key={`active-pt-${latest.id}-${i}`}>
                  <rect
                    x={sx}
                    y={sy}
                    width={squareSize}
                    height={squareSize}
                    rx={3}
                    fill={`${latest.color}26`}
                    stroke={latest.color}
                    strokeWidth={1.4}
                    opacity={0}
                    style={{
                      animation: `trailSquarePop ${drawDuration}ms ease-out ${delay}ms forwards`,
                    }}
                  />
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={dotR * 1.6}
                    fill={latest.color}
                    opacity={0}
                    style={{
                      transformOrigin: `${p.cx}px ${p.cy}px`,
                      animation: `trailDotPop ${drawDuration}ms ease-out ${delay}ms forwards`,
                      filter: `drop-shadow(0 0 4px ${latest.color})`,
                    }}
                  />
                </g>
              );
            })}
          </>
        )}
        </svg>
        )}
      </div>

      <style>{`
        @keyframes trailDraw {
          0% { stroke-dashoffset: 1; }
          100% { stroke-dashoffset: 0; }
        }

        @keyframes trailSquarePop {
          0% { opacity: 0; }
          15% { opacity: 1; }
          100% { opacity: 1; }
        }

        @keyframes trailDotPop {
          0% { opacity: 0; transform: scale(0.6); }
          15% { opacity: 1; transform: scale(1.4); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes trailTextPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default TrailLoadingAnimation;
