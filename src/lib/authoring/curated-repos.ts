/**
 * Curated set of repos verified to import cleanly into Freestyle Git for hosted
 * trail authoring, plus the user-facing notice shown when a repo can't be
 * imported.
 *
 * Background: Freestyle's server-side import (`git.repos.create({source})`)
 * currently fails for some repos (e.g. `anomalyco/opencode`, `pingdotgg/t3code`)
 * — not our code, not size alone, not the token. Until that's fixed we offer a
 * verified list to pick from and track repos that fail (see `unsupported-store`).
 *
 * This is a static, version-controlled allow-list (changing it ships in a PR).
 * The verified set was exercised directly against `freestyle@0.1.63`.
 */

export interface CuratedRepo {
  owner: string;
  repo: string;
  /** Optional ref to author against; default branch when omitted. */
  ref?: string;
  defaultBranch?: string;
  /** Short human description for the picker. */
  description?: string;
  /** GitHub-reported size in KB at verification time (rough scale signal). */
  sizeKb?: number;
  /** ISO date the import was last verified to succeed. */
  verifiedAt?: string;
}

/** Verified-good repos for the authoring picker. */
export const CURATED_AUTHORING_REPOS: CuratedRepo[] = [
  {
    owner: 'expressjs',
    repo: 'express',
    defaultBranch: 'master',
    description: 'Minimal, fast Node.js web framework.',
    sizeKb: 9789,
    verifiedAt: '2026-06-14',
  },
  {
    owner: 'sindresorhus',
    repo: 'yocto-queue',
    defaultBranch: 'main',
    description: 'Tiny queue data structure — smallest, fastest to author.',
    verifiedAt: '2026-06-14',
  },
  {
    owner: 'pierrecomputer',
    repo: 'pierre',
    defaultBranch: 'main',
    description: 'Mid-size TypeScript codebase.',
    sizeKb: 61495,
    verifiedAt: '2026-06-14',
  },
  {
    owner: 'facebook',
    repo: 'react',
    defaultBranch: 'main',
    description: 'Large mainstream codebase — exercises bigger imports.',
    verifiedAt: '2026-06-14',
  },
];

/** True if `owner/repo` is in the curated set (case-insensitive). */
export function isCuratedRepo(owner: string, repo: string): boolean {
  const key = `${owner}/${repo}`.toLowerCase();
  return CURATED_AUTHORING_REPOS.some(
    (r) => `${r.owner}/${r.repo}`.toLowerCase() === key
  );
}

/**
 * Shown to users when they pick a repo that's failed to import. Server-controlled
 * so we can update the message without a client release.
 */
export const UNSUPPORTED_NOTICE =
  "Some repositories currently can't be imported for authoring, and we're " +
  'investigating the issue. You can still try, but it may fail — meanwhile, ' +
  'pick from the verified list to get a trail right away.';
