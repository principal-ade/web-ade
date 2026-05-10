/**
 * Trails Sharing Types
 *
 * Payload, marker, snippet, view, and base index-entry types come from
 * `@industry-theme/file-city-panel` (the shared cross-repo source of truth
 * also consumed by desktop-app/electron-app). Web-ade owns only the
 * storage-coupled extensions (sharer identity, GitHub repo id,
 * request/response envelopes, error codes).
 */

import type {
  BaseTrailIndexEntry,
  TrailPayload,
} from '@industry-theme/file-city-panel';

// Re-export the shared payload-side types for consumers within this dir.
export type {
  TrailPayload,
  TrailMarker,
  TrailMarkerSnippet,
  TrailSliceSnippet,
  TrailDiffSnippet,
  TrailRepo,
  TrailView,
  TrailSequenceView,
  TrailLinearView,
  TrailGraphView,
  TrailTreeView,
  TrailTimelineView,
  SequenceMarkerRef,
  SequenceViewActor,
  SequenceViewLayout,
  TrailNote,
  TrailNoteDraft,
  TrailMarkdownNote,
  TrailMarkdownNoteScope,
  TrailSnippetNote,
  TrailSnippetSliceAnchor,
  TrailSnippetDiffAnchor,
  TrailSignOff,
  TrailSignOffDraft,
  BaseTrailIndexEntry,
} from '@industry-theme/file-city-panel';

// ============================================================================
// Web-side index (stored in S3) — extends the shared base with sharer
// identity and the rename-stable GitHub repo id backstop.
// ============================================================================

export interface SharedTrailIndexEntry extends BaseTrailIndexEntry {
  createdBy: { githubId: number; githubLogin: string };
  /** GitHub numeric repo id at upload time, used as a rename-stable backstop. */
  githubRepoId: number;
}

export interface SharedTrailIndex {
  version: 1;
  updatedAt: string;
  entries: SharedTrailIndexEntry[];
}

// ============================================================================
// Request / response shapes
// ============================================================================

export interface CreateSharedTrailRequest {
  owner: string;
  repo: string;
  payload: TrailPayload;
}

export interface CreateSharedTrailResponse {
  id: string;
  url: string;
  entry: SharedTrailIndexEntry;
}

export interface ListSharedTrailsResponse {
  entries: SharedTrailIndexEntry[];
}

// ============================================================================
// Errors
// ============================================================================

export class TrailShareError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'TrailShareError';
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
