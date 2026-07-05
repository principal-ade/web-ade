/**
 * Starred Collections Validation
 *
 * Input validation functions for collection operations.
 * Throws CollectionError with appropriate status codes and error codes.
 */

import { CollectionError, ErrorCodes } from './types';
import type {
  Collection,
  CollectionsData,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  AddRepoRequest,
  AddUserRequest,
  ReorderReposRequest,
  ReorderUsersRequest,
  ReorderCollectionsRequest,
} from './types';
import {
  VALID_ICONS,
  DEFAULT_ICON,
  VALID_VISIBILITY_VALUES,
  DEFAULT_VISIBILITY,
  MAX_COLLECTION_NAME_LENGTH,
  MIN_COLLECTION_NAME_LENGTH,
  MAX_COLLECTION_DESCRIPTION_LENGTH,
  MAX_COLLECTIONS,
  MAX_REPOS_PER_COLLECTION,
  MAX_USERS_PER_COLLECTION,
} from './constants';

// ============================================================================
// Collection Validation
// ============================================================================

/**
 * Validates collection name
 * @throws {CollectionError} if name is invalid
 */
export function validateCollectionName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new CollectionError(
      'Collection name is required',
      400,
      ErrorCodes.INVALID_COLLECTION_NAME
    );
  }

  const trimmed = name.trim();

  if (trimmed.length < MIN_COLLECTION_NAME_LENGTH) {
    throw new CollectionError(
      `Collection name must be at least ${MIN_COLLECTION_NAME_LENGTH} character`,
      400,
      ErrorCodes.INVALID_COLLECTION_NAME
    );
  }

  if (trimmed.length > MAX_COLLECTION_NAME_LENGTH) {
    throw new CollectionError(
      `Collection name must not exceed ${MAX_COLLECTION_NAME_LENGTH} characters`,
      400,
      ErrorCodes.INVALID_COLLECTION_NAME
    );
  }
}

/**
 * Validates collection description
 * @throws {CollectionError} if description is invalid
 */
export function validateCollectionDescription(description?: string): void {
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      throw new CollectionError(
        'Collection description must be a string',
        400,
        ErrorCodes.INVALID_COLLECTION_NAME
      );
    }

    if (description.length > MAX_COLLECTION_DESCRIPTION_LENGTH) {
      throw new CollectionError(
        `Collection description must not exceed ${MAX_COLLECTION_DESCRIPTION_LENGTH} characters`,
        400,
        ErrorCodes.INVALID_COLLECTION_NAME
      );
    }
  }
}

/**
 * Validates collection icon
 * @throws {CollectionError} if icon is invalid
 * @returns Valid icon name or default icon
 */
export function validateCollectionIcon(icon?: string): string {
  if (!icon) {
    return DEFAULT_ICON;
  }

  if (!VALID_ICONS.includes(icon as never)) {
    throw new CollectionError(
      `Invalid icon. Must be one of: ${VALID_ICONS.join(', ')}`,
      400,
      ErrorCodes.INVALID_ICON
    );
  }

  return icon;
}

/**
 * Validates collection visibility
 * @throws {CollectionError} if visibility is invalid
 * @returns Valid visibility value or default
 */
export function validateCollectionVisibility(
  visibility?: string
): 'public' | 'private' {
  if (!visibility) {
    return DEFAULT_VISIBILITY;
  }

  if (
    !VALID_VISIBILITY_VALUES.includes(visibility as never)
  ) {
    throw new CollectionError(
      `Invalid visibility. Must be one of: ${VALID_VISIBILITY_VALUES.join(', ')}`,
      400,
      ErrorCodes.INVALID_VISIBILITY
    );
  }

  return visibility as 'public' | 'private';
}

/**
 * Validates create collection request
 * @throws {CollectionError} if request is invalid
 */
export function validateCreateCollectionRequest(
  request: CreateCollectionRequest
): void {
  validateCollectionName(request.name);
  validateCollectionDescription(request.description);
  validateCollectionIcon(request.icon);
  validateCollectionVisibility(request.visibility);
}

/**
 * Validates update collection request
 * @throws {CollectionError} if request is invalid
 */
export function validateUpdateCollectionRequest(
  request: UpdateCollectionRequest
): void {
  if (request.name !== undefined) {
    validateCollectionName(request.name);
  }

  if (request.description !== undefined) {
    validateCollectionDescription(request.description);
  }

  if (request.icon !== undefined) {
    validateCollectionIcon(request.icon);
  }

  if (request.visibility !== undefined) {
    validateCollectionVisibility(request.visibility);
  }

  // Ensure at least one field is being updated
  if (
    request.name === undefined &&
    request.description === undefined &&
    request.icon === undefined &&
    request.visibility === undefined
  ) {
    throw new CollectionError(
      'At least one field (name, description, icon, or visibility) must be provided',
      400,
      ErrorCodes.INVALID_COLLECTION_NAME
    );
  }
}

