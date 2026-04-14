/**
 * Feed Collections Types
 *
 * Type definitions for personalized feed collections stored in S3.
 * Users can create collections of repositories and subscribe to
 * other users' public collections. Also includes types for watching
 * individual users and repositories.
 */

// ============================================================================
// Watch Limits
// ============================================================================

export const MAX_WATCHED_USERS = 10;
export const MAX_WATCHED_REPOS = 10;

// ============================================================================
// Watch Types
// ============================================================================

/**
 * A watched GitHub user
 */
export interface WatchedUser {
  login: string; // GitHub username
  watchedAt: string; // ISO timestamp
}

/**
 * A watched GitHub repository
 */
export interface WatchedRepo {
  owner: string;
  repo: string;
  watchedAt: string; // ISO timestamp
}

/**
 * A repository entry within a collection
 */
export interface CollectionRepo {
  owner: string;
  repo: string;
  description?: string;
  addedAt: string; // ISO timestamp
}

/**
 * A feed collection containing repositories
 */
export interface FeedCollection {
  id: string; // UUID
  name: string;
  description?: string;
  ownerGithubId: string;
  ownerGithubLogin: string;
  visibility: 'public' | 'private';
  repos: CollectionRepo[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * User's feed profile containing subscriptions and watches
 */
export interface UserFeedProfile {
  githubId: string;
  githubLogin: string;
  subscribedCollections: string[]; // Collection IDs
  watchedUsers: WatchedUser[]; // Max 10 users
  watchedRepos: WatchedRepo[]; // Max 10 repos
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * Input for creating a new collection
 */
export interface CreateCollectionInput {
  name: string;
  description?: string;
  visibility: 'public' | 'private';
}

/**
 * Input for adding a repo to a collection
 */
export interface AddRepoInput {
  collectionId: string;
  owner: string;
  repo: string;
  description?: string;
}

/**
 * Input for removing a repo from a collection
 */
export interface RemoveRepoInput {
  collectionId: string;
  owner: string;
  repo: string;
}

/**
 * Simplified repo for feed display (compatible with FEATURED_REPOS)
 */
export interface FeedRepo {
  owner: string;
  repo: string;
  description?: string;
}

// ============================================================================
// Commit Activity Types (Swipe Feed)
// ============================================================================

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
