'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * One entry in the per-trail schedule — a "stop" on the line's tour
 * through the trail's cells. `arrivalMs` is when the line head reaches
 * the cell's center; `dwellEndMs` is when the line leaves that cell
 * (so it has been holding there since `arrivalMs`). The square at this
 * stop begins fading in at `arrivalMs`.
 */
interface Stop {
  arrivalMs: number;
  dwellEndMs: number;
}

function buildSchedule(
  cellCount: number,
  travelMs: number,
  dwellMs: number,
  firstDwellMs: number,
): Stop[] {
  if (cellCount === 0) return [];
  const stops: Stop[] = [{ arrivalMs: 0, dwellEndMs: firstDwellMs }];
  for (let i = 1; i < cellCount; i++) {
    const arrival = stops[i - 1]!.dwellEndMs + travelMs;
    stops.push({ arrivalMs: arrival, dwellEndMs: arrival + dwellMs });
  }
  return stops;
}

interface TrailLineProps {
  pathD: string;
  /** Cumulative path distance to each cell, in user units. First entry
   *  is 0 (cell 0), last entry is the total path length. */
  cumulativeDistances: number[];
  stops: Stop[];
  isVisible: boolean;
  stroke: string;
  fadeOutMs: number;
}

/** Per-trail tracing line. Drives stroke-dashoffset imperatively via
 *  the Web Animations API using keyframes derived from the schedule.
 *  Dashoffset values are computed from real segment distances so the
 *  head lands exactly on each cell's center — segments can vary in
 *  length when cells aren't strict neighbors. */
function TrailLine({
  pathD,
  cumulativeDistances,
  stops,
  isVisible,
  stroke,
  fadeOutMs,
}: TrailLineProps) {
  const ref = useRef<SVGPathElement>(null);
  const drawDurationMs = stops[stops.length - 1]?.dwellEndMs ?? 0;
  const totalLength = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;

  useEffect(() => {
    if (!isVisible || totalLength === 0 || !ref.current || drawDurationMs === 0) return;
    // At stop i, the visible portion of the path should run from cell 0
    // to cell i — that's cumulativeDistances[i] user units. So
    // dashoffset = totalLength - cumulativeDistances[i].
    const keyframes: Keyframe[] = [
      { strokeDashoffset: String(totalLength), offset: 0 },
    ];
    for (let i = 0; i < stops.length; i++) {
      const { arrivalMs, dwellEndMs } = stops[i]!;
      const offsetVal = totalLength - (cumulativeDistances[i] ?? 0);
      if (i > 0) {
        keyframes.push({
          strokeDashoffset: String(offsetVal),
          offset: Math.min(1, arrivalMs / drawDurationMs),
        });
      }
      keyframes.push({
        strokeDashoffset: String(offsetVal),
        offset: Math.min(1, dwellEndMs / drawDurationMs),
      });
    }

    const anim = ref.current.animate(keyframes, {
      duration: drawDurationMs,
      fill: 'forwards',
      easing: 'linear',
    });
    return () => {
      anim.cancel();
    };
  }, [isVisible, totalLength, cumulativeDistances, stops, drawDurationMs]);

  return (
    <path
      ref={ref}
      d={pathD}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={totalLength}
      strokeDashoffset={totalLength}
      style={{
        opacity: isVisible ? 0 : 1,
        transition: `opacity ${fadeOutMs}ms ease ${drawDurationMs}ms`,
      }}
    />
  );
}

