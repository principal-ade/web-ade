'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useEffect, useMemo, useState } from 'react';

type Cell = { col: number; row: number };

interface ColoredCell {
  col: number;
  row: number;
  fill: string;
  stroke: string;
}

interface Piece {
  cells: ColoredCell[];
  /** Index into TETROMINOES, or -1 for leftover singleton/duo. */
  shape: number;
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

const TETROMINOES: ReadonlyArray<ReadonlyArray<Cell>> = [
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }],
  [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: 1 }],
  [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 1, row: 2 }],
  [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
  [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 0, row: 2 }],
  [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 1, row: 2 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
  [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 0, row: 2 }],
  [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 2 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 1, row: 2 }],
  [{ col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
  [{ col: 1, row: 0 }, { col: 1, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 2 }],
  [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }],
];

const TETROMINO_ANCHORS: ReadonlyArray<Cell> = TETROMINOES.map(piece => {
  let anchor = piece[0]!;
  for (const cell of piece) {
    if (
      cell.row < anchor.row ||
      (cell.row === anchor.row && cell.col < anchor.col)
    ) {
      anchor = cell;
    }
  }
  return anchor;
});

const PIECE_PALETTE: ReadonlyArray<string> = [
  '#22d3ee', '#facc15', '#a78bfa', '#10b981',
  '#f87171', '#fb923c', '#60a5fa',
];

/* -------------------------------------------------------------------------- */
/* Image masks                                                                */
/* -------------------------------------------------------------------------- */

/** Canonical 12x12 brain shape — sampled with nearest-neighbor to fit
 *  any grid size. 1 = filled (brain), 0 = background. */
const BRAIN_MASK: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0],
  [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1],
  [1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1],
  [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  [1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1],
  [0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
];

/** Canonical 12x12 city skyline — buildings of varying heights along
 *  the bottom; sky on top. */
const SKYLINE_MASK: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 1],
  [0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

function sampleMask(
  mask: ReadonlyArray<ReadonlyArray<number>>,
  col: number,
  row: number,
  cols: number,
  rows: number,
): number {
  const mr = Math.min(mask.length - 1, Math.floor((row / rows) * mask.length));
  const cr = Math.min(
    mask[0]!.length - 1,
    Math.floor((col / cols) * mask[0]!.length),
  );
  return mask[mr]![cr]!;
}

type ImageMode = 'none' | 'brain' | 'skyline' | 'districts' | 'graph';

const DISTRICT_COLORS: Record<'UI' | 'API' | 'DB' | 'AUTH', string> = {
  UI: '#22d3ee',
  API: '#a78bfa',
  DB: '#fb923c',
  AUTH: '#10b981',
};

interface GraphData {
  hubs: Cell[];
  /** Indices into hubs. */
  edges: Array<[number, number]>;
}

/** Pick a handful of well-spaced "hub" cells and connect each to its
 *  1–2 nearest neighbors — yields a sparse, legible graph rather than
 *  a hairball. */
function generateGraph(
  cols: number,
  rows: number,
  rng: () => number,
): GraphData {
  const hubCount = Math.max(4, Math.min(9, Math.floor((cols * rows) / 22)));
  const minDist = Math.max(2, Math.floor(Math.min(cols, rows) / 3.5));
  const hubs: Cell[] = [];
  let attempts = 0;
  while (hubs.length < hubCount && attempts < 1000) {
    attempts++;
    const c = Math.floor(rng() * cols);
    const r = Math.floor(rng() * rows);
    const tooClose = hubs.some(
      h => Math.hypot(h.col - c, h.row - r) < minDist,
    );
    if (!tooClose) hubs.push({ col: c, row: r });
  }
  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < hubs.length; i++) {
    const dists = hubs
      .map((h, j) => ({
        j,
        d: Math.hypot(h.col - hubs[i]!.col, h.row - hubs[i]!.row),
      }))
      .filter(d => d.j !== i)
      .sort((a, b) => a.d - b.d);
    const links = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < Math.min(links, dists.length); k++) {
      const j = dists[k]!.j;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }
  }
  return { hubs, edges };
}

