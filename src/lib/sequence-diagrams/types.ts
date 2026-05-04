/**
 * Sequence Diagrams Sharing Types
 *
 * Payload, snippet, event, edge, and base index-entry types come from
 * `@industry-theme/file-city-panel` (the shared cross-repo source of truth
 * also consumed by desktop-app/electron-app). Web-ade owns only the
 * storage-coupled extensions to those shapes (sharer identity, GitHub
 * repo id, request/response envelopes, error codes).
 */

import type {
  BaseSequenceDiagramIndexEntry,
  SequenceDiagramPayload,
} from '@industry-theme/file-city-panel';

// Re-export the shared payload-side types for consumers within this dir.
export type {
  SequenceEvent,
  SequenceEdge,
  SliceSnippet,
  DiffSnippet,
  SequenceEventSnippet,
  FileCitySequenceEventDef,
  SequenceLayoutOptions,
  SequenceDiagramPayload,
  BaseSequenceDiagramIndexEntry,
} from '@industry-theme/file-city-panel';

// ============================================================================
// Web-side index (stored in S3) — extends the shared base with sharer
// identity and the rename-stable GitHub repo id backstop.
// ============================================================================

export interface SharedSequenceDiagramIndexEntry
  extends BaseSequenceDiagramIndexEntry {
  createdBy: { githubId: number; githubLogin: string };
  /** GitHub numeric repo id at upload time, used as a rename-stable backstop. */
  githubRepoId: number;
}

export interface SharedSequenceDiagramIndex {
  version: 1;
  updatedAt: string;
  entries: SharedSequenceDiagramIndexEntry[];
}

// ============================================================================
// Request / response shapes
// ============================================================================

export interface CreateSharedDiagramRequest {
  owner: string;
  repo: string;
  payload: SequenceDiagramPayload;
}

export interface CreateSharedDiagramResponse {
  id: string;
  url: string;
  entry: SharedSequenceDiagramIndexEntry;
}

export interface ListSharedDiagramsResponse {
  entries: SharedSequenceDiagramIndexEntry[];
}

// ============================================================================
// Errors
// ============================================================================

export class SequenceDiagramShareError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'SequenceDiagramShareError';
  }
}

export const ShareErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NO_REPO_ACCESS: 'NO_REPO_ACCESS',
  NOT_FOUND: 'NOT_FOUND',
  NOT_OWNER: 'NOT_OWNER',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_OWNER_REPO: 'INVALID_OWNER_REPO',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SNIPPET_NOT_BAKED: 'SNIPPET_NOT_BAKED',
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',
  S3_ERROR: 'S3_ERROR',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
} as const;

export type ShareErrorCode =
  (typeof ShareErrorCodes)[keyof typeof ShareErrorCodes];
