/**
 * S3 Storage for Feed Collections
 *
 * Handles storing and retrieving feed collections and user profiles in S3.
 * Follows patterns from src/lib/version-registry/s3-storage.ts
 *
 * S3 Structure:
 *   collections/{collection-id}.json  - Collection definitions
 *   users/{github-user-id}.json       - User profiles with subscriptions
 *
 * @otel canvas: .principal-views/feed-collections/feed-collections.otel.canvas
 */

import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { FeedCollection, UserFeedProfile, CommitFeedState } from './types';

// Initialize S3 client with IAM role credentials
const s3Client = new S3Client({
  region: process.env.FEED_COLLECTIONS_AWS_REGION || 'us-east-1',
  // Credentials auto-detected from Amplify IAM role - no keys needed
});

const BUCKET_NAME =
  process.env.FEED_COLLECTIONS_S3_BUCKET || 'feed-collections';

// ============================================================================
// S3 Key Builders
// ============================================================================

/**
 * Builds S3 key for a collection
 * Pattern: collections/{collection-id}.json
 */
export function buildCollectionS3Key(collectionId: string): string {
  return `collections/${collectionId}.json`;
}

/**
 * Builds S3 key for a user profile
 * Pattern: users/{github-user-id}.json
 */
export function buildUserProfileS3Key(githubId: string): string {
  return `users/${githubId}.json`;
}

// ============================================================================
// Collection Operations
// ============================================================================

/**
 * Checks if a collection exists in S3
 */
