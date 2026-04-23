/**
 * Starred Collections Types
 *
 * Type definitions for starred repository collections stored in S3.
 * Users can organize GitHub repositories and users into custom collections.
 */

// ============================================================================
// Core Collection Types
// ============================================================================

/**
 * A repository entry within a collection
 */
export interface CollectionRepo {
  owner: string; // GitHub repo owner
  repo: string; // GitHub repo name
  addedAt: string; // ISO 8601 timestamp
  description?: string; // Cached from GitHub API
  stargazersCount?: number; // Cached from GitHub API
  avatarUrl?: string; // Cached owner avatar from GitHub
  notes?: string; // User-authored note for this repo in this collection
}

/**
 * A user entry within a collection
 */
export interface CollectionUser {
  login: string; // GitHub username
  addedAt: string; // ISO 8601 timestamp
  avatarUrl?: string; // Cached from GitHub API
  name?: string; // Cached from GitHub API
}

/**
 * A collection of repositories and users
 */
export interface Collection {
  id: string; // Timestamp-based ID (e.g., "1234567890123")
  name: string; // User-defined name (required, 1-100 chars)
  description?: string; // Optional description (max 500 chars)
  icon?: string; // Lucide icon name (optional, defaults to "Star")
  ownerType: 'user' | 'org'; // Owner type (user or organization)
  ownerLogin?: string; // Organization login (only when ownerType='org')
  repos: CollectionRepo[]; // Array of repos in collection
  users: CollectionUser[]; // Array of users in collection
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

/**
 * User's collections data stored in S3
 * Path: starred-collections/{user-id}/collections.json
 */
export interface CollectionsData {
  version: number; // Monotonically increasing version for cache invalidation
  updatedAt: string; // ISO 8601 timestamp
  collections: Collection[]; // Array of collections (order = display order)
}

// ============================================================================
// GitHub Metadata Cache Types
// ============================================================================

/**
 * Cached repository metadata from GitHub API
 */
export interface CachedRepoMetadata {
  description: string | null;
  stargazersCount: number;
  avatarUrl: string;
  cachedAt: string; // ISO 8601 timestamp
}

/**
 * Cached user metadata from GitHub API
 */
export interface CachedUserMetadata {
  avatarUrl: string;
  name: string | null;
  cachedAt: string; // ISO 8601 timestamp
}

/**
 * GitHub metadata cache stored in S3
 * Path: starred-collections/{user-id}/metadata-cache.json
 */
export interface MetadataCache {
  repos: Record<string, CachedRepoMetadata>; // Key: "owner/repo"
  users: Record<string, CachedUserMetadata>; // Key: "login"
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for creating a new collection
 */
export interface CreateCollectionRequest {
  name: string;
  description?: string;
  icon?: string;
  orgLogin?: string; // Optional organization login for org-owned collections
}

/**
 * Request body for updating a collection
 */
export interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  icon?: string;
}

/**
 * Request body for adding a repo to a collection
 */
export interface AddRepoRequest {
  owner: string;
  repo: string;
}

/**
 * Request body for adding a user to a collection
 */
export interface AddUserRequest {
  login: string;
}

/**
 * Request body for updating a repo's collection-scoped fields (e.g. notes)
 */
export interface UpdateCollectionRepoRequest {
  notes?: string | null; // null clears the note
}

/**
 * Request body for reordering repos in a collection
 */
export interface ReorderReposRequest {
  repos: Array<{ owner: string; repo: string }>;
}

/**
 * Request body for reordering users in a collection
 */
export interface ReorderUsersRequest {
  users: Array<{ login: string }>;
}

/**
 * Request body for reordering collections
 */
export interface ReorderCollectionsRequest {
  collectionIds: string[];
}

/**
 * Response for list collections endpoint
 */
export interface ListCollectionsResponse {
  collections: Collection[];
  version: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for collection operations
 */
export class CollectionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'CollectionError';
  }
}

/**
 * Error codes used throughout the collections API
 */
export const ErrorCodes = {
  // Authentication errors (401)
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',

  // Authorization errors (403)
  NOT_ORG_MEMBER: 'NOT_ORG_MEMBER',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  REPO_NOT_FOUND_IN_COLLECTION: 'REPO_NOT_FOUND_IN_COLLECTION',
  USER_NOT_FOUND_IN_COLLECTION: 'USER_NOT_FOUND_IN_COLLECTION',

  // Duplicate errors (409)
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  DUPLICATE_REPO: 'DUPLICATE_REPO',
  DUPLICATE_USER: 'DUPLICATE_USER',

  // Limit errors (400)
  MAX_COLLECTIONS_EXCEEDED: 'MAX_COLLECTIONS_EXCEEDED',
  MAX_REPOS_EXCEEDED: 'MAX_REPOS_EXCEEDED',
  MAX_USERS_EXCEEDED: 'MAX_USERS_EXCEEDED',

  // Validation errors (400)
  INVALID_COLLECTION_NAME: 'INVALID_COLLECTION_NAME',
  INVALID_ICON: 'INVALID_ICON',
  INVALID_OWNER_REPO: 'INVALID_OWNER_REPO',
  INVALID_LOGIN: 'INVALID_LOGIN',
  INVALID_REORDER_REQUEST: 'INVALID_REORDER_REQUEST',

  // Concurrency errors (409)
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',

  // GitHub API errors (502)
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ORG_MEMBERSHIP_CHECK_FAILED: 'ORG_MEMBERSHIP_CHECK_FAILED',

  // S3 errors (500)
  S3_ERROR: 'S3_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
