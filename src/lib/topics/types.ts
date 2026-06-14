/**
 * Topics Sharing Types
 *
 * A topic is a curated collection of trails on a single subject — typically
 * the same conceptual problem solved across different repos. Each trail
 * keeps its own notes/sign-offs; the topic itself is just an ordered list
 * plus a title and description.
 */

/**
 * Workflow status of a topic.
 *
 * This is the server's own copy of the wire contract — intentionally separate
 * from the desktop client's `TopicStatus` in `@principal-ai/alexandria-core-library`.
 * web-ade is a trust boundary, so the shape it accepts/returns is owned here
 * and changes only in web-ade's own diff, alongside the validator that
 * enforces it ({@link file://../validation.ts validateStatus}). It mirrors the
 * client shape so a published topic round-trips unchanged; the two are kept in
 * sync by review, not by a shared import.
 *
 * A structured `state` axis (ordered by a feature's "aliveness", from nascent
 * idea to retired), an optional free-form `label`, and a `waitingOn` descriptor
 * for holding-pattern topics parked on something external. Optional everywhere
 * — absence is treated as `new-thought`.
 */
export type TopicStatusState =
  | 'new-thought'
  | 'working'
  | 'paused'
  | 'waiting'
  | 'done-for-now'
  | 'deprecated'
  | 'abandoned';

export interface TopicStatus {
  state: TopicStatusState;
  /** Free-form text shown in place of the default per-state label. */
  label?: string;
  /** External blocker — meaningful when `state` is `waiting`. */
  waitingOn?: {
    note?: string;
    /** ISO 8601 — when the hold is expected to lift. */
    until?: string;
    ref?: {
      kind: 'url' | 'pr' | 'issue' | 'topic' | 'trail';
      value: string;
      title?: string;
    };
  };
}

/**
 * Who can read a topic.
 *
 * - `private` — creator and recipients only (recipients = users the topic has
 *   been sent to, tracked by the topic inbox). Excluded from the public feed.
 * - `public`  — anyone, by link or via the global `/topics` feed (the original
 *   topic-share behavior).
 *
 * **Absence means `private`.** New topics are private unless explicitly made
 * public, and pre-visibility topics (no field on disk) are treated as private
 * — they drop out of the feed and become creator/recipient-only with no
 * backfill. Going public is an explicit owner action (PATCH `visibility`).
 */
export type TopicVisibility = 'private' | 'public';

export interface TopicPayload {
  id: string;
  title: string;
  /** Markdown. */
  description: string;
  /** Ordered list of trail ids — foreign keys into `trails/_by-id/{id}.json`. */
  trailIds: string[];
  createdBy: { githubId: number; githubLogin: string };
  createdAt: string;
  updatedAt: string;
  /** Optional workflow status. Absent means `new-thought`. See {@link TopicStatus}. */
  status?: TopicStatus;
  /** Read access. Absent means `private`. See {@link TopicVisibility}. */
  visibility?: TopicVisibility;
}

/** A topic is public only when explicitly marked so; absence is private. */
export function isPublicTopic(topic: Pick<TopicPayload, 'visibility'>): boolean {
  return topic.visibility === 'public';
}

export interface CreateTopicRequest {
  title: string;
  description?: string;
  trailIds?: string[];
  status?: TopicStatus;
  /** Read access. Absent on create means `private`. */
  visibility?: TopicVisibility;
}

export interface UpdateTopicRequest {
  title?: string;
  description?: string;
  status?: TopicStatus;
  /** Flip a topic between `private` and `public`. */
  visibility?: TopicVisibility;
}

export interface CreateTopicResponse {
  id: string;
  url: string;
  topic: TopicPayload;
}

/**
 * Slim summary stored in the per-user manifest so "my topics" listings
 * don't need to fan out a GET per topic. Mirrors `SharedTrailIndexEntry`
 * but on the topic side: anything a dashboard card needs lives here.
 */
