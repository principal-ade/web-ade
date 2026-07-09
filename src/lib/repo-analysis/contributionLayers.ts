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
  /** email → { path → lines that email owns at HEAD (per blame). Present on raw
   *  sweep output; absent after the lazy transform replaces it with
   *  precomputedContributors + personOwnership. */
  byEmail?: Record<string, Record<string, number>>;
  /** Pre-computed person-keyed contributor list (populated by the lazy transform).
   *  When present, the UI should read from this instead of deriving from byEmail. */
  precomputedContributors?: Array<{
    key: string;
    emails: string[];
    name: string;
    login?: string;
    githubId?: number;
    avatarUrl?: string;
    htmlUrl?: string;
    commits: number;
    stats: ContributionStats;
  }>;
  /** person-key → { path → lines that person owns }. Populated alongside
   *  precomputedContributors by the lazy transform. Used for highlight layers. */
  personOwnership?: Record<string, Record<string, number>>;
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
  options: ContributionLayerOptions = {},
): HighlightLayer[] {
  return buildOwnershipLayers(
    getOwnershipForEmail(analysis, email),
    analysis.totalLines,
    options,
  );
}

/**
 * Layers for a *merged* person — the union of files owned across all their blame
 * emails. Identity merging (id-then-name) collapses one human's several emails
 * into one row, so the highlight has to span every email they commit under.
 */
export function buildMergedContributionLayers(
  analysis: ContributionAnalysis,
  emails: string[],
  options: ContributionLayerOptions = {},
): HighlightLayer[] {
  return buildOwnershipLayers(
    mergeOwnership(analysis, emails),
    analysis.totalLines,
    options,
  );
}

/** Look up the file → lines ownership map for a single email. When the
 *  post-transform `personOwnership` is available, resolves the email to its
 *  person key first; otherwise falls back to `byEmail`. */
function getOwnershipForEmail(
  analysis: ContributionAnalysis,
  email: string,
): Record<string, number> | undefined {
  const lc = email.toLowerCase();
  if (analysis.personOwnership) {
    // Find the person key whose emails[] contains this email.
    for (const [key, ownership] of Object.entries(analysis.personOwnership)) {
      // The key itself may match (e.g. "email:foo@bar.com" when byEmail was
      // absent and the person was never resolved).
      if (key === lc) return ownership;
    }
    // Also check the precomputedContributors list for the email → key mapping.
    if (analysis.precomputedContributors) {
      for (const pc of analysis.precomputedContributors) {
        if (pc.emails.includes(lc)) {
          return analysis.personOwnership[pc.key];
        }
      }
    }
    return undefined;
  }
  return analysis.byEmail?.[lc];
}

