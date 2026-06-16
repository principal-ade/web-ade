/**
 * Hosted-authoring SESSION types.
 *
 * A session splits the cold-create run (`run-types.ts`) into two phases so the
 * client can show what's happening and gate the question field on a successful
 * Freestyle Git import:
 *
 *   queued → importing → preparing → ready        (prepare — no question yet)
 *                                      │  POST /sessions/{id}/ask
 *                                      ▼
 *                                   authoring → succeeded | failed
 *
 * `importing` = `freestyle.git.repos.create` (the step that fails most often;
 *   a failure here stops the user before they ask). `preparing` = VM boot +
 *   clone. `ready` = VM is up with the repo cloned, waiting for a question.
 *   `expired` = the TTL reaper tore down a `ready` session no one asked.
 *
 * The mobile contract (`mobile-app/docs/AUTHORING_API.md`) is the source of
 * truth for the client-facing `AuthoringSession` shape.
 */
import type { AuthoringRunError } from './run-types';

export type { AuthoringErrorCode, AuthoringRunError } from './run-types';

export type AuthoringSessionStatus =
  | 'queued'
  | 'importing'
  | 'preparing'
  | 'ready'
  | 'authoring'
  | 'succeeded'
  | 'failed'
  | 'expired';

/** Statuses past which no further work happens (poll can stop). */
export function isTerminalSessionStatus(s: AuthoringSessionStatus): boolean {
  return s === 'succeeded' || s === 'failed' || s === 'expired';
}

/**
 * The persisted, server-side record. Carries `createdBy` (the ownership gate),
 * `model`, and the live Freestyle resource ids — none of which is exposed to
 * the client.
 */
export interface AuthoringSessionRecord {
  sessionId: string;
  status: AuthoringSessionStatus;
  /** GitHub numeric id of the creator — gates `GET`/`ask`; never sent to the client. */
  createdBy: number;
  owner: string;
  repo: string;
  ref?: string;
  model?: string;
  /** Set once the user asks (status → authoring). */
  question: string | null;
  // Live Freestyle resources backing a prepared session (set at `ready`). Used
  // to reconnect to the VM for the ask phase and to tear everything down.
  vmId: string | null;
  repoId: string | null;
  identityId: string | null;
  /** Host-resolved HEAD sha (display); authoritative sha is stamped in-VM. */
  sha: string | null;
  trailId: string | null;
  trailUrl: string | null;
  error: AuthoringRunError | null;
  createdAt: string;
  updatedAt: string;
}

/** Client-facing shape (the contract) — the record minus server-only fields. */
export interface AuthoringSession {
  sessionId: string;
  status: AuthoringSessionStatus;
  owner: string;
  repo: string;
  ref?: string;
  question: string | null;
  trailId: string | null;
  trailUrl: string | null;
  error: AuthoringRunError | null;
  createdAt: string;
  updatedAt: string;
}

export function toClientSession(r: AuthoringSessionRecord): AuthoringSession {
  const {
    createdBy: _createdBy,
    model: _model,
    vmId: _vmId,
    repoId: _repoId,
    identityId: _identityId,
    sha: _sha,
    ...rest
  } = r;
  return rest;
}
