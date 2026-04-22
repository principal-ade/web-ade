/**
 * S3 Storage for Starred Collections
 *
 * Handles storing and retrieving starred collections in S3 with ETag-based
 * optimistic locking to prevent concurrent modification conflicts.
 *
 * S3 Structure:
 *   starred-collections/{user-id}/collections.json      - Main collections file
 *   starred-collections/{user-id}/metadata-cache.json   - GitHub metadata cache
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { CollectionsData, MetadataCache } from './types';
import { CollectionError, ErrorCodes } from './types';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  S3_PREFIX,
  COLLECTIONS_FILE,
  METADATA_CACHE_FILE,
  COLLECTIONS_CACHE_CONTROL,
  METADATA_CACHE_CONTROL,
  MAX_ETAG_RETRIES,
} from './constants';

// Initialize S3 client with IAM role credentials
const s3Client = new S3Client({
  region: BUCKET_REGION,
  // Credentials auto-detected from Amplify IAM role - no keys needed
});

// ============================================================================
// S3 Key Builders
// ============================================================================

/**
 * Builds S3 key for collections file
 * Pattern: starred-collections/{user-id}/collections.json
 *      OR: starred-collections/org-{org-login}/collections.json
 */
function buildCollectionsS3Key(ownerType: 'user' | 'org', ownerId: string): string {
  const prefix = ownerType === 'org' ? `org-${ownerId}` : ownerId;
  return `${S3_PREFIX}/${prefix}/${COLLECTIONS_FILE}`;
}

/**
 * Builds S3 key for metadata cache file
 * Pattern: starred-collections/{user-id}/metadata-cache.json
 *      OR: starred-collections/org-{org-login}/metadata-cache.json
 */
function buildMetadataCacheS3Key(ownerType: 'user' | 'org', ownerId: string): string {
  const prefix = ownerType === 'org' ? `org-${ownerId}` : ownerId;
  return `${S3_PREFIX}/${prefix}/${METADATA_CACHE_FILE}`;
}

// ============================================================================
// Collections Operations
// ============================================================================

/**
 * Gets collections data with ETag for optimistic locking
 * @returns Collections data and ETag, or null if not found
 */
async function getCollectionsWithETag(
  ownerType: 'user' | 'org',
  ownerId: string
): Promise<{ data: CollectionsData; etag: string } | null> {
  try {
    const s3Key = buildCollectionsS3Key(ownerType, ownerId);

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) {
      return null;
    }

    const data = JSON.parse(body) as CollectionsData;
    const etag = response.ETag || '';

    console.log('[Starred Collections] Retrieved collections with ETag:', {
      ownerType,
      ownerId,
      version: data.version,
      collectionsCount: data.collections.length,
      etag,
    });

    return { data, etag };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      console.log('[Starred Collections] Collections not found:', { ownerType, ownerId });
      return null;
    }

    console.error('[Starred Collections] Get collections failed:', {
      ownerType,
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new CollectionError(
      'Failed to retrieve collections from storage',
      500,
      ErrorCodes.S3_ERROR
    );
  }
}

/**
 * Puts collections data with ETag check for optimistic locking
 * @throws {CollectionError} if ETag doesn't match (concurrent modification)
 */
async function putCollectionsWithETag(
  ownerType: 'user' | 'org',
  ownerId: string,
  data: CollectionsData,
  etag: string | null
): Promise<void> {
  try {
    const s3Key = buildCollectionsS3Key(ownerType, ownerId);

    const params: {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
      CacheControl: string;
      IfMatch?: string;
    } = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: COLLECTIONS_CACHE_CONTROL,
    };

    // Add ETag check if provided (skip for initial creation)
    if (etag) {
      params.IfMatch = etag;
    }

    await s3Client.send(new PutObjectCommand(params));

    console.log('[Starred Collections] Stored collections:', {
      ownerType,
      ownerId,
      version: data.version,
      collectionsCount: data.collections.length,
    });
  } catch (error: unknown) {
    // Check for precondition failed (ETag mismatch)
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error.name === 'PreconditionFailed' || error.name === '412')
    ) {
      console.log('[Starred Collections] ETag conflict detected:', { ownerType, ownerId });
      throw new CollectionError(
        'Concurrent modification detected',
        409,
        ErrorCodes.ETAG_CONFLICT
      );
    }

    console.error('[Starred Collections] Put collections failed:', {
      ownerType,
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new CollectionError(
      'Failed to save collections to storage',
      500,
      ErrorCodes.S3_ERROR
    );
  }
}

/**
 * Initializes empty collections data for a new user
 */
function initializeCollections(): CollectionsData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    collections: [],
  };
}

/**
 * Gets collections data (without ETag)
 * @returns Collections data or null if not found
 */
export async function getCollections(
  ownerType: 'user' | 'org',
  ownerId: string
): Promise<CollectionsData | null> {
  const result = await getCollectionsWithETag(ownerType, ownerId);
  return result ? result.data : null;
}

/**
 * Updates collections data with automatic retry on ETag conflicts
 * This is the primary function used by API routes for all mutations
 *
 * @param ownerType - Owner type ('user' or 'org')
 * @param ownerId - User's GitHub ID or organization login
 * @param modifier - Function that modifies the collections data
 * @returns Updated collections data
 * @throws {CollectionError} if max retries exceeded or other error
 */
