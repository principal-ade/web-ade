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
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',
  S3_ERROR: 'S3_ERROR',
} as const;

export type TopicErrorCode =
  (typeof TopicErrorCodes)[keyof typeof TopicErrorCodes];
