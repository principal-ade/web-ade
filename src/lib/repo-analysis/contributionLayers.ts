/**
 * Turn a contributor's ownership map (from the Freestyle VM repo-analysis sweep)
 * into File City HighlightLayers — the "contribution coverage" view: the files
 * one person owns, painted onto the 3D city.
 *
 * A HighlightLayer carries a single color + opacity for all its items (there's
 * no per-file opacity), so ownership *intensity* is encoded by bucketing files
 * into N stepped-opacity layers — the same trick `buildAggregateChurnLayers`
 * (commitLayers.ts) uses for churn heatmaps.
 */

import type { HighlightLayer } from '@industry-theme/file-city-panel';

/** The subset of the repo-analysis payload the contribution view consumes. */
export interface ContributionAnalysis {
  /** email → { path → lines that email owns at HEAD (per blame) }. */
  byEmail: Record<string, Record<string, number>>;
  /** path → total blamed lines in that file. */
  totalLines: Record<string, number>;
  /** `git shortlog` rows: who committed, how often. */
  contributors: Array<{ name: string; commits: number; email: string }>;
}

export interface ContributionLayerOptions {
  /** Base hex color for the contributor's buildings. */
  color?: string;
  /** Number of stepped-opacity buckets. */
  buckets?: number;
  /** Base priority; each bucket adds its index so hotter files paint on top. */
  basePriority?: number;
  /**
   * Intensity metric:
   *  - 'share'    → author's lines / total blamed lines in that file
   *                 ("who dominates this file"). Default.
   *  - 'absolute' → author's lines / their own max ("where they wrote the most").
   */
  intensity?: 'share' | 'absolute';
}

/**
 * Build stepped-opacity layers covering every file `email` owns. Returns `[]`
 * when the email has no ownership (so callers can treat it as "no highlight").
 */
export function buildContributionLayers(
  analysis: ContributionAnalysis,
  email: string,
  {
    color = '#3b82f6',
    buckets = 5,
    basePriority = 60,
    intensity = 'share',
  }: ContributionLayerOptions = {},
): HighlightLayer[] {
  const owned = analysis.byEmail[email.toLowerCase()];
  if (!owned) return [];

  const entries = Object.entries(owned);
  if (entries.length === 0) return [];

  const maxOwned = Math.max(...entries.map(([, lines]) => lines));

  // Distribute files into [buckets] tiers by intensity fraction in [0,1].
  const tiers: string[][] = Array.from({ length: buckets }, () => []);
  for (const [path, lines] of entries) {
    let frac: number;
    if (intensity === 'absolute') {
      frac = maxOwned > 0 ? lines / maxOwned : 0;
    } else {
      const total = analysis.totalLines[path] ?? lines;
      frac = total > 0 ? lines / total : 0;
    }
    const tier = Math.min(buckets - 1, Math.max(0, Math.ceil(frac * buckets) - 1));
    tiers[tier]!.push(path);
  }

  const layers: HighlightLayer[] = [];
  tiers.forEach((paths, i) => {
    if (paths.length === 0) return;
    // Opacity ramps 0.2 → 1.0 across the buckets.
    const opacity = 0.2 + (i / Math.max(1, buckets - 1)) * 0.8;
    layers.push({
      id: `contrib-${i}`,
      name: `Contribution tier ${i + 1}`,
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

/** Total lines a contributor owns across the repo (for sorting / display). */
export function totalLinesOwned(
  analysis: ContributionAnalysis,
  email: string,
): number {
  const owned = analysis.byEmail[email.toLowerCase()];
  if (!owned) return 0;
  let sum = 0;
  for (const lines of Object.values(owned)) sum += lines;
  return sum;
}

/**
 * Parse a GitHub noreply email into the identity it embeds, or null.
 * Forms: `12345678+login@users.noreply.github.com` (id available) and the older
 * `login@users.noreply.github.com`.
 */
export function parseGitHubNoreply(
  email: string,
): { id?: number; login: string } | null {
  const m = email
    .toLowerCase()
    .match(/^(?:(\d+)\+)?([a-z0-9-]+)@users\.noreply\.github\.com$/);
  if (!m) return null;
  return { id: m[1] ? Number(m[1]) : undefined, login: m[2]! };
}

/** One blame-attributed contributor, derived from the analysis itself — so the
 *  list reflects what we actually pulled, not GitHub's contributor graph. */
export interface AnalysisContributor {
  /** The blame email: the stable key and what drives the coverage highlight. */
  email: string;
  /** Display name from `git shortlog`, falling back to a noreply login / the
   *  email local-part. */
  name: string;
  /** Commits from `git shortlog --all` (0 when the email only shows up in blame). */
  commits: number;
  stats: ContributionStats;
  /** GitHub login embedded in a noreply email, when the email is one. */
  noreplyLogin?: string;
  /** GitHub numeric user id embedded in a noreply email, when present. */
  noreplyUserId?: number;
}

/**
 * Build the contributor list straight from the blame map — every email that
 * owns code at HEAD, sorted by lines owned. Each row already carries its
 * coverage stats and its highlight email, so no row is ever "unresolved":
 * GitHub identity (avatar/login) is layered on afterward as a best-effort
 * overlay, never a prerequisite for the row to exist.
 */
export function analysisContributors(
  analysis: ContributionAnalysis,
): AnalysisContributor[] {
  const totals = repoBlameTotals(analysis);
  const shortlog = new Map(
    analysis.contributors.map((c) => [c.email.toLowerCase(), c] as const),
  );
  return Object.keys(analysis.byEmail)
    .map((email) => {
      const nr = parseGitHubNoreply(email);
      const sc = shortlog.get(email);
      return {
        email,
        name: sc?.name || nr?.login || email.split('@')[0] || email,
        commits: sc?.commits ?? 0,
        stats: contributionStats(analysis, email, totals),
        noreplyLogin: nr?.login,
        noreplyUserId: nr?.id,
      };
    })
    .sort((a, b) => b.stats.lines - a.stats.lines);
}

/** Repo-wide blame denominators — compute once, reuse across contributors. */
export function repoBlameTotals(analysis: ContributionAnalysis): {
  totalLines: number;
  totalFiles: number;
} {
  let totalLines = 0;
  for (const v of Object.values(analysis.totalLines)) totalLines += v;
  return { totalLines, totalFiles: Object.keys(analysis.totalLines).length };
}

export interface ContributionStats {
  /** Blamed lines this email owns. */
  lines: number;
  /** Files this email owns ≥1 line in. */
  files: number;
  /** Total blamed lines in the repo. */
  totalLines: number;
  /** Total files with blame data. */
  totalFiles: number;
  /** lines / totalLines, in [0,1] — "percentage of lines attributed". */
  lineShare: number;
  /** files / totalFiles, in [0,1] — "percentage of files covered". */
  fileCoverage: number;
}

/** Coverage stats for one contributor. Pass `totals` to avoid recomputing the
 *  repo denominators per row in a list. */
export function contributionStats(
  analysis: ContributionAnalysis,
  email: string,
  totals: { totalLines: number; totalFiles: number } = repoBlameTotals(analysis),
): ContributionStats {
  const owned = analysis.byEmail[email.toLowerCase()] ?? {};
  const files = Object.keys(owned).length;
  let lines = 0;
  for (const v of Object.values(owned)) lines += v;
  return {
    lines,
    files,
    totalLines: totals.totalLines,
    totalFiles: totals.totalFiles,
    lineShare: totals.totalLines > 0 ? lines / totals.totalLines : 0,
    fileCoverage: totals.totalFiles > 0 ? files / totals.totalFiles : 0,
  };
}
