/**
 * Helpers for painting commit activity onto the File City as HighlightLayers,
 * and for windowing a GitHub patch into a diff-snippet range.
 *
 * Colors follow the conventions already used for git status across the app
 * (RepoActivityCard, buildOtelHighlightLayers); the intensity→alpha math
 * mirrors the contribution heatmaps (RepoHeader / ActivityHeatmap).
 */

import type { HighlightLayer } from '@industry-theme/file-city-panel';

/** Change-status colors, matching RepoActivityCard / buildOtelHighlightLayers. */
export const CHANGE_COLORS = {
  added: '#22c55e',
  modified: '#f59e0b',
  removed: '#ef4444',
} as const;

export type ChangeStatus =
  | 'added'
  | 'removed'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged';

export function statusColor(status: ChangeStatus): string {
  if (status === 'added') return CHANGE_COLORS.added;
  if (status === 'removed') return CHANGE_COLORS.removed;
  return CHANGE_COLORS.modified;
}

/** A changed file as surfaced by the commit-detail API. */
export interface ChangedFile {
  filename: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
}

/**
 * Map an intensity in [0,1] to a 2-digit hex alpha suffix, matching the
 * `20 + intensity*80` ramp used by RepoHeader/ActivityHeatmap (so a hex color
 * like `#3b82f6` + this suffix yields a comparable translucency).
 */
export function intensityAlphaHex(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  const alpha = Math.floor(20 + clamped * 80); // 20..100 (decimal)
  return alpha.toString(16).padStart(2, '0');
}

/** Parse `#rgb` / `#rrggbb` into an [r,g,b] triple (0-255), or null. */
function parseHexColor(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Serialize an [r,g,b] triple back to `#rrggbb`. */
function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/** Blend a color toward white by `amount` (0 = unchanged, 1 = white). */
function lighten(
  [r, g, b]: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, amount));
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
}

/**
 * Build a stepped-opacity activity heatmap across the union of files touched by
 * a set of commits. Hotter files (touched by more commits across the window)
 * land in higher-opacity buckets. One layer per bucket since LayerItem has no
 * per-file opacity. Low priority so hover/selected layers paint on top.
 */
export function buildAggregateChurnLayers(
  filesByCommit: Map<string, ChangedFile[]>,
  baseColor: string,
  { buckets = 5, basePriority = 40 }: { buckets?: number; basePriority?: number } = {},
): HighlightLayer[] {
  // Count how many commits touch each file across the window.
  const commitHits = new Map<string, number>();
  for (const files of filesByCommit.values()) {
    for (const f of files) {
      commitHits.set(f.filename, (commitHits.get(f.filename) ?? 0) + 1);
    }
  }
  if (commitHits.size === 0) return [];

  // Tier by absolute commit count so the color encodes frequency directly and
  // doesn't wash out to a single opacity when the busiest file has only a few
  // commits: 1 commit → faintest tier, `buckets`+ commits → brightest.
  const tiers: string[][] = Array.from({ length: buckets }, () => []);
  for (const [path, value] of commitHits) {
    const tier = Math.min(buckets - 1, Math.max(0, value - 1));
    tiers[tier]!.push(path);
  }

  const baseRgb = parseHexColor(baseColor) ?? [59, 130, 246];
  const layers: HighlightLayer[] = [];
  tiers.forEach((paths, i) => {
    if (paths.length === 0) return;
    const t = i / Math.max(1, buckets - 1); // 0 (coolest) → 1 (hottest)
    // Bake the ramp into the color as well as the opacity: lower tiers lean
    // lighter, the top tier is the full base color — so the gradient reads even
    // if the city renderer ignores per-layer opacity.
    const color = rgbToHex(lighten(baseRgb, (1 - t) * 0.6));
    const opacity = 0.2 + t * 0.8;
    layers.push({
      id: `commit-churn-${i}`,
      name: `Churn tier ${i + 1}`,
      enabled: true,
      color,
      opacity,
      priority: basePriority + i,
      items: paths.map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'fill' as const,
      })),
    });
  });
  return layers;
}

/**
 * A single layer highlighting the files of one commit (used for the hovered
 * commit, in a color distinct from the aggregate heatmap).
 */
export function buildCommitFilesLayer(
  files: ChangedFile[],
  {
    id,
    color,
    priority,
    opacity = 0.85,
    renderStrategy = 'fill',
  }: {
    id: string;
    color: string;
    priority: number;
    opacity?: number;
    renderStrategy?: 'fill' | 'glow' | 'border';
  },
): HighlightLayer | null {
  if (files.length === 0) return null;
  return {
    id,
    name: id,
    enabled: true,
    color,
    opacity,
    priority,
    items: files.map((f) => ({
      path: f.filename,
      type: 'file' as const,
      renderStrategy,
    })),
    dynamic: true,
  };
}

/**
 * Derive the new-file line window covered by a GitHub unified patch, from its
 * `@@ -a,b +c,d @@` hunk headers. Returns the span from the first changed line
 * to the last, so a diff snippet can frame just the changed region. Returns
 * null when the patch has no parseable hunks (binary, or added/removed whole
 * file — callers fall back to the whole-file window).
 */
export function parsePatchNewRange(
  patch: string | undefined,
): { startLine: number; endLine: number } | null {
  if (!patch) return null;
  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let min = Infinity;
  let max = -Infinity;
  let m: RegExpExecArray | null;
  while ((m = hunkRe.exec(patch)) !== null) {
    const start = parseInt(m[1]!, 10);
    const count = m[2] ? parseInt(m[2], 10) : 1;
    if (start < min) min = start;
    const end = start + Math.max(0, count - 1);
    if (end > max) max = end;
  }
  if (!Number.isFinite(min) || max < 0) return null;
  return { startLine: min, endLine: Math.max(min, max) };
}

/** Best-effort syntax-highlight language hint from a filename extension. */
export function languageFromFilename(filename: string): string | undefined {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    sql: 'sql',
  };
  return ext ? map[ext] : undefined;
}
