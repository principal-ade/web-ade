/**
 * Process-lifetime cache for experimental PR-walkthrough trails.
 *
 * Two parallel maps over the same entries:
 *   - byPr:  `${owner}/${repo}#${num}@${headSha}` — used by /api/pr-trail to
 *            avoid regenerating when the PR head SHA hasn't changed.
 *   - byId:  `${trail.id}` — used by /api/trails/by-id/{id} so the
 *            "share with agent" CLI command resolves experimental trails the
 *            same way it resolves S3-backed ones.
 *
 * Entries are gone on server restart by design (the user picked "ephemeral
 * — in-memory per session").
 */

import type { TrailPayload } from '@industry-theme/file-city-panel';

export interface ExperimentalTrailEntry {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  model: string;
  generatedAt: number;
  payload: TrailPayload;
}

const byPr = new Map<string, ExperimentalTrailEntry>();
const byId = new Map<string, ExperimentalTrailEntry>();

function prKey(owner: string, repo: string, num: number, sha: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}#${num}@${sha}`;
}

export function getCachedByPr(
  owner: string,
  repo: string,
  num: number,
  sha: string,
): ExperimentalTrailEntry | undefined {
  return byPr.get(prKey(owner, repo, num, sha));
}

export function getCachedById(id: string): ExperimentalTrailEntry | undefined {
  return byId.get(id);
}

export function setCached(entry: ExperimentalTrailEntry): void {
  byPr.set(prKey(entry.owner, entry.repo, entry.prNumber, entry.headSha), entry);
  byId.set(entry.payload.id, entry);
}
