/**
 * Commit Activity Types (Swipe Feed)
 *
 * Type definitions for the commit-activity saved-card system stored in S3.
 */

/**
 * A single commit within an activity card
 */
export interface ActivityCommit {
  sha: string;
  message: string;
  author: {
    login: string;
    avatarUrl?: string;
  };
  committedAt: string; // ISO timestamp
  url: string; // GitHub commit URL
}

/**
 * A commit activity card for the swipe feed
 * Represents all commits for one repo within one hour bucket
 * Matches the grouping in ActivityFeedPanel
 */
export interface CommitActivityCard {
  /** Unique ID: "YYYY-MM-DD:HH:owner/repo" */
  itemId: string;
  repo: {
    owner: string;
    name: string;
  };
  /** Hour bucket (0-23) */
  hour: number;
  /** ISO timestamp for the hour bucket start */
  hourBucket: string;
  /** All commits in this repo for this hour */
  commits: ActivityCommit[];
  /** Total commit count */
  commitCount: number;
  /** Most recent commit timestamp */
  latestCommitAt: string;
}

/**
 * A saved activity card with snapshot (persists after 24h window)
 */
export interface SavedActivityCard extends CommitActivityCard {
  savedAt: string; // ISO timestamp
}

/**
 * User's commit feed state
 * Stored separately from profile due to potential size
 */
export interface CommitFeedState {
  githubId: string;
  /** Map of itemId -> array of seen commit SHAs (ephemeral, only matters for current 24h) */
  passedCommits: Record<string, string[]>;
  /** Saved activity cards with full snapshot (persistent) */
  savedCards: SavedActivityCard[];
  updatedAt: string; // ISO timestamp
}