/** Resolve a cell's final color based on the active image mode.
 *  Returns { fill, stroke } at full alpha; the renderer dials these
 *  back. When `sampled` is non-null it overrides everything — that's
 *  the path used for arbitrary user-supplied images. */
function resolveCellColor(
  image: ImageMode,
  cell: Cell,
  cols: number,
  rows: number,
  fallbackColor: string,
  graph: GraphData | null,
  sampled: ReadonlyArray<ReadonlyArray<{ r: number; g: number; b: number; a: number }>> | null,
): { fill: string; stroke: string } {
  if (sampled) {
    const px = sampled[cell.row]?.[cell.col];
    if (!px || px.a < 8) {
      // Treat transparent / fully empty pixels as dim background so
      // the grid still reads as a city of slots.
      return {
        fill: withAlpha(fallbackColor, 0.04),
        stroke: withAlpha(fallbackColor, 0.1),
      };
    }
    const fill = `rgba(${px.r}, ${px.g}, ${px.b}, 0.65)`;
    const stroke = `rgba(${px.r}, ${px.g}, ${px.b}, 0.95)`;
    return { fill, stroke };
  }
  if (image === 'brain') {
    const on = sampleMask(BRAIN_MASK, cell.col, cell.row, cols, rows);
    return on
      ? { fill: withAlpha('#f472b6', 0.5), stroke: withAlpha('#f472b6', 0.95) }
      : { fill: withAlpha('#f472b6', 0.05), stroke: withAlpha('#f472b6', 0.14) };
  }
  if (image === 'skyline') {
    const on = sampleMask(SKYLINE_MASK, cell.col, cell.row, cols, rows);
    return on
      ? { fill: withAlpha('#22d3ee', 0.45), stroke: withAlpha('#22d3ee', 0.9) }
      : { fill: withAlpha('#22d3ee', 0.04), stroke: withAlpha('#22d3ee', 0.1) };
  }
  if (image === 'districts') {
    const left = cell.col < cols / 2;
    const top = cell.row < rows / 2;
    const district =
      left && top ? 'UI'
      : !left && top ? 'API'
      : left && !top ? 'DB'
      : 'AUTH';
    const color = DISTRICT_COLORS[district];
    return {
      fill: withAlpha(color, 0.42),
      stroke: withAlpha(color, 0.88),
    };
  }
  if (image === 'graph' && graph) {
    const isHub = graph.hubs.some(
      h => h.col === cell.col && h.row === cell.row,
    );
    return isHub
      ? { fill: withAlpha('#22d3ee', 0.7), stroke: withAlpha('#22d3ee', 1) }
      : { fill: withAlpha('#22d3ee', 0.04), stroke: withAlpha('#22d3ee', 0.1) };
  }
  return {
    fill: withAlpha(fallbackColor, 0.32),
    stroke: withAlpha(fallbackColor, 0.85),
  };
}

/* -------------------------------------------------------------------------- */
/* Tiling                                                                     */
/* -------------------------------------------------------------------------- */

