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

/**
 * Build a stepped-opacity churn heatmap across the union of files touched by a
 * set of commits. Hotter files (more lines changed across the window) land in
 * higher-opacity buckets. One layer per bucket since LayerItem has no per-file
 * opacity. Low priority so hover/selected layers paint on top.
 */
export function buildAggregateChurnLayers(
  filesByCommit: Map<string, ChangedFile[]>,
  baseColor: string,
  { buckets = 5, basePriority = 40 }: { buckets?: number; basePriority?: number } = {},
): HighlightLayer[] {
  // Sum churn per file across all commits in the window.
  const churn = new Map<string, number>();
  for (const files of filesByCommit.values()) {
    for (const f of files) {
      churn.set(f.filename, (churn.get(f.filename) ?? 0) + f.additions + f.deletions);
    }
  }
  if (churn.size === 0) return [];

  const maxChurn = Math.max(...churn.values());
  if (maxChurn <= 0) return [];

  // Distribute files into [buckets] tiers by churn fraction.
  const tiers: string[][] = Array.from({ length: buckets }, () => []);
  for (const [path, value] of churn) {
    const frac = value / maxChurn;
    const tier = Math.min(buckets - 1, Math.max(0, Math.ceil(frac * buckets) - 1));
    tiers[tier]!.push(path);
  }

  const layers: HighlightLayer[] = [];
  tiers.forEach((paths, i) => {
    if (paths.length === 0) return;
    // Opacity ramps 0.2 → 1.0 across the buckets.
    const opacity = 0.2 + (i / Math.max(1, buckets - 1)) * 0.8;
    layers.push({
      id: `commit-churn-${i}`,
      name: `Churn tier ${i + 1}`,
      enabled: true,
      color: baseColor,
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
