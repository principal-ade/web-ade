/**
 * Topics Sharing Types
 *
 * A topic is a curated collection of trails on a single subject — typically
 * the same conceptual problem solved across different repos. Each trail
 * keeps its own notes/sign-offs; the topic itself is just an ordered list
 * plus a title and description.
 */

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
}

export interface CreateTopicRequest {
  title: string;
  description?: string;
  trailIds?: string[];
}

export interface UpdateTopicRequest {
  title?: string;
  description?: string;
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
}

export interface TopicByUserIndex {
  version: 1;
  updatedAt: string;
  entries: TopicByUserEntry[];
}

export interface ListTopicsByUserResponse {
  entries: TopicByUserEntry[];
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