/** Core layer builder over a raw `path → lines` ownership map. */
function buildOwnershipLayers(
  owned: Record<string, number> | undefined,
  totalLines: Record<string, number>,
  {
    color = '#3b82f6',
    buckets = 5,
    basePriority = 60,
    intensity = 'share',
  }: ContributionLayerOptions = {},
): HighlightLayer[] {
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
      const total = totalLines[path] ?? lines;
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
  const owned = getOwnershipForEmail(analysis, email);
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
 *
 * When `precomputedContributors` is present (post-transform), returns it
 * directly — the precomputed list is already sorted and carries stats.
 */
export function analysisContributors(
  analysis: ContributionAnalysis,
): AnalysisContributor[] {
  // Fast path: pre-computed contributor list from the lazy transform.
  if (analysis.precomputedContributors) {
    return analysis.precomputedContributors.map((pc) => ({
      // Use the first email as the canonical email for highlight layer lookups.
      email: pc.emails[0] ?? pc.key,
      name: pc.name,
      commits: pc.commits,
      stats: pc.stats,
      noreplyLogin: pc.login,
      noreplyUserId: pc.githubId,
    }));
  }

  // Slow path: derive from raw byEmail (pre-transform or fallback).
  const byEmail = analysis.byEmail ?? {};
  const totals = repoBlameTotals(analysis);
  const shortlog = new Map(
    analysis.contributors.map((c) => [c.email.toLowerCase(), c] as const),
  );
  return Object.keys(byEmail)
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
  return statsFromOwnership(getOwnershipForEmail(analysis, email) ?? {}, totals);
}

/** Coverage stats for a *merged* person across all their blame emails. */
export function mergedContributionStats(
  analysis: ContributionAnalysis,
  emails: string[],
  totals: { totalLines: number; totalFiles: number } = repoBlameTotals(analysis),
): ContributionStats {
  return statsFromOwnership(mergeOwnership(analysis, emails), totals);
}

function statsFromOwnership(
  owned: Record<string, number>,
  totals: { totalLines: number; totalFiles: number },
): ContributionStats {
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

/**
 * Union the ownership maps of several emails into one `path → lines` map. Blame
 * attributes each line to exactly one email, so when one person owns lines in
 * the same file under two emails the per-path sum is their true ownership (it
 * can't exceed `totalLines[path]`). The key building block for person-merge:
 * one human's coverage is the union over every email they commit under.
 */
export function mergeOwnership(
  analysis: ContributionAnalysis,
  emails: string[],
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const email of emails) {
    const owned = getOwnershipForEmail(analysis, email);
    if (!owned) continue;
    for (const [path, lines] of Object.entries(owned)) {
      merged[path] = (merged[path] ?? 0) + lines;
    }
  }
  return merged;
}

/** GitHub account resolved for a blame email via the API overlay
 *  (`getCommitAuthorsByEmail`). Noreply emails already carry this on the
 *  AnalysisContributor, so the resolver is only consulted for the rest. */
export interface EmailIdentity {
  login: string;
  id: number;
  avatarUrl?: string;
  htmlUrl?: string;
}

/** One human, after collapsing every blame email that is the same person. */
export interface MergedContributor {
  /** Stable key: `gh:{id}` when GitHub-resolved, else `name:{n}` / `email:{e}`. */
  key: string;
  /** Every blame email folded into this person (lowercased) — drives the
   *  highlight: the union of files across all of them. */
  emails: string[];
  /** Display name — the git author name (from shortlog) when known, else a
   *  resolved login, else an email. */
  name: string;
  /** GitHub login when resolved (noreply-decoded or API overlay). */
  login?: string;
  /** Resolved GitHub numeric id — the merge key when present. */
  githubId?: number;
  avatarUrl?: string;
  htmlUrl?: string;
  /** Commits summed across the person's emails. */
  commits: number;
  stats: ContributionStats;
}

/** Normalize a display name for the orphan name-fallback merge: lowercase,
 *  trim, collapse internal whitespace. Empty → null (never a merge key). */
function normalizePersonName(name: string): string | null {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return n.length > 0 ? n : null;
}

/**
 * Collapse blame-email rows into people. Two-tier, per the t3code use case:
 *
 *  1. **By resolved GitHub id** (authoritative). The id comes from a noreply
 *     email (decoded locally) or the API overlay. This unifies a person's
 *     noreply + verified emails — and correctly merges two *different* display
 *     names that share one id (e.g. `justsomelegs`/`legs`), which a name-based
 *     merge would wrongly split.
 *
 *  2. **By display name** (fallback) for the residual orphans GitHub can't
 *     attribute — local-machine emails like `julius@mac.lan`. An orphan folds
 *     into an id-group when exactly one id-group carries its name; ambiguous
 *     matches (the name spans >1 id-group) are left standalone to avoid merging
 *     two real people. Orphans with no id-group match cluster with other
 *     same-name orphans. Names are unreliable, so this tier is best-effort.
 *
 * `identityOf` resolves an email's API overlay (undefined for unresolved).
 */
export function mergeContributors(
  analysis: ContributionAnalysis,
  people: AnalysisContributor[],
  identityOf: (email: string) => EmailIdentity | undefined,
  totals: { totalLines: number; totalFiles: number } = repoBlameTotals(analysis),
): MergedContributor[] {
  type Group = {
    key: string;
    githubId?: number;
    login?: string;
    avatarUrl?: string;
    htmlUrl?: string;
    /** Members, kept in input order (which is lines-desc) so the first is the
     *  dominant contributor — used to pick the display name. */
    members: AnalysisContributor[];
    /** Normalized names seen in this id-group, for the orphan fallback. */
    names: Set<string>;
  };

  const byId = new Map<number, Group>();
  const orphans: AnalysisContributor[] = [];

  // Tier 1 — group everything with a resolved GitHub id.
  for (const p of people) {
    const overlay = p.noreplyLogin ? undefined : identityOf(p.email);
    const id = p.noreplyUserId ?? overlay?.id;
    const login = p.noreplyLogin ?? overlay?.login;
    if (id == null) {
      orphans.push(p);
      continue;
    }
    let g = byId.get(id);
    if (!g) {
      g = {
        key: `gh:${id}`,
        githubId: id,
        login,
        avatarUrl: overlay?.avatarUrl,
        htmlUrl: overlay?.htmlUrl,
        members: [],
        names: new Set(),
      };
      byId.set(id, g);
    }
    g.login ??= login;
    g.avatarUrl ??= overlay?.avatarUrl;
    g.htmlUrl ??= overlay?.htmlUrl;
    g.members.push(p);
    const nn = normalizePersonName(p.name);
    if (nn) g.names.add(nn);
  }

  // Index normalized-name → the id-group(s) carrying it (Tier 2 lookup).
  const nameToGroups = new Map<string, Group[]>();
  for (const g of byId.values()) {
    for (const nn of g.names) {
      const arr = nameToGroups.get(nn);
      if (arr) arr.push(g);
      else nameToGroups.set(nn, [g]);
    }
  }

  // Tier 2 — fold orphans by display name; cluster leftover orphans by name.
  const orphanGroups = new Map<string, Group>();
  for (const p of orphans) {
    const nn = normalizePersonName(p.name);
    const matches = nn ? nameToGroups.get(nn) : undefined;
    if (nn && matches && matches.length === 1) {
      // Unambiguous: fold into the single id-group with this name.
      matches[0]!.members.push(p);
      continue;
    }
    if (nn && matches && matches.length > 1) {
      // Ambiguous across people — keep standalone rather than guess.
      orphanGroups.set(`email:${p.email}`, {
        key: `email:${p.email}`,
        members: [p],
        names: new Set(),
      });
      continue;
    }
    // No id-group with this name: cluster same-name orphans together.
    const okey = nn ? `name:${nn}` : `email:${p.email}`;
    let g = orphanGroups.get(okey);
    if (!g) {
      g = { key: okey, members: [], names: new Set() };
      orphanGroups.set(okey, g);
    }
    g.members.push(p);
  }

  const finalize = (g: Group): MergedContributor => {
    const emails = g.members.map((m) => m.email.toLowerCase());
    const commits = g.members.reduce((s, m) => s + m.commits, 0);
    // Prefer the git author name (from the dominant member — first, since input
    // is lines-desc); fall back to the resolved login, then an email.
    const name = g.members[0]?.name ?? g.login ?? emails[0] ?? g.key;
    const avatarUrl =
      g.avatarUrl ??
      (g.githubId != null
        ? `https://avatars.githubusercontent.com/u/${g.githubId}`
        : g.login
          ? `https://github.com/${g.login}.png`
          : undefined);

    // When precomputedContributors is present, use its stats directly —
    // personOwnership is excluded from the API response so we can't recompute.
    let stats: ContributionStats;
    if (analysis.precomputedContributors) {
      // Find the precomputed contributor whose first email matches this group's
      // dominant member (or whose key matches the group key).
      const pc = analysis.precomputedContributors.find(
        (c) => c.key === g.key || c.emails.includes(emails[0]!),
      );
      if (pc) {
        stats = pc.stats;
      } else {
        // Fallback: compute from byEmail if available (pre-transform data).
        stats = mergedContributionStats(analysis, emails, totals);
      }
    } else {
      stats = mergedContributionStats(analysis, emails, totals);
    }

    return {
      key: g.key,
      emails,
      name,
      login: g.login,
      githubId: g.githubId,
      avatarUrl,
      htmlUrl: g.htmlUrl ?? (g.login ? `https://github.com/${g.login}` : undefined),
      commits,
      stats,
    };
  };

  return [...byId.values(), ...orphanGroups.values()]
    .map(finalize)
    .sort((a, b) => b.stats.lines - a.stats.lines);
}