export interface FileCityTrailRevealProps {
  className?: string;
  cols?: number;
  rows?: number;
  cellSize?: number;
  padding?: number;
  /** Number of separate trails to lay down. */
  trailCount?: number;
  /** Cells per trail. */
  batchSize?: number;
  /** Time between trail starts. */
  batchDelayMs?: number;
  /** Time the line takes to travel between two consecutive cells. */
  travelMs?: number;
  /** Time the line holds at each cell after arriving. The square at
   *  that cell fades in during this window. */
  dwellMs?: number;
  /** Time the line holds at the FIRST cell before moving on. The
   *  starting square has no inbound motion, so this is typically
   *  longer than `dwellMs` — gives the trail a "settle, then move"
   *  rhythm. Defaults to `dwellMs * 1.5`. */
  firstDwellMs?: number;
  /** Duration of the square's fade-in. Must be <= dwellMs so the
   *  square finishes materializing before the line leaves. Defaults to
   *  `dwellMs`. */
  squareFadeMs?: number;
  /** Duration of the line's fade-out, applied after the last cell's
   *  dwell ends. Defaults to `dwellMs`. */
  lineFadeOutMs?: number;
  /** Max Chebyshev distance between consecutive cells in a trail. 1 =
   *  strictly orthogonal neighbors; higher = jumps. */
  maxStep?: number;
  /** RNG seed for trail generation. */
  seed?: number;
  showBackground?: boolean;
  autoStart?: boolean;
  /** Bumping this key restarts the animation with a fresh path. */
  resetKey?: number | string;
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

type Cell = { col: number; row: number };

/** Each quadrant of the grid corresponds to a kind of runtime event.
 *  The cell's (col,row) deterministically picks a specific label from
 *  the quadrant's pool, so the same cell always renders the same
 *  label across replays. */
type Quadrant = 'UI' | 'API' | 'DB' | 'AUTH';

const QUADRANT_LABELS: Record<Quadrant, ReadonlyArray<string>> = {
  UI: [
    'ui.button.click',
    'ui.modal.open',
    'ui.form.submit',
    'ui.input.change',
    'ui.nav.toggle',
    'ui.tooltip.show',
  ],
  API: [
    'api.users.fetch',
    'api.auth.login',
    'api.posts.create',
    'api.search.query',
    'api.upload.stream',
    'api.session.refresh',
  ],
  DB: [
    'db.users.select',
    'db.posts.insert',
    'db.cache.get',
    'db.tx.begin',
    'db.index.scan',
    'db.lock.acquire',
  ],
  AUTH: [
    'auth.token.verify',
    'auth.session.create',
    'auth.policy.check',
    'auth.scope.assert',
    'auth.oauth.exchange',
    'auth.mfa.challenge',
  ],
};

function quadrantOf(cell: Cell, cols: number, rows: number): Quadrant {
  const left = cell.col < cols / 2;
  const top = cell.row < rows / 2;
  if (left && top) return 'UI';
  if (!left && top) return 'API';
  if (left && !top) return 'DB';
  return 'AUTH';
}

function labelForCell(cell: Cell, cols: number, rows: number): string {
  const pool = QUADRANT_LABELS[quadrantOf(cell, cols, rows)];
  const idx = (cell.col * 7 + cell.row * 13) % pool.length;
  return pool[idx]!;
}

interface Engineer {
  name: string;
  initials: string;
  /** Distinguishing color used for this engineer's trail line and the
   *  union border on the cells they touched. */
  color: string;
  /** Their primary area of expertise — used purely as flavor text in
   *  the log panel (e.g. "AJ Kim — UI"). The trail's actual cell
   *  distribution comes from the random walk, which is what reveals
   *  the engineer's footprint visually. */
  primary: Quadrant;
}

const ENGINEERS: ReadonlyArray<Engineer> = [
  { name: 'AJ Kim', initials: 'AJ', color: '#22d3ee', primary: 'UI' },
  { name: 'MK Patel', initials: 'MK', color: '#a78bfa', primary: 'API' },
  { name: 'RT Cruz', initials: 'RT', color: '#f59e0b', primary: 'DB' },
  { name: 'NS Lopez', initials: 'NS', color: '#10b981', primary: 'AUTH' },
];

function engineerForTrail(trailIdx: number): Engineer {
  return ENGINEERS[trailIdx % ENGINEERS.length]!;
}

/** Generate `count` disjoint trails. Each is a random walk where the
 *  next cell is any unvisited cell within `maxStep` Chebyshev distance
 *  of the current head — so cells in a trail don't have to be strict
 *  neighbors. Trails never share a cell with each other. */
function generateTrails(
  cols: number,
  rows: number,
  count: number,
  length: number,
  seed: number,
  maxStep: number,
): Cell[][] {
  const rng = mulberry32(seed);
  const visited = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;
  const trails: Cell[][] = [];

  for (let t = 0; t < count; t++) {
    const openCells: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!visited.has(key(c, r))) openCells.push({ col: c, row: r });
      }
    }
    if (openCells.length === 0) break;
    const start = openCells[Math.floor(rng() * openCells.length)]!;

    const path: Cell[] = [start];
    visited.add(key(start.col, start.row));

    while (path.length < length) {
      const head = path[path.length - 1]!;
      const candidates: Cell[] = [];
      for (let dr = -maxStep; dr <= maxStep; dr++) {
        for (let dc = -maxStep; dc <= maxStep; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = head.col + dc;
          const nr = head.row + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          if (visited.has(key(nc, nr))) continue;
          candidates.push({ col: nc, row: nr });
        }
      }
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(rng() * candidates.length)]!;
      path.push(pick);
      visited.add(key(pick.col, pick.row));
    }
    trails.push(path);
  }
  return trails;
}

