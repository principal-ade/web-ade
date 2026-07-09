/**
 * Transform a raw `RepoAnalysis` (with `byEmail`) into a person-keyed,
 * pre-computed shape suitable for the main GET response and paginated
 * ownership endpoint.
 *
 * Called lazily on the first GET after a fresh sweep — detects the presence
 * of `byEmail` without `precomputedContributors` and runs the transform.
 * The result is written back to S3 so subsequent reads skip the transform.
 */
import type { RepoAnalysis } from './run';
import type { IdentityByEmail, ResolvedIdentity } from './identity-cache';

// --- Exported types ---

export interface PreComputedContributor {
  /** Stable person key: `gh:{id}` when resolved, else `name:{n}` / `email:{e}`. */
  key: string;
  /** Every blame email folded into this person (lowercased). */
  emails: string[];
  /** Display name — git author name from the dominant email, or login, or email. */
  name: string;
  /** GitHub login when resolved. */
  login?: string;
  /** GitHub numeric id when resolved. */
  githubId?: number;
  avatarUrl?: string;
  htmlUrl?: string;
  /** Sum of commits across the person's emails. */
  commits: number;
  stats: ContributionStats;
}

export interface ContributionStats {
  lines: number;
  files: number;
  totalLines: number;
  totalFiles: number;
  lineShare: number;
  fileCoverage: number;
}

export interface TransformedAnalysis {
  precomputedContributors: PreComputedContributor[];
  /** Ordered person-key → file → lines, matching the contributor list order. */
  personOwnership: Record<string, Record<string, number>>;
}

// --- Helpers ---

function parseGitHubNoreply(
  email: string,
): { id?: number; login: string } | null {
  const m = email
    .toLowerCase()
    .match(/^(?:(\d+)\+)?([a-z0-9-]+)@users\.noreply\.github\.com$/);
  if (!m) return null;
  return { id: m[1] ? Number(m[1]) : undefined, login: m[2]! };
}

function repoBlameTotals(totalLines: Record<string, number>) {
  let total = 0;
  for (const v of Object.values(totalLines)) total += v;
  return { totalLines: total, totalFiles: Object.keys(totalLines).length };
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

function normalizePersonName(name: string): string | null {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return n.length > 0 ? n : null;
}

// --- Main transform ---

export function transformAnalysis(
  analysis: RepoAnalysis,
  identityByEmail: IdentityByEmail,
): TransformedAnalysis {
  const totals = repoBlameTotals(analysis.totalLines);

  // --- Step 1: build per-email contributor rows ---

  type EmailRow = {
    email: string;
    name: string;
    commits: number;
    stats: ContributionStats;
    noreplyLogin?: string;
    noreplyUserId?: number;
  };

  const shortlog = new Map<string, { name: string; commits: number; email: string }>(
    analysis.contributors.map((c) => [c.email.toLowerCase(), c] as const),
  );

  const emailRows: EmailRow[] = Object.keys(analysis.byEmail).map((email) => {
    const nr = parseGitHubNoreply(email);
    const sc = shortlog.get(email);
    return {
      email,
      name: sc?.name || nr?.login || email.split('@')[0] || email,
      commits: sc?.commits ?? 0,
      stats: statsFromOwnership(analysis.byEmail[email] ?? {}, totals),
      noreplyLogin: nr?.login,
      noreplyUserId: nr?.id,
    };
  });

  // --- Step 2: group by resolved GitHub ID ---

  type Group = {
    key: string;
    githubId?: number;
    login?: string;
    avatarUrl?: string;
    htmlUrl?: string;
    members: EmailRow[];
    names: Set<string>;
  };

  const byId = new Map<number, Group>();
  const orphans: EmailRow[] = [];

  for (const row of emailRows) {
    const overlay: ResolvedIdentity | null | undefined = row.noreplyLogin
      ? undefined
      : identityByEmail[row.email.toLowerCase()] ?? undefined;
    const id = row.noreplyUserId ?? overlay?.id;
    const login = row.noreplyLogin ?? overlay?.login;

    if (id == null) {
      orphans.push(row);
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
    g.members.push(row);
    const nn = normalizePersonName(row.name);
    if (nn) g.names.add(nn);
  }

  // Tier 2: fold orphans by display name
  const nameToGroups = new Map<string, Group[]>();
  for (const g of Array.from(byId.values())) {
    for (const nn of Array.from(g.names)) {
      const arr = nameToGroups.get(nn);
      if (arr) arr.push(g);
      else nameToGroups.set(nn, [g]);
    }
  }

  const orphanGroups = new Map<string, Group>();
  for (const row of orphans) {
    const nn = normalizePersonName(row.name);
    const matches = nn ? nameToGroups.get(nn) : undefined;
    if (nn && matches && matches.length === 1) {
      matches[0]!.members.push(row);
      continue;
    }
    if (nn && matches && matches.length > 1) {
      orphanGroups.set(`email:${row.email}`, {
        key: `email:${row.email}`,
        members: [row],
        names: new Set(),
      });
      continue;
    }
    const okey = nn ? `name:${nn}` : `email:${row.email}`;
    let g = orphanGroups.get(okey);
    if (!g) {
      g = { key: okey, members: [], names: new Set() };
      orphanGroups.set(okey, g);
    }
    g.members.push(row);
  }

  // --- Step 3: finalize — merge members into PreComputedContributor ---

  const allGroups = [...Array.from(byId.values()), ...Array.from(orphanGroups.values())];

  const precomputedContributors: PreComputedContributor[] = allGroups.map((g) => {
    const emails = g.members.map((m) => m.email.toLowerCase());
    const commits = g.members.reduce((s, m) => s + m.commits, 0);

    const mergedOwnership: Record<string, number> = {};
    for (const m of g.members) {
      const owned = analysis.byEmail[m.email.toLowerCase()];
      if (!owned) continue;
      for (const [path, lines] of Object.entries(owned) as [string, number][]) {
        mergedOwnership[path] = (mergedOwnership[path] ?? 0) + lines;
      }
    }
    const mergedStats = statsFromOwnership(mergedOwnership, totals);

    const name = g.members[0]?.name ?? g.login ?? emails[0] ?? g.key;
    const avatarUrl =
      g.avatarUrl ??
      (g.githubId != null
        ? `https://avatars.githubusercontent.com/u/${g.githubId}`
        : g.login
          ? `https://github.com/${g.login}.png`
          : undefined);

    return {
      key: g.key,
      emails,
      name,
      login: g.login,
      githubId: g.githubId,
      avatarUrl,
      htmlUrl: g.htmlUrl,
      commits,
      stats: mergedStats,
    };
  }).sort((a, b) => b.stats.lines - a.stats.lines);

  // --- Step 4: person-keyed ownership (ordered to match contributor list) ---

  const personOwnership: Record<string, Record<string, number>> = {};
  for (const person of precomputedContributors) {
    const merged: Record<string, number> = {};
    for (const email of person.emails) {
      const owned = analysis.byEmail[email];
      if (!owned) continue;
      for (const [path, lines] of Object.entries(owned) as [string, number][]) {
        merged[path] = (merged[path] ?? 0) + lines;
      }
    }
    personOwnership[person.key] = merged;
  }

  return { precomputedContributors, personOwnership };
}

/**
 * Check whether a cached analysis needs the transform (has `byEmail` but
 * no `precomputedContributors`). Used by the GET handler to decide whether
 * to run the transform on first read.
 */
export function needsTransform(analysis: RepoAnalysis): boolean {
  return (
    'byEmail' in analysis &&
    !('precomputedContributors' in analysis)
  );
}