export interface TopicByUserEntry {
  id: string;
  title: string;
  /** First ~140 chars of `description`, plaintext, for card previews. */
  descriptionPreview: string;
  trailCount: number;
  createdAt: string;
  updatedAt: string;
  /** Mirrors {@link TopicPayload.status} so listing cards can render a badge. */
  status?: TopicStatus;
  /**
   * Mirrors {@link TopicPayload.visibility} so the public feed can filter on
   * the manifest without reading each topic record. Absent (pre-visibility
   * manifest rows) is treated as `private` and excluded from the feed.
   */
  visibility?: TopicVisibility;
}

export interface TopicByUserIndex {
  version: 1;
  updatedAt: string;
  /**
   * Owner's GitHub login. Optional for back-compat with manifests written
   * before this field existed — those are lazily backfilled by the feed
   * route (it reads one topic record, which always carries `createdBy`).
   * Single-writer (only the owner mutates), so it stays coherent under the
   * same ETag-locked write path as `entries`.
   */
  githubLogin?: string;
  entries: TopicByUserEntry[];
}

export interface ListTopicsByUserResponse {
  entries: TopicByUserEntry[];
}

/**
 * One row in the global topics feed (`/topics`). A `TopicByUserEntry`
 * lifted out of its owner's manifest and stamped with the author so the
 * HN-style feed can render a byline without a per-topic fan-out.
 */
export interface TopicFeedEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author: {
    githubId: number;
    githubLogin: string;
    /** GitHub display name, falling back to the login when unset. */
    displayName: string;
  };
  /**
   * Distinct repos whose trails this topic pulls together, sorted by
   * owner then repo. Drives the collapsed owner-avatar row and the
   * expandable repo list. Resolved via the trail id→{owner,repo} pointer
   * store, not the full trail records.
   */
  repos: Array<{ owner: string; repo: string }>;
}

export interface ListTopicsFeedResponse {
  topics: TopicFeedEntry[];
}

export class TopicShareError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = 'TopicShareError';
  }
}

export const TopicErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NOT_FOUND: 'NOT_FOUND',
  NOT_OWNER: 'NOT_OWNER',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  TRAIL_NOT_FOUND: 'TRAIL_NOT_FOUND',
  TRAIL_ALREADY_ADDED: 'TRAIL_ALREADY_ADDED',
  TOO_MANY_TRAILS: 'TOO_MANY_TRAILS',
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
  COMMENT_FORBIDDEN: 'COMMENT_FORBIDDEN',
  COMMENT_TOO_LONG: 'COMMENT_TOO_LONG',
  COMMENT_LIMIT_REACHED: 'COMMENT_LIMIT_REACHED',
  SUGGESTION_NOT_FOUND: 'SUGGESTION_NOT_FOUND',
  SUGGESTION_FORBIDDEN: 'SUGGESTION_FORBIDDEN',
  SUGGESTION_ALREADY_RESOLVED: 'SUGGESTION_ALREADY_RESOLVED',
  SUGGESTION_DUPLICATE: 'SUGGESTION_DUPLICATE',
  SUGGESTION_LIMIT_REACHED: 'SUGGESTION_LIMIT_REACHED',
  RECIPIENTS_REQUIRED: 'RECIPIENTS_REQUIRED',
  TOO_MANY_RECIPIENTS: 'TOO_MANY_RECIPIENTS',
  INBOX_NOT_FOUND: 'INBOX_NOT_FOUND',
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',
  S3_ERROR: 'S3_ERROR',
} as const;

export type TopicErrorCode =
  (typeof TopicErrorCodes)[keyof typeof TopicErrorCodes];

// ============================================================================
// Comments — flat thread attached to a topic. See docs/topic-comments.md.
// Comments are stored as a single container object per topic at
// `topics/_comments/{topicId}.json`; mutations are ETag-locked the same way
// the topic record itself is.
// ============================================================================

