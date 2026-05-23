/**
 * Stars Sharing Types
 *
 * The Starred tab on mobile is per-user, two-list: starred topics and starred
 * trails. Storage parallels the inbox subsystem in [[../trails/types.ts]] but
 * is keyed on `(githubId, targetId)` only — no sender, no comment, no read
 * state.
 *
 * See mobile-app/docs/STARRED_TOPICS_TRAILS_API.md for the full contract.
 */

import type { TopicByUserEntry } from '../topics/types';
import type { SharedTrailIndexEntry } from '../trails/types';

// ============================================================================
// Index entries
// ============================================================================

export interface StarredTopicEntry {
  /** Foreign key into `topics/_by-id/{id}.json`. */
  topicId: string;
  /** ISO 8601 — server-stamped on star, refreshed on re-star. */
  starredAt: string;
  /**
   * Slim snapshot captured at star-time so the list renders without fanning
   * out a GET per row. Refreshed lazily on detail open, never on list read.
   */
  snapshot: TopicByUserEntry;
  /**
   * Server-set on GET responses only — never stored. `true` when the
   * underlying `topics/_by-id/{topicId}.json` 404s at read time, so the
   * client can render a "no longer available" row.
   */
  gone?: true;
}

export interface StarredTopicsIndex {
  version: 1;
  updatedAt: string;
  /** Sorted by `starredAt` desc. */
  entries: StarredTopicEntry[];
}

export interface StarredTrailEntry {
  /** Foreign key into `trails/_by-id/{id}.json`. */
  trailId: string;
  /** ISO 8601 — server-stamped on star, refreshed on re-star. */
  starredAt: string;
  /** Resolved owner/repo for the trail — duplicated from the by-id pointer. */
  owner: string;
  repo: string;
  /**
   * Slim snapshot captured at star-time. Refreshed lazily on detail open,
   * never on list read.
   */
  snapshot: SharedTrailIndexEntry;
  /** Server-set on GET responses only — see `StarredTopicEntry.gone`. */
  gone?: true;
}

export interface StarredTrailsIndex {
  version: 1;
  updatedAt: string;
  /** Sorted by `starredAt` desc. */
  entries: StarredTrailEntry[];
}

// ============================================================================
// Response envelopes
// ============================================================================

export interface ListStarredTopicsResponse {
  entries: StarredTopicEntry[];
}

export interface ListStarredTrailsResponse {
  entries: StarredTrailEntry[];
}

export interface StarTopicResponse {
  entry: StarredTopicEntry;
  /** Advisory codes; omitted when empty. See `StarWarningCodes`. */
  warnings?: string[];
}

export interface StarTrailResponse {
  entry: StarredTrailEntry;
  /** Advisory codes; omitted when empty. See `StarWarningCodes`. */
  warnings?: string[];
}

// ============================================================================
// Errors and warnings
// ============================================================================

export class StarError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = 'StarError';
  }
}

export const StarErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NOT_FOUND: 'NOT_FOUND',
  NO_REPO_ACCESS: 'NO_REPO_ACCESS',
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',
  S3_ERROR: 'S3_ERROR',
} as const;

export type StarErrorCode =
  (typeof StarErrorCodes)[keyof typeof StarErrorCodes];

/**
 * Warning codes attached to a 200 response via `warnings: string[]`. Never
 * raised; never blocks the operation.
 */
export const StarWarningCodes = {
  /** 500-entry cap hit on append; oldest entry pruned. */
  STAR_LIMIT_REACHED: 'STAR_LIMIT_REACHED',
} as const;

export type StarWarningCode =
  (typeof StarWarningCodes)[keyof typeof StarWarningCodes];
