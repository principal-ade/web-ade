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
  TrailMarkerNote,
  TrailSnippetNote,
  TrailSnippetSliceAnchor,
  TrailSnippetDiffAnchor,
  TrailSignOff,
  TrailSignOffDraft,
  BaseTrailIndexEntry,
} from '@industry-theme/file-city-panel';

// 0.5.81's `TrailPurpose` / `TrailShare` aren't re-exported through the
// panel's package root, so we derive them from the field types on
// `TrailPayload`. Drop these aliases once the panel exports them.
export type TrailPurpose = NonNullable<TrailPayload['purpose']>;
export type TrailShare = NonNullable<TrailPayload['share']>;

// ============================================================================
// Host-private payload extension. The shared `TrailPayload` shape is
// the panel contract; the host stores some bookkeeping fields
// alongside it that are NEVER sent to clients (stripped before the
// trail-fetch routes return). Today: anonymous-visitor dedup IDs.
// ============================================================================

export interface StoredTrailPayload extends TrailPayload {
  /**
   * Anonymous-visitor cookie UUIDs that have already been counted
   * against this trail. Used by `/api/trails/by-id/{id}/visits` to
   * dedup `visitors.anonymousCount` increments. Stripped from
   * client-facing reads so the panel never sees raw cookie ids.
   */
  _seenAnonIds?: string[];
}

/**
 * Strip host-private fields from a stored payload before returning
 * it to a client. Call this in any route that reads via
 * `getPayload(...)` and returns to the panel.
 */
export function toPublicPayload(stored: StoredTrailPayload): TrailPayload {
  const { _seenAnonIds: _drop, ...rest } = stored;
  return rest;
}

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
  /**
   * Incoming payload from the producer. `id` and `share` are stripped /
   * ignored — the server mints `id` and stamps `share` at publish time
   * (the registry is authoritative for both).
   */
  payload: Omit<TrailPayload, 'id' | 'share'>;
}

export interface CreateSharedTrailResponse {
  id: string;
  url: string;
  entry: SharedTrailIndexEntry;
}

export interface ListSharedTrailsResponse {
  entries: SharedTrailIndexEntry[];
}

/**
 * Per-user manifest row — same shape as a repo-index entry plus the
 * owner/repo pair the trail lives under. Lets a dashboard render a card
 * with a "{owner}/{repo}" subtitle without resolving the id pointer.
 */
export interface TrailByUserEntry extends SharedTrailIndexEntry {
  owner: string;
  repo: string;
}

export interface TrailByUserIndex {
  version: 1;
  updatedAt: string;
  entries: TrailByUserEntry[];
}

export interface ListTrailsByUserResponse {
  entries: TrailByUserEntry[];
}

// ============================================================================
// Per-user "recently visited" manifest — populated on every signed-in trail
// open by `/api/trails/by-id/{id}/visits`. Independent from the by-user
// authorship manifest: this tracks trails the user has *read*, not trails
// they wrote. Anonymous opens are not recorded here.
// ============================================================================

export interface TrailRecentlyVisitedEntry {
  id: string;
  title: string;
  owner: string;
  repo: string;
  /** The trail's own updatedAt, snapshotted at visit time. */
  updatedAt: string;
  /** ISO 8601 — when this user last opened the trail. */
  lastVisitedAt: string;
  /** Times this user has opened the trail since tracking began. */
  visitCount: number;
  /** Creator's GitHub login, for "{login}'s trail" subtitles. Optional
   *  because the visits route doesn't always have it on hand. */
  createdByLogin?: string;
}

export interface TrailRecentlyVisitedIndex {
  version: 1;
  updatedAt: string;
  entries: TrailRecentlyVisitedEntry[];
}

export interface ListRecentlyVisitedTrailsResponse {
  entries: TrailRecentlyVisitedEntry[];
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
  UNKNOWN_RECIPIENT: 'UNKNOWN_RECIPIENT',
  TOO_MANY_RECIPIENTS: 'TOO_MANY_RECIPIENTS',
  RECIPIENTS_REQUIRED: 'RECIPIENTS_REQUIRED',
  COMMENT_TOO_LONG: 'COMMENT_TOO_LONG',
  INBOX_NOT_FOUND: 'INBOX_NOT_FOUND',
} as const;

export type ShareErrorCode =
  (typeof ShareErrorCodes)[keyof typeof ShareErrorCodes];

// ============================================================================
// Inbox — per-recipient delivery layer on top of the repo-centric trail store.
// See docs/file-city-trail-sharing.md and mobile-app/docs/TRAILS_API.md.
// ============================================================================

export interface InboxIndexEntry {
  /** Trail id — foreign key into the existing `/api/trails/by-id/{id}`. */
  trailId: string;
  /** Sender identity at send-time. */
  sender: { githubId: number; githubLogin: string };
  /** Optional sender note ("why I'm sharing this"). */
  comment?: string;
  /** ISO 8601 — server-stamped on send, refreshed on resend. */
  sentAt: string;
  /** ISO 8601 — server-stamped when the recipient marks the entry read. */
  readAt: string | null;
  /**
   * Snapshot of the live trail entry at send-time. Lets the inbox list
   * render without a per-row fan-out. Patched lazily on read when the live
   * trail's updatedAt has advanced.
   */
  snapshot: SharedTrailIndexEntry;
  /** Resolved owner/repo for the trail — duplicated for fast list rendering. */
  owner: string;
  repo: string;
}

export interface InboxIndex {
  version: 1;
  updatedAt: string;
  entries: InboxIndexEntry[];
}
