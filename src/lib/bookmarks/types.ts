/**
 * Bookmarks Sharing Types
 *
 * The Bookmarked tab on mobile is per-user, two-list: bookmarked topics and bookmarked
 * trails. Storage parallels the inbox subsystem in [[../trails/types.ts]] but
 * is keyed on `(githubId, targetId)` only — no sender, no comment, no read
 * state.
 *
 * See mobile-app/docs/BOOKMARKED_TOPICS_TRAILS_API.md for the full contract.
 */

import type { TopicByUserEntry } from '../topics/types';
import type { SharedTrailIndexEntry } from '../trails/types';

// ============================================================================
// Index entries
// ============================================================================

export interface BookmarkedTopicEntry {
  /** Foreign key into `topics/_by-id/{id}.json`. */
  topicId: string;
  /** ISO 8601 — server-stamped on bookmark, refreshed on re-bookmark. */
  bookmarkedAt: string;
  /**
   * Slim snapshot captured at bookmark-time so the list renders without fanning
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

export interface BookmarkedTopicsIndex {
  version: 1;
  updatedAt: string;
  /** Sorted by `bookmarkedAt` desc. */
  entries: BookmarkedTopicEntry[];
}

export interface BookmarkedTrailEntry {
  /** Foreign key into `trails/_by-id/{id}.json`. */
  trailId: string;
  /** ISO 8601 — server-stamped on bookmark, refreshed on re-bookmark. */
  bookmarkedAt: string;
  /** Resolved owner/repo for the trail — duplicated from the by-id pointer. */
  owner: string;
  repo: string;
  /**
   * Slim snapshot captured at bookmark-time. Refreshed lazily on detail open,
   * never on list read.
   */
  snapshot: SharedTrailIndexEntry;
  /** Server-set on GET responses only — see `BookmarkedTopicEntry.gone`. */
  gone?: true;
}

export interface BookmarkedTrailsIndex {
  version: 1;
  updatedAt: string;
  /** Sorted by `bookmarkedAt` desc. */
  entries: BookmarkedTrailEntry[];
}

// ============================================================================
// Response envelopes
// ============================================================================

export interface ListBookmarkedTopicsResponse {
  entries: BookmarkedTopicEntry[];
}

export interface ListBookmarkedTrailsResponse {
  entries: BookmarkedTrailEntry[];
}

export interface BookmarkTopicResponse {
  entry: BookmarkedTopicEntry;
  /** Advisory codes; omitted when empty. See `BookmarkWarningCodes`. */
  warnings?: string[];
}

export interface BookmarkTrailResponse {
  entry: BookmarkedTrailEntry;
  /** Advisory codes; omitted when empty. See `BookmarkWarningCodes`. */
  warnings?: string[];
}

// ============================================================================
// Errors and warnings
// ============================================================================

export class BookmarkError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = 'BookmarkError';
  }
}

export const BookmarkErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NOT_FOUND: 'NOT_FOUND',
  NO_REPO_ACCESS: 'NO_REPO_ACCESS',
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',
  S3_ERROR: 'S3_ERROR',
} as const;

export type BookmarkErrorCode =
  (typeof BookmarkErrorCodes)[keyof typeof BookmarkErrorCodes];

/**
 * Warning codes attached to a 200 response via `warnings: string[]`. Never
 * raised; never blocks the operation.
 */
export const BookmarkWarningCodes = {
  /** 500-entry cap hit on append; oldest entry pruned. */
  BOOKMARK_LIMIT_REACHED: 'BOOKMARK_LIMIT_REACHED',
} as const;

export type BookmarkWarningCode =
  (typeof BookmarkWarningCodes)[keyof typeof BookmarkWarningCodes];
