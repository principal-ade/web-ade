/**
 * Feed Activity Types
 *
 * Types for the aggregated activity feed from followed users and repos.
 */

/**
 * A single activity event in the feed
 */
export interface FeedActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened';
  timestamp: string;
  repository: string; // owner/repo
  repositoryUrl?: string;
  title?: string;
  url?: string;
  source: 'followed_user' | 'followed_repo';
  sourceIdentifier: string; // username or owner/repo
  author?: {
    login: string;
    avatarUrl?: string;
  };
  metadata?: {
    commitCount?: number;
    additions?: number;
    deletions?: number;
    prNumber?: number;
    message?: string;
  };
}

/**
 * Response from the feed activity API
 */
export interface FeedActivityResponse {
  activity: FeedActivityEvent[];
  followedUsersCount: number;
  followedReposCount: number;
}