// ============================================================================
// GitHub Identifier Validation
// ============================================================================

/**
 * Validates GitHub repository owner/name
 * Allows alphanumeric, hyphens, underscores, and dots
 * @throws {CollectionError} if owner/repo is invalid
 */
export function validateGitHubRepo(owner: string, repo: string): void {
  const githubIdentifierPattern = /^[a-zA-Z0-9._-]+$/;

  if (!owner || typeof owner !== 'string' || !githubIdentifierPattern.test(owner)) {
    throw new CollectionError(
      'Invalid repository owner format',
      400,
      ErrorCodes.INVALID_OWNER_REPO
    );
  }

  if (!repo || typeof repo !== 'string' || !githubIdentifierPattern.test(repo)) {
    throw new CollectionError(
      'Invalid repository name format',
      400,
      ErrorCodes.INVALID_OWNER_REPO
    );
  }
}

/**
 * Validates GitHub username (login)
 * Allows alphanumeric and hyphens (not at start/end)
 * @throws {CollectionError} if login is invalid
 */
export function validateGitHubLogin(login: string): void {
  if (!login || typeof login !== 'string') {
    throw new CollectionError(
      'GitHub username is required',
      400,
      ErrorCodes.INVALID_LOGIN
    );
  }

  // GitHub usernames: alphanumeric and single hyphens, cannot start/end with hyphen
  const loginPattern = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/;

  if (!loginPattern.test(login)) {
    throw new CollectionError(
      'Invalid GitHub username format',
      400,
      ErrorCodes.INVALID_LOGIN
    );
  }
}

/**
 * Validates add repo request
 * @throws {CollectionError} if request is invalid
 */
export function validateAddRepoRequest(request: AddRepoRequest): void {
  validateGitHubRepo(request.owner, request.repo);
}

/**
 * Validates add user request
 * @throws {CollectionError} if request is invalid
 */
export function validateAddUserRequest(request: AddUserRequest): void {
  validateGitHubLogin(request.login);
}

// ============================================================================
// Limit Validation
// ============================================================================

/**
 * Checks if adding a new collection would exceed the limit
 * @throws {CollectionError} if limit would be exceeded
 */
export function checkCollectionsLimit(data: CollectionsData): void {
  if (data.collections.length >= MAX_COLLECTIONS) {
    throw new CollectionError(
      `Maximum of ${MAX_COLLECTIONS} collections allowed per user`,
      400,
      ErrorCodes.MAX_COLLECTIONS_EXCEEDED
    );
  }
}

/**
 * Checks if adding a new repo would exceed the limit
 * @throws {CollectionError} if limit would be exceeded
 */
export function checkReposLimit(collection: Collection): void {
  if (collection.repos.length >= MAX_REPOS_PER_COLLECTION) {
    throw new CollectionError(
      `Maximum of ${MAX_REPOS_PER_COLLECTION} repositories allowed per collection`,
      400,
      ErrorCodes.MAX_REPOS_EXCEEDED
    );
  }
}

/**
 * Checks if adding a new user would exceed the limit
 * @throws {CollectionError} if limit would be exceeded
 */
export function checkUsersLimit(collection: Collection): void {
  if (collection.users.length >= MAX_USERS_PER_COLLECTION) {
    throw new CollectionError(
      `Maximum of ${MAX_USERS_PER_COLLECTION} users allowed per collection`,
      400,
      ErrorCodes.MAX_USERS_EXCEEDED
    );
  }
}

// ============================================================================
// Duplicate Validation
// ============================================================================

/**
 * Checks if collection name already exists (case-insensitive)
 * @throws {CollectionError} if name already exists
 */
export function checkDuplicateCollectionName(
  data: CollectionsData,
  name: string,
  excludeId?: string
): void {
  const normalizedName = name.trim().toLowerCase();

  const duplicate = data.collections.find(
    (c) => c.id !== excludeId && c.name.trim().toLowerCase() === normalizedName
  );

  if (duplicate) {
    throw new CollectionError(
      'A collection with this name already exists',
      409,
      ErrorCodes.DUPLICATE_NAME
    );
  }
}

/**
 * Checks if repo already exists in collection
 * @throws {CollectionError} if repo already exists
 */
export function checkDuplicateRepo(
  collection: Collection,
  owner: string,
  repo: string
): void {
  const exists = collection.repos.some(
    (r) =>
      r.owner.toLowerCase() === owner.toLowerCase() &&
      r.repo.toLowerCase() === repo.toLowerCase()
  );

  if (exists) {
    throw new CollectionError(
      'Repository already exists in this collection',
      409,
      ErrorCodes.DUPLICATE_REPO
    );
  }
}

/**
 * Checks if user already exists in collection
 * @throws {CollectionError} if user already exists
 */
export function checkDuplicateUser(collection: Collection, login: string): void {
  const exists = collection.users.some(
    (u) => u.login.toLowerCase() === login.toLowerCase()
  );

  if (exists) {
    throw new CollectionError(
      'User already exists in this collection',
      409,
      ErrorCodes.DUPLICATE_USER
    );
  }
}

