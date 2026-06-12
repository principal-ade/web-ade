/**
 * STAGE 3 STUB — the in-VM environment wrapper.
 *
 * This is the *only* part that differs from the local wrapper (`core/run.ts`).
 * It boots a Freestyle VM, clones the target repo at a pinned sha, copies in
 * the same `opencode-assets/.opencode` + `core/`, and execs the identical
 * core (drive → assemble → validate) inside the VM. The validated payload
 * JSON is the boundary: it crosses back to the host, which publishes via the
 * existing `POST /api/trails` (GitHub auth stays on the host — see the auth
 * notes in docs/hosted-trail-authoring.md §9).
 *
 * Nothing in `core/` changes between here and `core/run.ts`. When you wire
 * this up:
 *
 *   1. resolve repo access + sha with the USER's token (clone-as-user):
 *      `checkRepoAccess` / `resolveHeadSha` from src/lib/trails/github-access.ts
 *   2. boot/fork a Freestyle VM (TS SDK)
 *   3. in-VM: `git clone <repo>@<sha>`, drop in core/ + .opencode assets
 *   4. in-VM: run the core → it prints a validated TrailPayload JSON
 *   5. read that JSON back out, then on the HOST: POST /api/trails
 *   6. inject the clone token only for step 3, scrub it, run opencode
 *      egress-less. Graduate to a GitHub App once runs go async.
 */

export interface FreestyleRunOpts {
  owner: string;
  repo: string;
  ref?: string;
  question: string;
  /** User's GitHub token, used only to resolve access + clone. Never reaches the agent. */
  userToken: string;
}

export async function runInFreestyle(
  _opts: FreestyleRunOpts
): Promise<never> {
  throw new Error(
    'Stage 3 not implemented yet — prove Stage L0+L1 with core/run.ts first.'
  );
}