function tileGrid(
  cols: number,
  rows: number,
  rng: () => number,
): Array<{ cells: Cell[]; shape: number }> {
  const visited = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;
  const pieces: Array<{ cells: Cell[]; shape: number }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited.has(key(c, r))) continue;

      const order = TETROMINOES.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = order[i]!;
        order[i] = order[j]!;
        order[j] = tmp;
      }

      let placedCells: Cell[] | null = null;
      let placedShape = -1;
      for (const shapeIdx of order) {
        const piece = TETROMINOES[shapeIdx]!;
        const anchor = TETROMINO_ANCHORS[shapeIdx]!;
        const dc = c - anchor.col;
        const dr = r - anchor.row;
        let fits = true;
        for (const cell of piece) {
          const nc = cell.col + dc;
          const nr = cell.row + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
            fits = false;
            break;
          }
          if (visited.has(key(nc, nr))) {
            fits = false;
            break;
          }
        }
        if (fits) {
          placedCells = piece.map(cell => ({
            col: cell.col + dc,
            row: cell.row + dr,
          }));
          placedShape = shapeIdx;
          break;
        }
      }

      if (placedCells === null) {
        placedCells = [{ col: c, row: r }];
        placedShape = -1;
      }

      for (const cell of placedCells) visited.add(key(cell.col, cell.row));
      pieces.push({ cells: placedCells, shape: placedShape });
    }
  }

  return pieces;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

type Pixel = { r: number; g: number; b: number; a: number };
type PixelGrid = ReadonlyArray<ReadonlyArray<Pixel>>;

/** Draw `src` into a `cols × rows` canvas (cover-fit, centered) and
 *  return the sampled pixel grid. Rejects on CORS taint or load error. */
function loadAndSampleImage(
  src: string,
  cols: number,
  rows: number,
): Promise<PixelGrid> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No 2d context'));
        return;
      }
      const scale = Math.max(cols / img.width, rows / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const dx = (cols - w) / 2;
      const dy = (rows - h) / 2;
      ctx.clearRect(0, 0, cols, rows);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, dx, dy, w, h);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, cols, rows).data;
      } catch (err) {
        reject(err);
        return;
      }
      const grid: Pixel[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: Pixel[] = [];
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4;
          row.push({
            r: data[i]!,
            g: data[i + 1]!,
            b: data[i + 2]!,
            a: data[i + 3]!,
          });
        }
        grid.push(row);
      }
      resolve(grid);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

export interface BlockDropLayer {
  id: string;
  name?: string;
  /** Image whose pixels define this layer's cells. Non-transparent
   *  pixels mark ownership; the pixel's RGB is the cell's color
   *  contribution. */
  imageSrc: string;
}

export interface FileCityBlockDropProps {
  className?: string;
  cols?: number;
  rows?: number;
  cellSize?: number;
  padding?: number;
  /** Time between consecutive pieces starting their fall. */
  pieceDelayMs?: number;
  /** How long a single piece's fall takes. */
  dropDurationMs?: number;
  /** Vertical pixels above the resting position where each piece starts. */
  dropDistance?: number;
  seed?: number;
  showBackground?: boolean;
  autoStart?: boolean;
  /**
   * How cells are grouped into pieces that fall together.
   * - `'tetromino'`: adjacent I/O/T/S/Z/L/J shapes.
   * - `'scatter'`: random groups of `scatterGroupSize` cells.
   */
  groupingMode?: 'tetromino' | 'scatter';
  scatterGroupSize?: number;
  /**
   * What picture the cell colors should reveal as the grid fills.
   * - `'none'`: tetris-ish per-piece colors (or accent if `colorPieces` is false).
   * - `'brain'`: pixel-art brain silhouette.
   * - `'skyline'`: pixel-art city silhouette.
   * - `'districts'`: 4 colored quadrants (UI/API/DB/AUTH).
   * - `'graph'`: dim grid with bright hub cells and connecting lines.
   */
  image?: ImageMode;
  /** Only honored when `image === 'none'`. Defaults to true. */
  colorPieces?: boolean;
  /**
   * Arbitrary image source (URL or data URL) to sample pixel colors
   * from. When set, overrides `image`: the image is drawn into a
   * cols×rows canvas (cover-fit, centered) and each cell takes its
   * color directly from the corresponding pixel. Use small / high-
   * contrast images for best results — at 12×12 you only get 144
   * pixels of detail.
   */
  imageSrc?: string;
  /**
   * When defined (0..1), switches to controlled-reveal mode: the
   * drop animation is skipped and exactly this fraction of cells is
   * shown, picked in a deterministic random order (so increasing
   * percent only adds cells, never removes any). Great for sliders
   * — "how well do you know your codebase?" going from black box to
   * full image.
   */
  revealPercent?: number;
  /** Color shown for unrevealed cells in `revealPercent` mode. Defaults
   *  to a near-black box so the unknown cells read as opaque. */
  coveredColor?: string;
  /**
   * How cells uncover as `revealPercent` grows.
   * - `'organic'` (default): start from `revealOrigin` and grow outward
   *   to adjacent cells, like a blob spreading. Matches "I learned this
   *   area first, then branched out."
   * - `'shuffle'`: pure random order. Cells uncover all over the map
   *   simultaneously. Less narratively coherent but more "even."
   */
  revealGrowth?: 'organic' | 'shuffle';
  /** Where organic growth starts. A single cell or list of seed cells.
   *  Defaults to a cell at roughly (cols * 0.25, rows * 0.45) — i.e.
   *  somewhere in the top-left district so growth crosses into the
   *  other districts as you progress. */
  revealOrigin?: Cell | ReadonlyArray<Cell>;
  /**
   * Layered-reveal mode. Each layer has its own image; cells where a
   * layer's image is non-transparent are "owned" by that layer.
   * Active layers (from `activeLayerIds`) compose by averaging RGB at
   * overlapping cells. Cells with no active owner stay covered.
   *
   * When `layers` is provided, this overrides `image`, `imageSrc`,
   * and the drop animation — the render becomes a controlled,
   * toggleable composite.
   */
  layers?: ReadonlyArray<BlockDropLayer>;
  /** IDs of currently active layers. Cells covered by any active
   *  layer are revealed. */
  activeLayerIds?: ReadonlyArray<string>;
  resetKey?: number | string;
}