export interface TopicComment {
  id: string;
  topicId: string;
  body: string;
  author: { githubId: number; githubLogin: string };
  createdAt: string;
  updatedAt: string;
}

export interface TopicCommentsContainer {
  version: 1;
  topicId: string;
  /** Bumped on every container mutation — cheap "any new comments?" probe. */
  updatedAt: string;
  comments: TopicComment[];
}

export interface CreateCommentRequest {
  body: string;
}

export interface UpdateCommentRequest {
  body: string;
}

export interface ListCommentsResponse {
  topicId: string;
  updatedAt: string;
  comments: TopicComment[];
}

export interface CreateCommentResponse {
  comment: TopicComment;
}

// ============================================================================
// Trail suggestions — open contribution queue. Any GitHub-authenticated user
// can suggest a trail (their own or someone else's) for a topic; the topic
// owner reviews and accepts or rejects. See docs/topic-trail-suggestions.md.
// Suggestions are stored as a single container object per topic at
// `topics/_suggestions/{topicId}.json`; mutations are ETag-locked the same
// way the topic record itself is.
// ============================================================================

/**
 * Lifecycle:
 *   - Trail kind:   pending → accepted | rejected | withdrawn
 *   - Project kind: pending → accepted ("in progress") | rejected ("dismissed")
 *                            | withdrawn
 *                   accepted → resolved (auto, when a matching trail lands)
 *                   pending  → resolved (auto, same)
 *
 * `resolved` only applies to project kind; the trail-kind accept path already
 * appends the trail to the topic, so there's nothing left to auto-fulfill.
 */
export type SuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'resolved';

interface SuggestionBase {
  id: string;
  topicId: string;
  /** Optional one-line "why this fits" (suggester-authored). */
  reason?: string;
  suggestedBy: { githubId: number; githubLogin: string };
  status: SuggestionStatus;
  createdAt: string;
  /** Set when `status` leaves `pending`. */
  resolvedAt?: string;
  /**
   * Whoever transitioned the suggestion out of `pending`. For `accepted` /
   * `rejected` this is the topic owner; for `withdrawn` it's the suggester;
   * for `resolved` (project kind only) it's `undefined` because the
   * transition is system-driven by a matching trail-add event.
   */
  resolvedBy?: { githubId: number; githubLogin: string };
  /**
   * Optional note attached at the resolving transition — used by the project
   * kind for "dismissed because…" reasons. Distinct from `reason`, which
   * captures the original suggester's pitch.
   */
  resolveReason?: string;
}

/**
 * Trail suggestion — the original kind. Suggester points at an existing
 * trail; on accept it gets appended to the topic's trail list.
 *
 * `kind` is optional for backward compatibility with pre-discriminator
 * records on disk; readers should treat its absence as `'trail'`.
 */
export interface TrailSuggestion extends SuggestionBase {
  kind?: 'trail';
  trailId: string;
}

/**
 * Project suggestion — a repo the suggester thinks deserves a trail. Accept
 * is endorsement ("in progress") rather than a topic mutation; the
 * suggestion auto-flips to `resolved` once a trail from that repo lands in
 * the topic. See docs/topic-trail-suggestions.md.
 */
export interface ProjectSuggestion extends SuggestionBase {
  kind: 'project';
  owner: string;
  repo: string;
  /** Rename-stable backstop — matches `SharedTrailIndexEntry.githubRepoId`. */
  githubRepoId: number;
}

export type TopicSuggestion = TrailSuggestion | ProjectSuggestion;

export interface TopicSuggestionsContainer {
  version: 1;
  topicId: string;
  /** Bumped on every container mutation. */
  updatedAt: string;
  suggestions: TopicSuggestion[];
}

export interface CreateTrailSuggestionRequest {
  kind?: 'trail';
  trailId: string;
  reason?: string;
}

export interface CreateProjectSuggestionRequest {
  kind: 'project';
  owner: string;
  repo: string;
  githubRepoId?: number;
  reason?: string;
}