export async function updateCollections(
  ownerType: 'user' | 'org',
  ownerId: string,
  modifier: (data: CollectionsData) => CollectionsData
): Promise<CollectionsData> {
  let attempts = 0;

  while (attempts < MAX_ETAG_RETRIES) {
    try {
      // Get current data with ETag
      const result = await getCollectionsWithETag(ownerType, ownerId);

      let data: CollectionsData;
      let etag: string | null;

      if (!result) {
        // Initialize new collections data for first-time user/org
        data = initializeCollections();
        etag = null;
      } else {
        data = result.data;
        etag = result.etag;
      }

      // Apply modifications
      const updated = modifier(data);

      // Increment version and update timestamp
      updated.version++;
      updated.updatedAt = new Date().toISOString();

      // Write back with ETag check
      await putCollectionsWithETag(ownerType, ownerId, updated, etag);

      return updated;
    } catch (error) {
      if (error instanceof CollectionError && error.code === ErrorCodes.ETAG_CONFLICT) {
        attempts++;

        if (attempts >= MAX_ETAG_RETRIES) {
          console.error('[Starred Collections] Max retries exceeded:', {
            ownerType,
            ownerId,
            attempts,
          });
          throw new CollectionError(
            'Concurrent modification conflict - please retry',
            409,
            ErrorCodes.MAX_RETRIES
          );
        }

        console.log('[Starred Collections] Retrying after ETag conflict:', {
          ownerType,
          ownerId,
          attempt: attempts,
        });

        // Brief delay before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
        continue;
      }

      // Re-throw other errors
      throw error;
    }
  }

  // Should never reach here, but TypeScript requires it
  throw new CollectionError(
    'Update failed after retries',
    500,
    ErrorCodes.S3_ERROR
  );
}

/**
 * Checks if collections file exists for a user or org
 */
export async function checkCollectionsExist(
  ownerType: 'user' | 'org',
  ownerId: string
): Promise<boolean> {
  try {
    const s3Key = buildCollectionsS3Key(ownerType, ownerId);

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

// ============================================================================
// Metadata Cache Operations
// ============================================================================

/**
 * Gets metadata cache
 * @returns Metadata cache or null if not found
 */
export async function getMetadataCache(
  ownerType: 'user' | 'org',
  ownerId: string
): Promise<MetadataCache | null> {
  try {
    const s3Key = buildMetadataCacheS3Key(ownerType, ownerId);

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) {
      return null;
    }

    const cache = JSON.parse(body) as MetadataCache;

    console.log('[Starred Collections] Retrieved metadata cache:', {
      ownerType,
      ownerId,
      reposCount: Object.keys(cache.repos || {}).length,
      usersCount: Object.keys(cache.users || {}).length,
    });

    return cache;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      console.log('[Starred Collections] Metadata cache not found:', { ownerType, ownerId });
      return null;
    }

    console.error('[Starred Collections] Get metadata cache failed:', {
      ownerType,
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - cache is optional
    return null;
  }
}

/**
 * Initializes empty metadata cache
 */
function initializeMetadataCache(): MetadataCache {
  return {
    repos: {},
    users: {},
  };
}

/**
 * Updates metadata cache
 * Note: This does not use ETag locking since cache is non-critical
 * and can be safely overwritten
 */
export async function updateMetadataCache(
  ownerType: 'user' | 'org',
  ownerId: string,
  modifier: (cache: MetadataCache) => MetadataCache
): Promise<void> {
  try {
    // Get current cache or initialize empty
    let cache = await getMetadataCache(ownerType, ownerId);
    if (!cache) {
      cache = initializeMetadataCache();
    }

    // Apply modifications
    const updated = modifier(cache);

    // Store updated cache
    const s3Key = buildMetadataCacheS3Key(ownerType, ownerId);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(updated, null, 2),
        ContentType: 'application/json',
        CacheControl: METADATA_CACHE_CONTROL,
      })
    );

    console.log('[Starred Collections] Updated metadata cache:', {
      ownerType,
      ownerId,
      reposCount: Object.keys(updated.repos || {}).length,
      usersCount: Object.keys(updated.users || {}).length,
    });
  } catch (error) {
    console.error('[Starred Collections] Update metadata cache failed:', {
      ownerType,
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - cache updates are non-critical
  }
}

/**
 * Deletes all data for a user or org (collections and cache)
 * Used for cleanup or testing
 */
export async function deleteUserData(
  ownerType: 'user' | 'org',
  ownerId: string
): Promise<void> {
  try {
    const collectionsKey = buildCollectionsS3Key(ownerType, ownerId);
    const cacheKey = buildMetadataCacheS3Key(ownerType, ownerId);

    // Delete both files (ignore errors if they don't exist)
    await Promise.allSettled([
      s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: collectionsKey,
        })
      ),
      s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: cacheKey,
        })
      ),
    ]);

    console.log('[Starred Collections] Deleted data:', { ownerType, ownerId });
  } catch (error) {
    console.error('[Starred Collections] Delete data failed:', {
      ownerType,
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new CollectionError(
      'Failed to delete data',
      500,
      ErrorCodes.S3_ERROR
    );
  }
}