export function FileCityBlockDrop({
  className,
  cols = 12,
  rows = 12,
  cellSize = 50,
  padding = 40,
  pieceDelayMs = 380,
  dropDurationMs = 650,
  dropDistance = 320,
  seed = 7,
  showBackground = true,
  autoStart = true,
  groupingMode = 'tetromino',
  scatterGroupSize = 4,
  image = 'none',
  colorPieces = true,
  imageSrc,
  revealPercent,
  coveredColor = '#0f1217',
  revealGrowth = 'organic',
  revealOrigin,
  layers,
  activeLayerIds,
  resetKey,
}: FileCityBlockDropProps) {
  const { theme } = useTheme();
  const accent = theme.colors.primary ?? '#22d3ee';
  const text = theme.colors.text ?? '#f8fafc';
  const bg = theme.colors.background ?? '#0a0f14';

  const viewW = cols * cellSize + padding * 2;
  const viewH = rows * cellSize + padding * 2;

  // Pre-generate graph topology so cell coloring can ask "is this a hub?"
  // and the renderer can draw edges between hub centers.
  const graph = useMemo(() => {
    if (image !== 'graph') return null;
    return generateGraph(cols, rows, mulberry32(seed * 31 + 1));
  }, [image, cols, rows, seed, resetKey]);

  // Load + sample an arbitrary image into a cols×rows pixel grid when
  // `imageSrc` is set. Cover-fit, centered. Setting state to null on
  // load failure falls back to the mask-based `image` mode (or none).
  const [sampledPixels, setSampledPixels] = useState<
    ReadonlyArray<ReadonlyArray<{ r: number; g: number; b: number; a: number }>> | null
  >(null);
  useEffect(() => {
    if (!imageSrc) {
      setSampledPixels(null);
      return;
    }
    if (typeof document === 'undefined') return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;
      // Cover-fit so the image fills the grid without distortion;
      // edges may be cropped which is fine for icons / portraits.
      const scale = Math.max(cols / img.width, rows / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const dx = (cols - w) / 2;
      const dy = (rows - h) / 2;
      ctx.clearRect(0, 0, cols, rows);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, dx, dy, w, h);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, cols, rows).data;
      } catch {
        // Likely a CORS taint — bail and let the fallback color path run.
        return;
      }
      const grid: Array<Array<{ r: number; g: number; b: number; a: number }>> = [];
      for (let r = 0; r < rows; r++) {
        const row: Array<{ r: number; g: number; b: number; a: number }> = [];
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4;
          row.push({
            r: data[i]!,
            g: data[i + 1]!,
            b: data[i + 2]!,
            a: data[i + 3]!,
          });
        }
        grid.push(row);
      }
      if (!cancelled) setSampledPixels(grid);
    };
    img.onerror = () => {
      if (!cancelled) setSampledPixels(null);
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc, cols, rows, resetKey]);

  const pieces = useMemo<Piece[]>(() => {
    const rng = mulberry32(seed);

    // Step 1: get cell groupings (without colors yet).
    let groups: Array<{ cells: Cell[]; shape: number }>;
    if (groupingMode === 'scatter') {
      const allCells: Cell[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) allCells.push({ col: c, row: r });
      }
      for (let i = allCells.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = allCells[i]!;
        allCells[i] = allCells[j]!;
        allCells[j] = tmp;
      }
      const size = Math.max(1, Math.floor(scatterGroupSize));
      groups = [];
      for (let i = 0; i < allCells.length; i += size) {
        groups.push({ cells: allCells.slice(i, i + size), shape: -1 });
      }
    } else {
      groups = tileGrid(cols, rows, rng);
      for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = groups[i]!;
        groups[i] = groups[j]!;
        groups[j] = tmp;
      }
    }

    // Step 2: resolve each cell's color. With an image, color comes
    // from the image function — pieces still fall as groups but each
    // cell carries its final color, so the picture forms as blocks land.
    return groups.map(group => {
      const fallbackColor =
        image === 'none' && colorPieces
          ? PIECE_PALETTE[Math.floor(rng() * PIECE_PALETTE.length)]!
          : accent;
      const cells: ColoredCell[] = group.cells.map(cell => {
        const { fill, stroke } = resolveCellColor(
          image,
          cell,
          cols,
          rows,
          fallbackColor,
          graph,
          sampledPixels,
        );
        return { col: cell.col, row: cell.row, fill, stroke };
      });
      return { cells, shape: group.shape };
    });
  }, [
    cols,
    rows,
    seed,
    groupingMode,
    scatterGroupSize,
    image,
    colorPieces,
    accent,
    graph,
    sampledPixels,
    resetKey,
  ]);

  // Load each layer's image and stash its sampled pixel grid. The map
  // is keyed by `layer.id` + dimensions so re-sizing the grid retriggers
  // resampling without thrashing unrelated layers.
  const [layerPixels, setLayerPixels] = useState<
    ReadonlyMap<string, PixelGrid>
  >(() => new Map());
  useEffect(() => {
    if (!layers || layers.length === 0) {
      setLayerPixels(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(
      layers.map(layer =>
        loadAndSampleImage(layer.imageSrc, cols, rows)
          .then(grid => ({ id: layer.id, grid }))
          .catch(() => ({ id: layer.id, grid: null as PixelGrid | null })),
      ),
    ).then(results => {
      if (cancelled) return;
      const next = new Map<string, PixelGrid>();
      for (const { id, grid } of results) {
        if (grid) next.set(id, grid);
      }
      setLayerPixels(next);
    });
    return () => {
      cancelled = true;
    };
  }, [layers, cols, rows]);

  const layered = !!(layers && layers.length > 0 && activeLayerIds);
  const controlled = !layered && typeof revealPercent === 'number';

  // For controlled mode: deterministic per-cell reveal order.
  //
  // - `'organic'`: BFS-frontier growth from `revealOrigin`. At each
  //   step, pick a random unrevealed cell that's adjacent to an
  //   already-revealed cell — yields a contiguous blob that spreads
  //   outward.
  // - `'shuffle'`: pure Fisher-Yates random order.
  //
  // Either way the same cell always uncovers at the same percent for
  // a given seed, so dragging the slider only adds cells.
  const cellRevealIndex = useMemo(() => {
    const rng = mulberry32(seed * 37 + 3);
    let ordered: Cell[];
    if (revealGrowth === 'shuffle') {
      ordered = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) ordered.push({ col: c, row: r });
      }
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = ordered[i]!;
        ordered[i] = ordered[j]!;
        ordered[j] = tmp;
      }
    } else {
      const seeds: Cell[] = Array.isArray(revealOrigin)
        ? [...(revealOrigin as ReadonlyArray<Cell>)]
        : revealOrigin
          ? [revealOrigin as Cell]
          : [
              {
                col: Math.max(0, Math.min(cols - 1, Math.floor(cols * 0.25))),
                row: Math.max(0, Math.min(rows - 1, Math.floor(rows * 0.45))),
              },
            ];
      const visited = new Set<string>();
      const inFrontier = new Set<string>();
      const frontier: Cell[] = [];
      const key = (c: number, r: number) => `${c},${r}`;
      ordered = [];

      for (const s of seeds) {
        const k = key(s.col, s.row);
        if (visited.has(k)) continue;
        visited.add(k);
        ordered.push(s);
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nc = s.col + dc;
          const nr = s.row + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const nk = key(nc, nr);
          if (visited.has(nk) || inFrontier.has(nk)) continue;
          inFrontier.add(nk);
          frontier.push({ col: nc, row: nr });
        }
      }

      while (frontier.length > 0) {
        const idx = Math.floor(rng() * frontier.length);
        const pick = frontier[idx]!;
        // swap-pop for O(1) removal
        frontier[idx] = frontier[frontier.length - 1]!;
        frontier.pop();
        const k = key(pick.col, pick.row);
        inFrontier.delete(k);
        visited.add(k);
        ordered.push(pick);
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nc = pick.col + dc;
          const nr = pick.row + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const nk = key(nc, nr);
          if (visited.has(nk) || inFrontier.has(nk)) continue;
          inFrontier.add(nk);
          frontier.push({ col: nc, row: nr });
        }
      }

      // Fallback for any disconnected cells the seeds couldn't reach
      // (shouldn't happen on a rectangular grid, but defensive).
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!visited.has(key(c, r))) {
            visited.add(key(c, r));
            ordered.push({ col: c, row: r });
          }
        }
      }
    }

    const map = new Map<string, number>();
    ordered.forEach((cell, idx) => map.set(`${cell.col},${cell.row}`, idx));
    return map;
  }, [cols, rows, seed, revealGrowth, revealOrigin, resetKey]);

  // Flatten pieces → cells for the controlled-mode render path. The
  // piece grouping (and its transform) isn't useful here since cells
  // don't fall.
  const flatColoredCells = useMemo<ColoredCell[]>(() => {
    const out: ColoredCell[] = [];
    for (const piece of pieces) {
      for (const cell of piece.cells) out.push(cell);
    }
    return out;
  }, [pieces]);

  const revealCount = controlled
    ? Math.round(
        Math.max(0, Math.min(1, revealPercent as number)) * cols * rows,
      )
    : 0;

  const [revealed, setRevealed] = useState(autoStart ? 0 : pieces.length);

  useEffect(() => {
    if (layered || controlled) {
      // Layered / slider-driven render paths handle their own reveal
      // — no animation timer needed.
      return;
    }
    if (!autoStart) {
      setRevealed(pieces.length);
      return;
    }
    setRevealed(0);
    let intervalId: number | undefined;
    const rafId = window.requestAnimationFrame(() => {
      setRevealed(1);
      if (pieces.length > 1) {
        intervalId = window.setInterval(() => {
          setRevealed(prev => {
            const next = prev + 1;
            if (next >= pieces.length) {
              window.clearInterval(intervalId);
              return pieces.length;
            }
            return next;
          });
        }, pieceDelayMs);
      }
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [autoStart, pieceDelayMs, pieces.length, resetKey, controlled, layered]);

  const allDone = controlled
    ? revealCount >= cols * rows
    : revealed >= pieces.length;
  const buildingSize = cellSize - 8;
  const gridLine = withAlpha(text, 0.05);

  const cellCenter = (col: number, row: number) => ({
    x: padding + col * cellSize + cellSize / 2,
    y: padding + row * cellSize + cellSize / 2,
  });

  // Edge fade-in delay: a beat after the last piece lands, so the
  // graph wiring is the final flourish rather than competing with the
  // drops.
  const edgeFadeDelayMs = dropDurationMs;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        overflow: 'hidden',
      }}
      role="img"
      aria-label="A grid of pieces dropping into place from above"
    >
      {showBackground && (
        <rect x={0} y={0} width={viewW} height={viewH} fill={bg} rx={12} />
      )}

      <g>
        {Array.from({ length: cols + 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={padding + i * cellSize}
            x2={padding + i * cellSize}
            y1={padding}
            y2={padding + rows * cellSize}
            stroke={gridLine}
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: rows + 1 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={padding}
            x2={padding + cols * cellSize}
            y1={padding + i * cellSize}
            y2={padding + i * cellSize}
            stroke={gridLine}
            strokeWidth={1}
          />
        ))}
      </g>

      <defs>
        <clipPath id={`block-drop-clip-${resetKey ?? 'initial'}`}>
          <rect
            x={padding}
            y={padding}
            width={cols * cellSize}
            height={rows * cellSize}
          />
        </clipPath>
      </defs>

      {layered ? (
        // Layered composite: covered base; on top, each cell takes
        // the average RGB of all active layers that "own" it
        // (non-transparent pixel at that position). Switching layers
        // cross-fades smoothly via per-cell opacity transitions.
        <g
          key={`layered-${resetKey ?? 'initial'}`}
          clipPath={`url(#block-drop-clip-${resetKey ?? 'initial'})`}
        >
          {Array.from({ length: rows }).flatMap((_, r) =>
            Array.from({ length: cols }).map((__, c) => {
              const x = padding + c * cellSize + 4;
              const y = padding + r * cellSize + 4;
              const activeIds = activeLayerIds ?? [];
              let rSum = 0,
                gSum = 0,
                bSum = 0,
                n = 0;
              for (const id of activeIds) {
                const grid = layerPixels.get(id);
                const px = grid?.[r]?.[c];
                if (px && px.a > 8) {
                  rSum += px.r;
                  gSum += px.g;
                  bSum += px.b;
                  n++;
                }
              }
              const isOwned = n > 0;
              const fill = isOwned
                ? `rgba(${Math.round(rSum / n)}, ${Math.round(gSum / n)}, ${Math.round(bSum / n)}, 0.65)`
                : 'transparent';
              const stroke = isOwned
                ? `rgba(${Math.round(rSum / n)}, ${Math.round(gSum / n)}, ${Math.round(bSum / n)}, 0.95)`
                : 'transparent';
              return (
                <g key={`cell-${c}-${r}`}>
                  <rect
                    x={x}
                    y={y}
                    width={buildingSize}
                    height={buildingSize}
                    rx={2}
                    style={{
                      fill: coveredColor,
                      stroke: withAlpha(text, 0.08),
                      strokeWidth: 1,
                    }}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={buildingSize}
                    height={buildingSize}
                    rx={2}
                    style={{
                      fill,
                      stroke,
                      strokeWidth: 1.25,
                      opacity: isOwned ? 1 : 0,
                      transition: 'opacity 280ms ease, fill 280ms ease, stroke 280ms ease',
                    }}
                  />
                </g>
              );
            }),
          )}
        </g>
      ) : controlled ? (
        // Slider-driven reveal: every cell shows a "covered" rect
        // underneath; the colored rect on top fades in once the cell's
        // shuffle index is below revealCount. Smooth opacity transitions
        // make dragging the slider feel like uncovering tiles.
        <g
          key={`controlled-${resetKey ?? 'initial'}`}
          clipPath={`url(#block-drop-clip-${resetKey ?? 'initial'})`}
        >
          {flatColoredCells.map(cell => {
            const idx = cellRevealIndex.get(`${cell.col},${cell.row}`) ?? 0;
            const isRevealed = idx < revealCount;
            const x = padding + cell.col * cellSize + 4;
            const y = padding + cell.row * cellSize + 4;
            return (
              <g key={`${cell.col},${cell.row}`}>
                <rect
                  x={x}
                  y={y}
                  width={buildingSize}
                  height={buildingSize}
                  rx={2}
                  style={{
                    fill: coveredColor,
                    stroke: withAlpha(text, 0.08),
                    strokeWidth: 1,
                  }}
                />
                <rect
                  x={x}
                  y={y}
                  width={buildingSize}
                  height={buildingSize}
                  rx={2}
                  style={{
                    fill: cell.fill,
                    stroke: cell.stroke,
                    strokeWidth: 1.25,
                    opacity: isRevealed ? 1 : 0,
                    transition: 'opacity 220ms ease',
                  }}
                />
              </g>
            );
          })}
        </g>
      ) : (
        <g
          key={`pieces-${resetKey ?? 'initial'}`}
          clipPath={`url(#block-drop-clip-${resetKey ?? 'initial'})`}
        >
          {pieces.map((piece, pieceIdx) => {
            const isVisible = pieceIdx < revealed;
            const fadeMs = Math.round(dropDurationMs * 0.4);
            return (
              <g
                key={`piece-${pieceIdx}`}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible
                    ? 'translateY(0px)'
                    : `translateY(-${dropDistance}px)`,
                  transition: `opacity ${fadeMs}ms ease, transform ${dropDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                }}
              >
                {piece.cells.map(cell => (
                  <rect
                    key={`${cell.col},${cell.row}`}
                    x={padding + cell.col * cellSize + 4}
                    y={padding + cell.row * cellSize + 4}
                    width={buildingSize}
                    height={buildingSize}
                    rx={2}
                    style={{
                      fill: cell.fill,
                      stroke: cell.stroke,
                      strokeWidth: 1.25,
                    }}
                  />
                ))}
              </g>
            );
          })}
        </g>
      )}

      {/* Graph wiring — drawn after pieces, fades in once all blocks
        * have landed. Lines connect hub-cell centers. */}
      {image === 'graph' && graph && (
        <g
          style={{
            opacity: allDone ? 1 : 0,
            transition: `opacity 700ms ease ${edgeFadeDelayMs}ms`,
            pointerEvents: 'none',
          }}
        >
          {graph.edges.map(([a, b], i) => {
            const A = cellCenter(graph.hubs[a]!.col, graph.hubs[a]!.row);
            const B = cellCenter(graph.hubs[b]!.col, graph.hubs[b]!.row);
            return (
              <line
                key={`edge-${i}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={withAlpha('#22d3ee', 0.55)}
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      )}

      {/* District labels — fade in once all blocks land, so the
        * neighborhoods name themselves at the payoff moment. */}
      {image === 'districts' && (
        <g
          style={{
            opacity: allDone ? 1 : 0,
            transition: `opacity 700ms ease ${edgeFadeDelayMs}ms`,
            pointerEvents: 'none',
          }}
        >
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
                fontSize={48}
                fontWeight={700}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill={withAlpha(text, 0.85)}
                stroke={withAlpha(bg, 0.6)}
                strokeWidth={4}
                paintOrder="stroke fill"
                letterSpacing="0.18em"
              >
                {q}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}