export async function checkCollectionExists(
  collectionId: string
): Promise<boolean> {
  try {
    const s3Key = buildCollectionS3Key(collectionId);
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves a collection from S3
 *
 * @param collectionId - Collection UUID
 * @returns Collection data or null if not found
 */
export async function getCollection(
  collectionId: string
): Promise<FeedCollection | null> {
  try {
    const s3Key = buildCollectionS3Key(collectionId);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const data = await response.Body?.transformToString();
    if (!data) {
      return null;
    }

    const collection = JSON.parse(data) as FeedCollection;

    console.log('[Feed Collections] Retrieved collection:', {
      s3Key,
      collectionId,
      name: collection.name,
      repoCount: collection.repos.length,
    });

    return collection;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      console.log('[Feed Collections] Collection not found:', { collectionId });
      return null;
    }

    console.error('[Feed Collections] Get collection failed:', {
      collectionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Stores a collection to S3
 *
 * @param collection - Collection data
 * @returns S3 key where collection was stored
 */
export async function storeCollection(
  collection: FeedCollection
): Promise<string> {
  try {
    const s3Key = buildCollectionS3Key(collection.id);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(collection, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=60', // Short cache - collections are mutable
        Metadata: {
          'collection-id': collection.id,
          'owner-github-id': collection.ownerGithubId,
          visibility: collection.visibility,
          'updated-at': collection.updatedAt,
        },
      })
    );

    console.log('[Feed Collections] Stored collection:', {
      s3Key,
      collectionId: collection.id,
      name: collection.name,
      visibility: collection.visibility,
      repoCount: collection.repos.length,
    });

    return s3Key;
  } catch (error) {
    console.error('[Feed Collections] Store collection failed:', {
      collectionId: collection.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Deletes a collection from S3
 *
 * @param collectionId - Collection UUID
 * @returns true if deleted, false if not found
 */
export async function deleteCollection(collectionId: string): Promise<boolean> {
  try {
    const s3Key = buildCollectionS3Key(collectionId);

    const exists = await checkCollectionExists(collectionId);
    if (!exists) {
      console.log('[Feed Collections] Collection not found for deletion:', {
        collectionId,
      });
      return false;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    console.log('[Feed Collections] Deleted collection:', { collectionId });
    return true;
  } catch (error) {
    console.error('[Feed Collections] Delete collection failed:', {
      collectionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Lists all collections owned by a user
 *
 * Note: This fetches all collections and filters by owner.
 * For better performance with many collections, consider adding
 * an index file or using a different key structure.
 *
 * @param ownerGithubId - Owner's GitHub ID
 * @returns Array of collections owned by the user
 */
export async function listUserCollections(
  ownerGithubId: string
): Promise<FeedCollection[]> {
  try {
    const prefix = 'collections/';
    const collections: FeedCollection[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          if (!object.Key || !object.Key.endsWith('.json')) {
            continue;
          }

          try {
            const getCommand = new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: object.Key,
            });

            const getResponse = await s3Client.send(getCommand);
            const data = await getResponse.Body?.transformToString();

            if (data) {
              const collection = JSON.parse(data) as FeedCollection;
              if (collection.ownerGithubId === ownerGithubId) {
                collections.push(collection);
              }
            }
          } catch (error) {
            console.error('[Feed Collections] Failed to fetch collection:', {
              key: object.Key,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log('[Feed Collections] Listed user collections:', {
      ownerGithubId,
      count: collections.length,
    });

    return collections;
  } catch (error) {
    console.error('[Feed Collections] List collections failed:', {
      ownerGithubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

// ============================================================================
// User Profile Operations
// ============================================================================

/**
 * Retrieves a user's feed profile from S3
 *
 * @param githubId - User's GitHub ID
 * @returns User profile or null if not found
 */
export async function getUserFeedProfile(
  githubId: string
): Promise<UserFeedProfile | null> {
  try {
    const s3Key = buildUserProfileS3Key(githubId);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const data = await response.Body?.transformToString();
    if (!data) {
      return null;
    }

    const profile = JSON.parse(data) as UserFeedProfile;

    console.log('[Feed Collections] Retrieved user profile:', {
      githubId,
      subscriptionCount: profile.subscribedCollections.length,
    });

    return profile;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      console.log('[Feed Collections] User profile not found:', { githubId });
      return null;
    }

    console.error('[Feed Collections] Get user profile failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Stores a user's feed profile to S3
 *
 * @param profile - User profile data
 * @returns S3 key where profile was stored
 */
export async function storeUserFeedProfile(
  profile: UserFeedProfile
): Promise<string> {
  try {
    const s3Key = buildUserProfileS3Key(profile.githubId);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(profile, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=60', // Short cache - profiles are mutable
        Metadata: {
          'github-id': profile.githubId,
          'github-login': profile.githubLogin,
          'subscription-count': String(profile.subscribedCollections.length),
          'updated-at': profile.updatedAt,
        },
      })
    );

    console.log('[Feed Collections] Stored user profile:', {
      githubId: profile.githubId,
      subscriptionCount: profile.subscribedCollections.length,
    });

    return s3Key;
  } catch (error) {
    console.error('[Feed Collections] Store user profile failed:', {
      githubId: profile.githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Fetches multiple collections by ID
 *
 * @param collectionIds - Array of collection IDs
 * @returns Array of found collections (missing collections are omitted)
 */
export async function getCollections(
  collectionIds: string[]
): Promise<FeedCollection[]> {
  const collections: FeedCollection[] = [];

  // Fetch collections in parallel with a limit
  const BATCH_SIZE = 10;
  for (let i = 0; i < collectionIds.length; i += BATCH_SIZE) {
    const batch = collectionIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((id) => getCollection(id).catch(() => null))
    );
    collections.push(
      ...results.filter((c): c is FeedCollection => c !== null)
    );
  }

  return collections;
}

// ============================================================================
// Commit Feed State Operations
// ============================================================================

/**
 * Builds S3 key for a user's commit feed state
 * Pattern: commit-feed/{github-user-id}.json
 */
export function buildCommitFeedStateS3Key(githubId: string): string {
  return `commit-feed/${githubId}.json`;
}

/**
 * Retrieves a user's commit feed state from S3
 *
 * @param githubId - User's GitHub ID
 * @returns Commit feed state or null if not found
 */
export async function getCommitFeedState(
  githubId: string
): Promise<CommitFeedState | null> {
  try {
    const s3Key = buildCommitFeedStateS3Key(githubId);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const data = await response.Body?.transformToString();
    if (!data) {
      return null;
    }

    const state = JSON.parse(data) as CommitFeedState;

    console.log('[Commit Feed] Retrieved feed state:', {
      githubId,
      passedCommitCount: Object.keys(state.passedCommits || {}).length,
      savedCount: state.savedCards.length,
    });

    return state;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      console.log('[Commit Feed] Feed state not found:', { githubId });
      return null;
    }

    console.error('[Commit Feed] Get feed state failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Stores a user's commit feed state to S3
 *
 * @param state - Commit feed state data
 * @returns S3 key where state was stored
 */
export async function storeCommitFeedState(
  state: CommitFeedState
): Promise<string> {
  try {
    const s3Key = buildCommitFeedStateS3Key(state.githubId);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(state, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=60',
        Metadata: {
          'github-id': state.githubId,
          'passed-commit-count': String(Object.keys(state.passedCommits).length),
          'saved-count': String(state.savedCards.length),
          'updated-at': state.updatedAt,
        },
      })
    );

    console.log('[Commit Feed] Stored feed state:', {
      githubId: state.githubId,
      passedCommitCount: Object.keys(state.passedCommits).length,
      savedCount: state.savedCards.length,
    });

    return s3Key;
  } catch (error) {
    console.error('[Commit Feed] Store feed state failed:', {
      githubId: state.githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Gets or creates a commit feed state for a user
 *
 * @param githubId - User's GitHub ID
 * @returns Existing or new commit feed state
 */
export async function getOrCreateCommitFeedState(
  githubId: string
): Promise<CommitFeedState> {
  const existing = await getCommitFeedState(githubId);
  if (existing) {
    // Migrate old format if needed (passed: string[] -> passedCommits: Record<string, string[]>)
    if (!existing.passedCommits) {
      existing.passedCommits = {};
      // Old passed itemIds can't be migrated to SHAs, just clear them
      delete (existing as unknown as Record<string, unknown>).passed;
    }
    return existing;
  }

  const newState: CommitFeedState = {
    githubId,
    passedCommits: {},
    savedCards: [],
    updatedAt: new Date().toISOString(),
  };

  return newState;
}
