'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useId, useMemo } from 'react';

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

interface Marker {
  x: number;
  y: number;
  label: string;
}

const VIEW_W = 700;
const VIEW_H = 700;
const CITY_COLS = 12;
const CITY_ROWS = 12;
const CELL_W = 50;
const CELL_H = 50;
const CITY_OFFSET_X = 50;
const CITY_OFFSET_Y = 50;

/** Center point of a grid cell, in viewBox coords. */
function cellCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: CITY_OFFSET_X + col * CELL_W + CELL_W / 2,
    y: CITY_OFFSET_Y + row * CELL_H + CELL_H / 2,
  };
}

function buildCity(palette: string[], pinned: ReadonlySet<string>): Building[] {
  const rng = mulberry32(7);
  const cells: Building[] = [];
  for (let r = 0; r < CITY_ROWS; r++) {
    for (let c = 0; c < CITY_COLS; c++) {
      const isPinned = pinned.has(`${c},${r}`);
      // Pinned cells (the ones markers sit on top of) always get a
      // building so the marker has something to be centered on. Other
      // cells skip occasionally to break up the grid.
      const skipRoll = rng();
      // Keep the RNG sequence stable so colors don't shift after dropping
      // the per-building size jitter.
      rng();
      rng();
      const colorRoll = rng();
      if (!isPinned && skipRoll < 0.18) continue;
      const w = CELL_W - 8;
      const h = CELL_H - 8;
      cells.push({
        x: CITY_OFFSET_X + c * CELL_W + (CELL_W - w) / 2,
        y: CITY_OFFSET_Y + r * CELL_H + (CELL_H - h) / 2,
        w,
        h,
        fill: palette[Math.floor(colorRoll * palette.length)]!,
      });
    }
  }
  return cells;
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

/** VH leader from `a` (marker) to `b` (snippet anchor): exits `a` going
 *  vertically toward `b.y`, then turns and runs horizontally to `b.x`. */
function lRoutePath(a: { x: number; y: number }, b: { x: number; y: number }, radius = 12) {
  const goingUp = b.y < a.y;
  const ySign = goingUp ? -1 : 1;
  const xSign = b.x < a.x ? -1 : 1;
  const r = Math.min(
    radius,
    Math.abs(a.y - b.y) / 2,
    Math.abs(a.x - b.x) / 2,
  );
  return [
    `M ${a.x} ${a.y}`,
    `L ${a.x} ${b.y - ySign * r}`,
    `Q ${a.x} ${b.y} ${a.x + xSign * r} ${b.y}`,
    `L ${b.x} ${b.y}`,
  ].join(' ');
}

export interface TrailCityDiagramProps {
  /** Optional className applied to the wrapping <svg>. */
  className?: string;
  /** Hide the side snippet pane + leader line. */
  hideSnippet?: boolean;
  /** When false, the snippet system (leader, marker dot, cell border,
   *  snippet card) fades out to opacity 0 with a 700ms reveal delay on
   *  the way back in. Used to hold the snippet until the typed
   *  explanation finishes. */
  snippetVisible?: boolean;
  /** Hide the dashed trail polyline and its numbered markers. Used when
   *  the surface is explaining the file city itself and the trail would
   *  be a distraction. */
  hideTrail?: boolean;
  /** When false, the trail polyline + numbered markers fade out (opacity
   *  0) without unmounting. Used to hold the trail off-screen until the
   *  codeTrail step's typed explanation finishes. */
  trailVisible?: boolean;
  /** Show a row of small sign-off stamp placeholders under the snippet.
   *  Four filled "team" stamps + one empty slot to make collaboration
   *  legible on the whyTrails step. */
  stampRowVisible?: boolean;
  /** True once the visitor has signed off. Hides the empty placeholder
   *  slot so the page's HTML LgtmStamp overlay can occupy it without
   *  visual conflict. */
  userStamped?: boolean;
  /**
   * Spotlight the trail: dim the city + snippet so only the dashed
   * polyline and numbered markers are at full visibility. Trail line
   * also thickens and re-enables its dash animation. Used to draw
   * attention when the page is explaining what a code trail is.
   */
  highlightTrail?: boolean;
}

/**
 * Static SVG version of the FileCity trail overlay — a top-down grid of
 * building rectangles with numbered markers wired by a dashed path, plus
 * an L-routed leader line to a snippet card. Mirrors the look of
 * `TrailFilePath` + `TrailLeaderLine` from the 3D panel without the
 * three.js projection — suitable for marketing surfaces.
 */
export function TrailCityDiagram({
  className,
  hideSnippet = false,
  snippetVisible = true,
  hideTrail = false,
  trailVisible = true,
  highlightTrail = false,
  stampRowVisible = false,
  userStamped = false,
}: TrailCityDiagramProps) {
  const snippetGateStyle = {
    opacity: snippetVisible ? 1 : 0,
    transition: 'opacity 500ms ease',
    transitionDelay: snippetVisible ? '700ms' : '0ms',
  };
  const trailGateStyle = {
    opacity: trailVisible ? 1 : 0,
    transition: 'opacity 500ms ease',
  };
  const stampRowGateStyle = {
    opacity: stampRowVisible ? 1 : 0,
    transition: 'opacity 500ms ease',
    transitionDelay: stampRowVisible ? '700ms' : '0ms',
  };
  const { theme } = useTheme();
  const uid = useId().replace(/:/g, '');
  const accent = theme.colors.primary ?? '#22d3ee';
  const surface = theme.colors.surface ?? '#0f1419';
  const text = theme.colors.text ?? '#f8fafc';
  const muted = theme.colors.textMuted ?? '#94a3b8';
  const bg = theme.colors.background ?? '#0a0f14';
  const success = theme.colors.success ?? '#10b981';
  // Silvery white-grey ink for ACK stamps — brighter than `muted` so it
  // reads cleanly against the dark city.
  const silver = '#d1d8e0';

  const palette = useMemo(
    () => [
      withAlpha(accent, 0.18),
      withAlpha(accent, 0.32),
      withAlpha(text, 0.08),
      withAlpha(text, 0.14),
      withAlpha(text, 0.22),
    ],
    [accent, text],
  );

  const markerCells: { col: number; row: number; label: string }[] = useMemo(
    () => [
      { col: 1, row: 10, label: '1' },
      { col: 3, row: 7, label: '2' },
      { col: 6, row: 9, label: '3' },
      { col: 4, row: 5, label: '4' },
    ],
    [],
  );

  const pinnedCells = useMemo(
    () => new Set(markerCells.map(m => `${m.col},${m.row}`)),
    [markerCells],
  );

  const buildings = useMemo(() => buildCity(palette, pinnedCells), [palette, pinnedCells]);

  const markers: Marker[] = useMemo(
    () =>
      markerCells.map(m => {
        const c = cellCenter(m.col, m.row);
        return { x: c.x, y: c.y, label: m.label };
      }),
    [markerCells],
  );

  const trailPath = useMemo(() => {
    const [first, ...rest] = markers;
    if (!first) return '';
    return [`M ${first.x} ${first.y}`, ...rest.map(m => `L ${m.x} ${m.y}`)].join(' ');
  }, [markers]);

  const activeMarker = markers[markers.length - 1];
  const snippetAnchor = { x: VIEW_W - 320, y: 100 };
  const leaderPath = useMemo(
    () =>
      activeMarker
        ? lRoutePath({ x: activeMarker.x, y: activeMarker.y }, snippetAnchor)
        : '',
    [activeMarker, snippetAnchor.x, snippetAnchor.y],
  );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
      role="img"
      aria-label="A trail of code locations connected across a top-down city of files"
    >
      <defs>
        <linearGradient id={`fade-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={bg} stopOpacity={0} />
          <stop offset="100%" stopColor={bg} stopOpacity={0.7} />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={bg} rx={12} />

      {/* City — top-down rectangles, varied size + tint. Dimmed when
        * the trail is being spotlighted so the dashed path pops. */}
      <g
        style={{
          opacity: highlightTrail ? 0.2 : 1,
          transition: 'opacity 300ms ease',
        }}
      >
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
      </g>

      {/* Outline around the file the snippet is anchored to, so the
        * fileCity step can visually say "this square = that code". */}
      {!hideSnippet && (() => {
        const activeCell = markerCells[markerCells.length - 1];
        if (!activeCell) return null;
        return (
          <g style={snippetGateStyle}>
            <rect
              x={CITY_OFFSET_X + activeCell.col * CELL_W + 4}
              y={CITY_OFFSET_Y + activeCell.row * CELL_H + 4}
              width={CELL_W - 8}
              height={CELL_H - 8}
              fill="none"
              stroke={accent}
              strokeWidth={2}
              rx={2}
              style={{
                opacity: highlightTrail ? 0.2 : 1,
                transition: 'opacity 300ms ease',
              }}
            />
          </g>
        );
      })()}

      <rect x={0} y={VIEW_H - 80} width={VIEW_W} height={80} fill={`url(#fade-${uid})`} pointerEvents="none" />

      {/* Trail polyline — thickens + animates dashes when spotlighted. */}
      {!hideTrail && (
        <g style={trailGateStyle}>
        <path
          d={trailPath}
          fill="none"
          stroke={accent}
          strokeWidth={highlightTrail ? 3.5 : 2}
          strokeLinecap="round"
          strokeDasharray="6 5"
          opacity={highlightTrail ? 1 : 0.9}
          style={{
            transition: 'stroke-width 300ms ease, opacity 300ms ease',
            filter: highlightTrail
              ? `drop-shadow(0 0 8px ${withAlpha(accent, 0.7)})`
              : undefined,
          }}
        >
          {highlightTrail && (
            <animate
              attributeName="stroke-dashoffset"
              from={0}
              to={-44}
              dur="1.4s"
              repeatCount="indefinite"
            />
          )}
        </path>
        </g>
      )}

      {/* L-routed leader line — rendered before markers so the active
        * marker sits on top of the line's endpoint. The snippet card
        * itself stays rendered after the markers (below). Hidden while
        * the trail is being spotlighted to reduce visual noise. */}
      {!hideSnippet && (
        <g style={snippetGateStyle}>
          <path
            d={leaderPath}
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={highlightTrail ? 0 : 0.7}
            style={{ transition: 'opacity 300ms ease' }}
          />
          {activeMarker && (
            <circle
              cx={activeMarker.x}
              cy={activeMarker.y}
              r={3.5}
              fill={accent}
              opacity={highlightTrail ? 0 : 1}
              style={{ transition: 'opacity 300ms ease' }}
            />
          )}
        </g>
      )}

      {/* Markers */}
      {!hideTrail && (
      <g style={trailGateStyle}>
        {markers.map((m, i) => {
          const isActive = i === markers.length - 1;
          const size = 22;
          const half = size / 2;
          return (
            <g key={m.label}>
              {isActive && (
                <rect
                  x={m.x - half - 4}
                  y={m.y - half - 4}
                  width={size + 8}
                  height={size + 8}
                  rx={6}
                  fill={accent}
                  opacity={0.18}
                >
                  <animate
                    attributeName="opacity"
                    values="0.28;0;0.28"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              <rect
                x={m.x - half}
                y={m.y - half}
                width={size}
                height={size}
                rx={4}
                fill={surface}
                stroke={accent}
                strokeWidth={1.75}
              />
              <text
                x={m.x}
                y={m.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontWeight={700}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill={text}
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </g>
      )}

      {/* Snippet anchor dot + card — rendered last so they sit above
        * everything. The leader line's path was already drawn before
        * the markers so the active marker covers its endpoint. */}
      {!hideSnippet && (
        <g style={snippetGateStyle}>
        <g
          style={{
            opacity: highlightTrail ? 0.15 : 1,
            transition: 'opacity 300ms ease',
          }}
        >
          <circle cx={snippetAnchor.x} cy={snippetAnchor.y} r={3.5} fill={accent} />
          <SnippetCard
            x={snippetAnchor.x}
            y={snippetAnchor.y - 22}
            surface={surface}
            text={text}
            muted={muted}
            accent={accent}
          />
        </g>
        </g>
      )}

      {/* Collaboration preview — four team stamps + one empty slot for
        * the visitor to fill. Sits under the snippet card on the
        * whyTrails / stamped steps. */}
      <g style={stampRowGateStyle}>
        {[
          { initials: 'AJ', kind: 'LGTM' as const, rotation: -6 },
          { initials: 'MK', kind: 'ACK' as const, rotation: 4 },
          { initials: 'RT', kind: 'LGTM' as const, rotation: -3 },
          { initials: null, kind: null, rotation: 0 },
        ].map((s, i) => {
          const isEmpty = s.initials === null;
          if (isEmpty && userStamped) return null;
          const W = 54;
          const H = 36;
          const gap = 6;
          const rowX = snippetAnchor.x;
          const rowY = snippetAnchor.y + 200;
          const cx = rowX + i * (W + gap) + W / 2;
          const cy = rowY + H / 2;
          const ink = isEmpty ? muted : s.kind === 'LGTM' ? success : silver;
          return (
            <g
              key={i}
              transform={`translate(${cx}, ${cy}) rotate(${s.rotation})`}
              opacity={isEmpty ? 0.55 : 0.85}
            >
              <rect
                x={-W / 2}
                y={-H / 2}
                width={W}
                height={H}
                rx={4}
                fill={isEmpty ? 'none' : withAlpha(ink, 0.08)}
                stroke={ink}
                strokeWidth={1.5}
                strokeDasharray={isEmpty ? '3 3' : undefined}
              />
              {!isEmpty && (
                <>
                  <rect
                    x={-W / 2 + 3}
                    y={-H / 2 + 3}
                    width={W - 6}
                    height={H - 6}
                    rx={2}
                    fill="none"
                    stroke={ink}
                    strokeWidth={0.75}
                    opacity={0.7}
                  />
                  <text
                    x={0}
                    y={-5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fill={ink}
                    letterSpacing="0.1em"
                  >
                    {s.initials}
                  </text>
                  <text
                    x={0}
                    y={7}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={7}
                    fontWeight={700}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fill={ink}
                    letterSpacing="0.14em"
                  >
                    {s.kind}
                  </text>
                </>
              )}
              {isEmpty && (
                <text
                  x={0}
                  y={1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={18}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill={ink}
                  opacity={0.7}
                >
                  +
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function SnippetCard({
  x,
  y,
  surface,
  text,
  muted,
  accent,
}: {
  x: number;
  y: number;
  surface: string;
  text: string;
  muted: string;
  accent: string;
}) {
  const W = 280;
  const H = 200;
  const HEADER = 28;
  const lines = [
    { w: 170, c: muted },
    { w: 220, c: text },
    { w: 130, c: accent },
    { w: 200, c: text },
    { w: 150, c: muted },
    { w: 100, c: text },
  ];
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={W}
        height={H}
        rx={10}
        fill={surface}
        stroke={withAlpha(accent, 0.55)}
        strokeWidth={1.5}
      />
      {/* Header band */}
      <rect width={W} height={HEADER} rx={10} fill={withAlpha(accent, 0.08)} />
      <text
        x={16}
        y={HEADER / 2}
        dominantBaseline="central"
        fontSize={13}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill={text}
      >
        db/users.ts:42
      </text>
      {/* Code lines */}
      <g transform={`translate(16, ${HEADER + 18})`}>
        {lines.map((l, i) => (
          <rect
            key={i}
            x={0}
            y={i * 20}
            width={l.w}
            height={7}
            rx={2}
            fill={l.c}
            opacity={0.75}
          />
        ))}
      </g>
    </g>
  );
}

function withAlpha(color: string, alpha: number): string {
  // Accept #rgb / #rrggbb / rgb()/rgba()/hsl()/named — leave non-hex
  // as-is and rely on the caller. For hex, append a 2-digit alpha.
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
