/**
 * Owner-gated write authorization for tours.
 *
 * Default (no policy, or `repo-write`): any caller with GitHub read access may
 * create/delete — matching how trails gate today. An owner can tighten this
 * via the index's `writePolicy`:
 *   - `owner-only` — only the repo owner (the `{owner}` segment) may write.
 *   - `allowlist`  — the owner plus an explicit set of GitHub logins.
 *
 * `repo-write` is reserved for a future "anyone with GitHub *write* access"
 * check; until that lookup exists it behaves like the default (read-access
 * gated), so it never over-restricts.
 */

import { TrailShareError, ShareErrorCodes } from '../trails/types';
import type { TourWritePolicy } from './types';

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Throw a 403 `TrailShareError` if `login` may not write tours for `owner`
 * under `policy`. No-ops when the policy permits the write.
 */
export function assertTourWriteAllowed(
  policy: TourWritePolicy | undefined,
  login: string,
  owner: string
): void {
  if (!policy || policy.mode === 'repo-write') return;

  if (policy.mode === 'owner-only') {
    if (eq(login, owner)) return;
    throw new TrailShareError(
      'Only the repository owner may publish tours for this repository',
      403,
      ShareErrorCodes.NOT_OWNER
    );
  }

  if (policy.mode === 'allowlist') {
    const allowed =
      eq(login, owner) || (policy.allow ?? []).some((l) => eq(l, login));
    if (allowed) return;
    throw new TrailShareError(
      'You are not on the allowlist for publishing tours to this repository',
      403,
      ShareErrorCodes.NOT_OWNER
    );
  }
}
