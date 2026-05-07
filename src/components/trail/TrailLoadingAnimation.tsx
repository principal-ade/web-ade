'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

export interface TrailLoadingAnimationProps {
  /** Pixel width of the animation */
  width?: number;
  /** Pixel height of the animation */
  height?: number;
  /** Number of grid columns */
  cols?: number;
  /** Number of grid rows */
  rows?: number;
  /** Optional message rendered under the animation */
  message?: string;
  /** Milliseconds per draw cycle */
  cycleDuration?: number;
  /** Maximum number of trails kept on screen at once */
  maxTrails?: number;
  /** 0..1 — probability that a given column is included in a trail */
  density?: number;
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
  points: { col: number; row: number; cx: number; cy: number }[];
  pathD: string;
}

function trailColor(id: number): string {
  // Golden-angle hue rotation gives well-separated colors.
  const hue = (id * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 78%, 62%)`;
}

export const TrailLoadingAnimation: React.FC<TrailLoadingAnimationProps> = ({
  width = 480,
  height = 220,
  cols = 12,
  rows = 6,
  message = 'Loading trail…',
  cycleDuration = 4500,
  maxTrails = 6,
  density = 0.55,
}) => {
  const { theme } = useTheme();

  const cellW = width / cols;
  const cellH = height / rows;
  const squareSize = Math.min(cellW, cellH) * 0.62;
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
      (id: number): Trail => {
        const picks = pickTrailRows(cols, rows, density, 0x1337 + id * 17);
        const points = picks.map((p) => ({
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
        return { id, color: trailColor(id), points, pathD };
      },
    [cols, rows, cellW, cellH, density],
  );

  const [trails, setTrails] = useState<Trail[]>(() => [buildTrail(0)]);

  useEffect(() => {
    let nextId = 1;
    const id = window.setInterval(() => {
      const newTrail = buildTrail(nextId++);
      setTrails((prev) => {
        const next = [...prev, newTrail];
        if (next.length > maxTrails) next.splice(0, next.length - maxTrails);
        return next;
      });
    }, cycleDuration);
    return () => window.clearInterval(id);
  }, [buildTrail, cycleDuration, maxTrails]);

  const latest = trails[trails.length - 1];
  const settled = trails.slice(0, -1);

  // Map of "col:row" -> array of trails passing through that cell (for
  // persisted colored dot stacks on settled trails).
  const settledHits = useMemo(() => {
    const m = new Map<string, Trail[]>();
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
        gap: 16,
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
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

      {message && (
        <div
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
            animation: 'trailTextPulse 2s ease-in-out infinite',
          }}
        >
          {message}
        </div>
      )}

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
