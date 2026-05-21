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
