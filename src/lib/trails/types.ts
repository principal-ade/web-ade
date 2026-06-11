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
  /**
   * Trail-owner opt-in: when true, anonymous viewers may submit notes
   * via `POST /api/trails/by-id/{id}/anon-notes`, stored in a separate
   * side-table (see `anon-notes-storage.ts`) and merged into the
   * `notes[]` array on read. When false/undefined, anon viewers fall
   * back to localStorage-only notes (see `local-mutations.ts`).
   * Flipped by the trail owner via `PATCH /settings`.
   */
  allowAnonNotes?: boolean;
}

/**
 * Strip host-private fields from a stored payload before returning
 * it to a client. Call this in any route that reads via
 * `getPayload(...)` and returns to the panel. `allowAnonNotes` is
 * also stripped here — it's surfaced as a sibling field on the GET
 * response envelope instead, since it isn't part of the panel
 * contract.
 */
export function toPublicPayload(stored: StoredTrailPayload): TrailPayload {
  const { _seenAnonIds: _drop, allowAnonNotes: _drop2, ...rest } = stored;
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
  /**
   * Total notes on the trail (authored + anonymous) at snapshot time, kept
   * fresh by `syncTrailNoteSummary` on every note mutation. Feeds the inbox
   * "& N notes" label and the "(N new)" watermark math. Absent on index
   * entries written before notification states shipped — treat as 0.
   */
  noteCount?: number;
}

export interface SharedTrailIndex {
  version: 1;
  updatedAt: string;
  entries: SharedTrailIndexEntry[];
  /**
   * GitHub repo visibility as observed at last index write (or lazy
   * backfill). Powers `/explore` and any "all public repos with trails"
   * listing without per-request GitHub calls. Visibility on actual trail
   * reads is still verified live by `checkRepoAccess`; this field is a
   * hint for listing only.
   */
  repoVisibility?: 'public' | 'private';
  /** ISO 8601 — when `repoVisibility` was last refreshed. */
  repoVisibilityCheckedAt?: string;
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
 * A row in the `/explore` listing — one per public repo that has at
 * least one trail. Sourced from `trails/{owner}/{repo}/index.json`
 * after filtering on `repoVisibility === 'public'`.
 */
export interface PublicRepoWithTrails {
  owner: string;
  repo: string;
  trailCount: number;
  /** Index `updatedAt` — when the most recent trail mutation happened. */
  lastUpdated: string;
}

export interface ListPublicReposWithTrailsResponse {
  repos: PublicRepoWithTrails[];
}

/**
 * A single public trail in the flat home/explore feed — the repo-index entry
 * plus the owner/repo it lives under, so a card can render + link without
 * resolving the id pointer. Sourced from each public repo's
 * `trails/{owner}/{repo}/index.json`. See `listPublicTrails`.
 */
export interface PublicTrailEntry extends SharedTrailIndexEntry {
  owner: string;
  repo: string;
}

export interface ListPublicTrailsResponse {
  entries: PublicTrailEntry[];
  /** `updatedAt` of the last returned entry when more remain; else absent. */
  nextCursor?: string;
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
  ANON_NOTES_DISABLED: 'ANON_NOTES_DISABLED',
  ANON_NOTE_INVALID_CHARS: 'ANON_NOTE_INVALID_CHARS',
  RATE_LIMITED: 'RATE_LIMITED',
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
   * Count of notes the recipient had seen the last time they opened the
   * trail (mark-read). Watermark for the "(N new)" badge: new notes are
   * `max(0, snapshot.noteCount - notesSeenCount)`. Absent on entries
   * created before notification states shipped — treat as 0.
   */
  notesSeenCount?: number;
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

// ============================================================================
// Outbox — sender-side mirror of the inbox. The send route writes one row per
// trail into the sender's outbox so a "Sent" view can list what they shared
// without scanning every recipient's inbox. Keyed by the sender's numeric
// GitHub id; one entry per trail (sender is always self), with the recipient
// set merged across resends.
// ============================================================================

export interface OutboxRecipient {
  githubId: number;
  githubLogin: string;
}

export interface OutboxIndexEntry {
  /** Trail id — foreign key into `/api/trails/by-id/{id}`. */
  trailId: string;
  /**
   * Everyone this trail has been delivered to, deduped by githubId. Resends
   * merge new recipients in rather than replacing — the outbox is a record of
   * "who has this trail", not just the most recent send.
   */
  recipients: OutboxRecipient[];
  /** Optional sender note from the most recent send. */
  comment?: string;
  /** ISO 8601 — most recent send/resend time. */
  sentAt: string;
  /**
   * Snapshot of the live trail entry at send-time. Patched lazily on read
   * when the live trail's updatedAt has advanced. Mirrors the inbox.
   */
  snapshot: SharedTrailIndexEntry;
  /** Resolved owner/repo for the trail — duplicated for fast list rendering. */
  owner: string;
  repo: string;
}

export interface OutboxIndex {
  version: 1;
  updatedAt: string;
  entries: OutboxIndexEntry[];
}