// ============================================================================
// Reorder Validation
// ============================================================================

/**
 * Validates reorder repos request
 * Ensures all repos match exactly (no additions, no removals, no duplicates)
 * @throws {CollectionError} if request is invalid
 */
export function validateReorderReposRequest(
  collection: Collection,
  request: ReorderReposRequest
): void {
  if (!request.repos || !Array.isArray(request.repos)) {
    throw new CollectionError(
      'Repos array is required',
      400,
      ErrorCodes.INVALID_REORDER_REQUEST
    );
  }

  // Check length matches
  if (request.repos.length !== collection.repos.length) {
    throw new CollectionError(
      'Must include all repositories in the collection',
      400,
      ErrorCodes.INVALID_REORDER_REQUEST
    );
  }

  // Build a map of existing repos for O(1) lookup
  const repoMap = new Map<string, boolean>();
  collection.repos.forEach((r) => {
    const key = `${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`;
    repoMap.set(key, true);
  });

  // Check all repos exist and no duplicates
  const seenKeys = new Set<string>();

  for (const { owner, repo } of request.repos) {
    validateGitHubRepo(owner, repo);

    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;

    // Check for duplicates in request
    if (seenKeys.has(key)) {
      throw new CollectionError(
        `Duplicate repository in reorder request: ${owner}/${repo}`,
        400,
        ErrorCodes.INVALID_REORDER_REQUEST
      );
    }
    seenKeys.add(key);

    // Check repo exists in collection
    if (!repoMap.has(key)) {
      throw new CollectionError(
        `Repository not found in collection: ${owner}/${repo}`,
        400,
        ErrorCodes.INVALID_REORDER_REQUEST
      );
    }
  }
}

/**
 * Validates reorder users request
 * Ensures all users match exactly (no additions, no removals, no duplicates)
 * @throws {CollectionError} if request is invalid
 */
export function validateReorderUsersRequest(
  collection: Collection,
  request: ReorderUsersRequest
): void {
  if (!request.users || !Array.isArray(request.users)) {
    throw new CollectionError(
      'Users array is required',
      400,
      ErrorCodes.INVALID_REORDER_REQUEST
    );
  }

  // Check length matches
  if (request.users.length !== collection.users.length) {
    throw new CollectionError(
      'Must include all users in the collection',
      400,
      ErrorCodes.INVALID_REORDER_REQUEST
    );
  }

  // Build a map of existing users for O(1) lookup
  const userMap = new Map<string, boolean>();
  collection.users.forEach((u) => {
    const key = u.login.toLowerCase();
    userMap.set(key, true);
  });

  // Check all users exist and no duplicates
  const seenKeys = new Set<string>();

  for (const { login } of request.users) {
    validateGitHubLogin(login);

    const key = login.toLowerCase();

    // Check for duplicates in request
    if (seenKeys.has(key)) {
      throw new CollectionError(
        `Duplicate user in reorder request: ${login}`,
        400,
        ErrorCodes.INVALID_REORDER_REQUEST
      );
    }
    seenKeys.add(key);

    // Check user exists in collection
    if (!userMap.has(key)) {
      throw new CollectionError(
        `User not found in collection: ${login}`,
        400,
        ErrorCodes.INVALID_REORDER_REQUEST
      );
    }
  }
}

/**
 * Validates reorder collections request
 * Ensures all collection IDs match exactly (no additions, no removals, no duplicates)
 * @throws {CollectionError} if request is invalid
 */
export function validateReorderCollectionsRequest(
  data: CollectionsData,
  request: ReorderCollectionsRequest
): void {
  if (!request.collectionIds || !Array.isArray(request.collectionIds)) {
    throw new CollectionError(
      'Collection IDs array is required',
      400,
      ErrorCodes.INVALID_REORDER_REQUEST
    );
  }

  // Check length matches
  if (request.collectionIds.length !== data.collections.length) {
    throw new CollectionError(
      'Must include all collection IDs',
      400,
      ErrorCodes.INVALID_REORDER_REQUEST
    );
  }

  // Build a map of existing collection IDs
  const idMap = new Map<string, boolean>();
  data.collections.forEach((c) => {
    idMap.set(c.id, true);
  });

  // Check all IDs exist and no duplicates
  const seenIds = new Set<string>();

  for (const id of request.collectionIds) {
    // Check for duplicates in request
    if (seenIds.has(id)) {
      throw new CollectionError(
        `Duplicate collection ID in reorder request: ${id}`,
        400,
        ErrorCodes.INVALID_REORDER_REQUEST
      );
    }
    seenIds.add(id);

    // Check ID exists
    if (!idMap.has(id)) {
      throw new CollectionError(
        `Collection not found: ${id}`,
        400,
        ErrorCodes.INVALID_REORDER_REQUEST
      );
    }
  }
}
