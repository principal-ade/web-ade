/**
 * Feed Collections Types
 *
 * Type definitions for personalized feed collections stored in S3.
 * Users can create collections of repositories and subscribe to
 * other users' public collections.
 */

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
 * User's feed profile containing subscriptions
 */
export interface UserFeedProfile {
  githubId: string;
  githubLogin: string;
  subscribedCollections: string[]; // Collection IDs
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