export type CreateSuggestionRequest =
  | CreateTrailSuggestionRequest
  | CreateProjectSuggestionRequest;

export interface CreateSuggestionResponse {
  suggestion: TopicSuggestion;
}

export interface ListSuggestionsResponse {
  topicId: string;
  updatedAt: string;
  suggestions: TopicSuggestion[];
}

export interface ResolveSuggestionResponse {
  suggestion: TopicSuggestion;
}

/**
 * Narrow a stored suggestion to the project kind. Defaults to false for
 * legacy records that predate the `kind` field — those are trails.
 */
export function isProjectSuggestion(
  s: TopicSuggestion,
): s is ProjectSuggestion {
  return s.kind === 'project';
}

// ============================================================================
// Inbox / Outbox — per-user topic delivery layer. Mirrors the trail
// send/inbox machinery (src/lib/trails/types.ts) on the topic side: a sender
// designates GitHub-login recipients, the server writes one inbox row per
// recipient, and mirrors a "sent" row into the sender's outbox. Both are keyed
// by the recipient/sender's numeric GitHub id so delivery survives a login
// change. See docs and the trails store for the shape this parallels.
// ============================================================================

/**
 * Snapshot of a topic at send-time so the inbox list renders without a
 * per-row GET. Reuses the slim {@link TopicByUserEntry} shape (title,
 * descriptionPreview, trailCount, status); patched lazily on read when the
 * live topic's `updatedAt` has advanced.
 */
export type TopicInboxSnapshot = TopicByUserEntry;

export interface TopicInboxIndexEntry {
  /** Topic id — foreign key into `topics/_by-id/{id}.json`. */
  topicId: string;
  /** Sender identity at send-time. */
  sender: { githubId: number; githubLogin: string };
  /** Optional sender note ("why I'm sharing this"). */
  comment?: string;
  /** ISO 8601 — server-stamped on send, refreshed on resend. */
  sentAt: string;
  /** ISO 8601 — server-stamped when the recipient marks the entry read. */
  readAt: string | null;
  /** Slim topic summary at send-time; patched lazily on read. */
  snapshot: TopicInboxSnapshot;
}

export interface TopicInboxIndex {
  version: 1;
  updatedAt: string;
  entries: TopicInboxIndexEntry[];
}

export interface TopicOutboxRecipient {
  githubId: number;
  githubLogin: string;
}

export interface TopicOutboxIndexEntry {
  /** Topic id — foreign key into `topics/_by-id/{id}.json`. */
  topicId: string;
  /**
   * Everyone this topic has been delivered to, deduped by githubId. Resends
   * merge new recipients in rather than replacing.
   */
  recipients: TopicOutboxRecipient[];
  /** Optional sender note from the most recent send. */
  comment?: string;
  /** ISO 8601 — most recent send/resend time. */
  sentAt: string;
  /** Slim topic summary at send-time; patched lazily on read. */
  snapshot: TopicInboxSnapshot;
}

export interface TopicOutboxIndex {
  version: 1;
  updatedAt: string;
  entries: TopicOutboxIndexEntry[];
}

// ============================================================================
// Send request / response envelopes. The request shape matches the trail send
// route's `{ recipients, comment }` so clients can reuse one contract.
// ============================================================================

export type SendTopicFailureReason = 'unknown_user' | 'invalid_login';

export interface SendTopicRequest {
  /** GitHub login recipients. */
  recipients: string[];
  /** Optional sender note. */
  comment?: string;
}

export interface SendTopicResponse {
  delivered: Array<{ login: string; githubId: number }>;
  failed: Array<{ login: string; reason: SendTopicFailureReason }>;
}

export interface ListTopicInboxResponse {
  entries: TopicInboxIndexEntry[];
  unreadCount: number;
  cursor?: string;
}

export interface ListTopicSentResponse {
  entries: TopicOutboxIndexEntry[];
  cursor?: string;
}