/**
 * Blank grid that fills in along one trail at a time. The line is the
 * protagonist — it travels between cells (`travelMs` per segment) and
 * dwells at each one (`dwellMs`) long enough for the square at that
 * cell to materialize. Cell 0 gets a longer settle (`firstDwellMs`).
 *
 * The whole animation is derived from a per-trail `Stop[]` schedule,
 * so any timing tweak (longer dwell on the last cell, between-cell
 * beats, etc.) is a single change to `buildSchedule`.
 */
export function FileCityTrailReveal({
  className,
  cols = 12,
  rows = 12,
  cellSize = 50,
  padding = 40,
  trailCount = 5,
  batchSize = 5,
  batchDelayMs = 7500,
  travelMs = 700,
  dwellMs = 700,
  firstDwellMs,
  squareFadeMs,
  lineFadeOutMs,
  maxStep = 3,
  seed = 7,
  showBackground = true,
  autoStart = true,
  resetKey,
}: FileCityTrailRevealProps) {
  const { theme } = useTheme();
  const accent = theme.colors.primary ?? '#22d3ee';
  const text = theme.colors.text ?? '#f8fafc';
  const bg = theme.colors.background ?? '#0a0f14';

  // Resolve optional timings against `dwellMs` so callers can tune
  // just the one knob and have the rest follow.
  const resolvedFirstDwellMs = firstDwellMs ?? Math.round(dwellMs * 1.5);
  const resolvedSquareFadeMs = Math.min(
    squareFadeMs ?? dwellMs,
    dwellMs,
  );
  const resolvedLineFadeOutMs = lineFadeOutMs ?? dwellMs;

  const viewW = cols * cellSize + padding * 2;
  const gridBottom = rows * cellSize + padding * 2;
  const LOG_PANEL_HEIGHT = 300;
  const LOG_LINE_HEIGHT = 22;
  // Layout inside the log panel (all relative to gridBottom).
  const AVATAR_ROW_Y = 32; // circle center
  const HEADER_Y = 90; // text baseline
  const EVENTS_START_Y = 120;
  const viewH = gridBottom + LOG_PANEL_HEIGHT;

  const trails = useMemo(
    () => generateTrails(cols, rows, trailCount, batchSize, seed, maxStep),
    [cols, rows, trailCount, batchSize, seed, maxStep, resetKey],
  );

  // One schedule per trail. Trails generated from random walks can
  // dead-end short of `batchSize`, so each gets its own length.
  const schedules = useMemo(
    () =>
      trails.map(trail =>
        buildSchedule(trail.length, travelMs, dwellMs, resolvedFirstDwellMs),
      ),
    [trails, travelMs, dwellMs, resolvedFirstDwellMs],
  );

  // Per-trail geometry: cell-center positions, path string, and the
  // cumulative pixel distance to each cell along the path. The line's
  // dashoffset is in real path units, so non-uniform segment lengths
  // (from `maxStep > 1`) still land the line head exactly on a cell.
  const trailGeometry = useMemo(
    () =>
      trails.map(trail => {
        const positions = trail.map(c => ({
          x: padding + c.col * cellSize + cellSize / 2,
          y: padding + c.row * cellSize + cellSize / 2,
        }));
        const cumulative: number[] = [0];
        for (let i = 1; i < positions.length; i++) {
          const dx = positions[i]!.x - positions[i - 1]!.x;
          const dy = positions[i]!.y - positions[i - 1]!.y;
          cumulative.push(cumulative[i - 1]! + Math.hypot(dx, dy));
        }
        const pathD = positions
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
          .join(' ');
        return { pathD, cumulative };
      }),
    [trails, cellSize, padding],
  );

  const [trailsShown, setTrailsShown] = useState(autoStart ? 0 : trails.length);
  const [fillRevealed, setFillRevealed] = useState(0);
  const [hoveredEngineerIdx, setHoveredEngineerIdx] = useState<number | null>(
    null,
  );

  // Cells not touched by any trail — these get a fast "background
  // activity" fill after all trails complete. Deterministic order
  // hashed from cell coords gives a scattered fill rather than a
  // raster scan.
  const restCells = useMemo(() => {
    const visited = new Set<string>();
    for (const trail of trails) {
      for (const c of trail) visited.add(`${c.col},${c.row}`);
    }
    const rest: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!visited.has(`${c},${r}`)) rest.push({ col: c, row: r });
      }
    }
    rest.sort((a, b) => {
      const ha = (a.col * 1103515245 + a.row * 12345) & 0x7fffffff;
      const hb = (b.col * 1103515245 + b.row * 12345) & 0x7fffffff;
      return ha - hb;
    });
    return rest;
  }, [trails, rows, cols]);

  const FILL_BATCH_SIZE = 8;
  const FILL_BATCH_MS = 130;

  useEffect(() => {
    if (!autoStart) {
      setTrailsShown(trails.length);
      setFillRevealed(restCells.length);
      return;
    }
    setTrailsShown(0);
    setFillRevealed(0);
    // Paint the empty grid once before kicking off trail 1, otherwise
    // the 0→1 CSS transitions have no "before" frame and the first
    // trail snaps in fully drawn.
    let intervalId: number | undefined;
    const rafId = window.requestAnimationFrame(() => {
      setTrailsShown(1);
      if (trails.length > 1) {
        intervalId = window.setInterval(() => {
          setTrailsShown(prev => {
            const next = prev + 1;
            if (next >= trails.length) {
              window.clearInterval(intervalId);
              return trails.length;
            }
            return next;
          });
        }, batchDelayMs);
      }
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [autoStart, batchDelayMs, trails.length, restCells.length, resetKey]);

  // After all trails are done, kick off the fast "fill the rest" phase.
  useEffect(() => {
    if (!autoStart) return;
    if (trailsShown < trails.length || trails.length === 0) return;
    if (restCells.length === 0) return;
    const id = window.setInterval(() => {
      setFillRevealed(prev => {
        const next = prev + FILL_BATCH_SIZE;
        if (next >= restCells.length) {
          window.clearInterval(id);
          return restCells.length;
        }
        return next;
      });
    }, FILL_BATCH_MS);
    return () => window.clearInterval(id);
  }, [autoStart, trailsShown, trails.length, restCells.length]);

  const buildingSize = cellSize - 8;
  const fill = withAlpha(accent, 0.32);
  const strokeBaseline = withAlpha(text, 0.1);

  const cellCenter = (col: number, row: number) => ({
    x: padding + col * cellSize + cellSize / 2,
    y: padding + row * cellSize + cellSize / 2,
  });

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className={className}
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
      role="img"
      aria-label="A trail of files appearing across an empty city grid"
    >
      {showBackground && (
        <rect x={0} y={0} width={viewW} height={viewH} fill={bg} rx={12} />
      )}

      {/* Quadrant designations — faint labels at each quadrant's center
        * so the cells' categories are legible at a glance. */}
      {(['UI', 'API', 'DB', 'AUTH'] as const).map(q => {
        const left = q === 'UI' || q === 'DB';
        const top = q === 'UI' || q === 'API';
        const cx = padding + (left ? cols / 4 : (cols * 3) / 4) * cellSize;
        const cy = padding + (top ? rows / 4 : (rows * 3) / 4) * cellSize;
        return (
          <text
            key={q}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={64}
            fontWeight={700}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill={withAlpha(text, 0.06)}
            letterSpacing="0.18em"
            pointerEvents="none"
          >
            {q}
          </text>
        );
      })}

      {/* Keyed on resetKey so replaying remounts the trail elements
        * cleanly — otherwise CSS transitions would play backwards as
        * trailsShown drops to 0. */}
      <g key={`trails-${resetKey ?? 'initial'}`}>
        {/* Fast background fill — cells not touched by any trail. They
          * appear in batches once all trails are done, with dimmer
          * styling so they read as ambient activity rather than focal
          * events. */}
        {restCells.map((cell, i) => {
          const isRevealed = i < fillRevealed;
          const staggerInBatch = (i % FILL_BATCH_SIZE) * 25;
          return (
            <rect
              key={`fill-${cell.col},${cell.row}`}
              x={padding + cell.col * cellSize + 4}
              y={padding + cell.row * cellSize + 4}
              width={buildingSize}
              height={buildingSize}
              rx={2}
              style={{
                fill: withAlpha(accent, 0.14),
                stroke: withAlpha(text, 0.06),
                strokeWidth: 0.5,
                opacity: isRevealed ? 1 : 0,
                transition: `opacity 280ms ease ${staggerInBatch}ms`,
              }}
            />
          );
        })}
        {trails.map((trail, trailIdx) => {
          const isVisible = trailIdx < trailsShown;
          const stops = schedules[trailIdx]!;
          const { pathD, cumulative } = trailGeometry[trailIdx]!;
          const drawDurationMs = stops[stops.length - 1]?.dwellEndMs ?? 0;
          const segments = Math.max(0, trail.length - 1);
          const engineer = engineerForTrail(trailIdx);
          const engineerIdx = trailIdx % ENGINEERS.length;
          const trailLineStroke = withAlpha(engineer.color, 0.9);
          const trailUnionStroke = withAlpha(engineer.color, 0.95);
          const isDimmedByHover =
            hoveredEngineerIdx !== null &&
            hoveredEngineerIdx !== engineerIdx;
          return (
            <g
              key={`trail-${trailIdx}`}
              style={{
                opacity: isDimmedByHover ? 0.18 : 1,
                transition: 'opacity 220ms ease',
              }}
            >
              {segments > 0 && (
                <TrailLine
                  pathD={pathD}
                  cumulativeDistances={cumulative}
                  stops={stops}
                  isVisible={isVisible}
                  stroke={trailLineStroke}
                  fadeOutMs={resolvedLineFadeOutMs}
                />
              )}
              {trail.map((cell, cellIdx) => {
                // Square fades in starting when the line arrives at
                // this cell. Union border kicks in once the whole
                // trail's tracing animation is done.
                const delayMs = stops[cellIdx]?.arrivalMs ?? 0;
                const unionDelayMs = drawDurationMs;
                const { x: cx, y: cy } = cellCenter(cell.col, cell.row);
                return (
                  <rect
                    key={`${cell.col},${cell.row}`}
                    x={padding + cell.col * cellSize + 4}
                    y={padding + cell.row * cellSize + 4}
                    width={buildingSize}
                    height={buildingSize}
                    rx={2}
                    style={{
                      fill,
                      stroke: isVisible ? trailUnionStroke : strokeBaseline,
                      strokeWidth: isVisible ? 1.75 : 0.5,
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? 'scale(1)' : 'scale(0.6)',
                      transformOrigin: `${cx}px ${cy}px`,
                      transition: `opacity ${resolvedSquareFadeMs}ms ease ${delayMs}ms, transform ${resolvedSquareFadeMs}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delayMs}ms, stroke ${resolvedSquareFadeMs}ms ease ${unionDelayMs}ms, stroke-width ${resolvedSquareFadeMs}ms ease ${unionDelayMs}ms`,
                    }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Log panel — persistent team avatar row up top, then a
          * per-trail header + events stack below. Only the current
          * trail's header + events are visible at a time. Hovering an
          * avatar dims everyone else's trails + log entries. */}
        <g>
          <line
            x1={padding}
            x2={viewW - padding}
            y1={gridBottom - padding + 8}
            y2={gridBottom - padding + 8}
            stroke={withAlpha(text, 0.12)}
            strokeWidth={1}
          />

          {/* Team avatar row — each avatar appears when its engineer's
            * first trail starts, and stays visible after. The active
            * engineer's avatar gets a ring; hovered avatar gets a
            * highlighted ring and dims the others' trails. */}
          {ENGINEERS.map((eng, i) => {
            const cx = padding + 30 + i * 64;
            const cy = gridBottom + AVATAR_ROW_Y;
            const r = 18;
            const isHovered = hoveredEngineerIdx === i;
            const activeEngineerIdx =
              trailsShown > 0 ? (trailsShown - 1) % ENGINEERS.length : -1;
            const isActive = activeEngineerIdx === i;
            // Engineer i is first assigned to trailIdx = i (round-robin
            // by `trailIdx % ENGINEERS.length`). That trail starts when
            // trailsShown ticks past i.
            const hasShipped = trailsShown > i;
            const ringColor = isHovered
              ? withAlpha(text, 0.9)
              : isActive
                ? withAlpha(eng.color, 0.9)
                : 'transparent';
            return (
              <g
                key={eng.initials}
                onMouseEnter={() => setHoveredEngineerIdx(i)}
                onMouseLeave={() => setHoveredEngineerIdx(null)}
                style={{
                  cursor: hasShipped ? 'pointer' : 'default',
                  opacity: hasShipped ? 1 : 0,
                  pointerEvents: hasShipped ? 'auto' : 'none',
                  transition: 'opacity 500ms ease',
                }}
              >
                <title>{`${eng.name} · ${eng.primary} specialist`}</title>
                {/* Hit target a touch larger than the visible circle. */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 6}
                  fill="transparent"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 3}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={2}
                  style={{ transition: 'stroke 200ms ease' }}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={eng.color}
                  opacity={
                    hoveredEngineerIdx !== null && !isHovered ? 0.45 : 0.95
                  }
                  style={{ transition: 'opacity 200ms ease' }}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill="#0f1117"
                  pointerEvents="none"
                >
                  {eng.initials}
                </text>
              </g>
            );
          })}

          {trails.map((trail, trailIdx) => {
            const isCurrent = trailIdx === trailsShown - 1;
            const stops = schedules[trailIdx]!;
            const engineer = engineerForTrail(trailIdx);
            const engineerIdx = trailIdx % ENGINEERS.length;
            const isDimmedByHover =
              hoveredEngineerIdx !== null &&
              hoveredEngineerIdx !== engineerIdx;
            return (
              <g
                key={`log-${trailIdx}`}
                style={{
                  opacity: isDimmedByHover ? 0.18 : 1,
                  transition: 'opacity 220ms ease',
                }}
              >
                {/* Engineer header — no per-cell delay; shows the
                  * moment this trail becomes current. */}
                <g
                  style={{
                    opacity: isCurrent ? 1 : 0,
                    transition: `opacity ${resolvedSquareFadeMs}ms ease`,
                  }}
                >
                  <text
                    x={padding}
                    y={gridBottom + HEADER_Y}
                    fontSize={11}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fill={withAlpha(text, 0.4)}
                    letterSpacing="0.18em"
                  >
                    RECENTLY SHIPPED BY
                  </text>
                  <text
                    x={padding + 170}
                    y={gridBottom + HEADER_Y}
                    fontSize={13}
                    fontWeight={700}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fill={engineer.color}
                    letterSpacing="0.06em"
                  >
                    {engineer.name}
                  </text>
                  <text
                    x={padding + 170 + engineer.name.length * 8.5}
                    y={gridBottom + HEADER_Y}
                    fontSize={11}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fill={withAlpha(text, 0.4)}
                    letterSpacing="0.06em"
                  >
                    {` · ${engineer.primary} specialist`}
                  </text>
                </g>
                {trail.map((cell, cellIdx) => {
                  const label = labelForCell(cell, cols, rows);
                  const quad = quadrantOf(cell, cols, rows);
                  const arrivalMs = stops[cellIdx]?.arrivalMs ?? 0;
                  const y =
                    gridBottom + EVENTS_START_Y + cellIdx * LOG_LINE_HEIGHT;
                  return (
                    <g
                      key={cellIdx}
                      style={{
                        opacity: isCurrent ? 1 : 0,
                        transition: `opacity ${resolvedSquareFadeMs}ms ease ${
                          isCurrent ? arrivalMs : 0
                        }ms`,
                      }}
                    >
                      <text
                        x={padding}
                        y={y}
                        fontSize={11}
                        fontWeight={700}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fill={withAlpha(engineer.color, 0.75)}
                        letterSpacing="0.1em"
                      >
                        {quad.padEnd(4)}
                      </text>
                      <text
                        x={padding + 50}
                        y={y}
                        fontSize={13}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fill={withAlpha(text, 0.85)}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
