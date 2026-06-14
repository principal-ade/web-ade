/**
 * Stage 4 — async authoring run types.
 *
 * Pure types (no deps) shared by the run store, the background job, and the
 * routes. The mobile contract (`mobile-app/docs/AUTHORING_API.md`) is the
 * source of truth for the client-facing `AuthoringRun` shape.
 */

export type AuthoringRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type AuthoringErrorCode =
  | 'REPO_RESOLVE_FAILED'
  | 'AGENT_NO_EMIT'
  | 'VALIDATION_FAILED'
  | 'PUBLISH_FAILED'
  | 'TIMEOUT'
  // The execution substrate (Freestyle) was unreachable / errored — an infra
  // failure, not a problem with the question or repo. Retrying later is the
  // right remedy (vs. rephrasing).
  | 'UNAVAILABLE';

export interface AuthoringRunError {
  message: string;
  code: AuthoringErrorCode;
}

export interface AuthoringRunRequest {
  owner: string;
  repo: string;
  ref?: string;
  question: string;
  /** Optional provider/model override — UI-selectable; free default when omitted. */
  model?: string;
}

/**
 * The persisted, server-side record. Carries `createdBy` (the ownership gate)
 * and `model`, neither of which is exposed to the client.
 */
export interface AuthoringRunRecord {
  runId: string;
  status: AuthoringRunStatus;
  /** GitHub numeric id of the creator — gates `GET`; never sent to the client. */
  createdBy: number;
  owner: string;
  repo: string;
  ref?: string;
  question: string;
  model?: string;
  trailId: string | null;
  trailUrl: string | null;
  error: AuthoringRunError | null;
  createdAt: string;
  updatedAt: string;
}

/** Client-facing shape (the contract) — the record minus server-only fields. */
export interface AuthoringRun {
  runId: string;
  status: AuthoringRunStatus;
  owner: string;
  repo: string;
  ref?: string;
  question: string;
  trailId: string | null;
  trailUrl: string | null;
  error: AuthoringRunError | null;
  createdAt: string;
  updatedAt: string;
}

export function toClientRun(r: AuthoringRunRecord): AuthoringRun {
  const { createdBy: _createdBy, model: _model, ...rest } = r;
  return rest;
}
