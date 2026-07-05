/**
 * Starred Collections Constants
 *
 * Configuration values, limits, and constants for the starred collections feature.
 */

// ============================================================================
// S3 Configuration
// ============================================================================

/**
 * S3 bucket name for collections storage
 * Reuses existing feed-collections bucket with different prefix
 */
export const BUCKET_NAME =
  process.env.FEED_COLLECTIONS_S3_BUCKET || 'feed-collections';

/**
 * AWS region for S3 bucket
 */
export const BUCKET_REGION =
  process.env.FEED_COLLECTIONS_AWS_REGION || 'us-east-1';

/**
 * S3 key prefix for starred collections
 * Separates starred collections from feed collections
 */
export const S3_PREFIX = 'starred-collections';

// ============================================================================
// Collection Limits
// ============================================================================

/**
 * Maximum number of collections per user
 */
export const MAX_COLLECTIONS = 50;

/**
 * Maximum number of repositories per collection
 */
export const MAX_REPOS_PER_COLLECTION = 100;

/**
 * Maximum number of users per collection
 */
export const MAX_USERS_PER_COLLECTION = 100;

/**
 * Maximum length for collection name
 */
export const MAX_COLLECTION_NAME_LENGTH = 100;

/**
 * Minimum length for collection name
 */
export const MIN_COLLECTION_NAME_LENGTH = 1;

/**
 * Maximum length for collection description
 */
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 500;

// ============================================================================
// GitHub Metadata Caching
// ============================================================================

/**
 * Metadata cache TTL in seconds (1 hour)
 * Cached data older than this is considered stale
 */
export const METADATA_CACHE_TTL = 3600;

/**
 * Convert cache TTL to milliseconds for JavaScript Date comparisons
 */
export const METADATA_CACHE_TTL_MS = METADATA_CACHE_TTL * 1000;

// ============================================================================
// Concurrency Control
// ============================================================================

/**
 * Maximum number of retries for ETag conflicts
 * After this many attempts, return 409 Conflict to client
 */
export const MAX_ETAG_RETRIES = 3;

// ============================================================================
// Visibility
// ============================================================================

/**
 * Valid visibility values for collections
 */
export const VALID_VISIBILITY_VALUES = ['public', 'private'] as const;

/**
 * Default visibility for new collections
 */
export const DEFAULT_VISIBILITY = 'private';

export type Visibility = (typeof VALID_VISIBILITY_VALUES)[number];

// ============================================================================
// Valid Lucide Icons
// ============================================================================

/**
 * List of valid Lucide icon names for collections
 * Based on specification in collections-api-spec.md
 */
export const VALID_ICONS = [
  'Star',
  'BookMarked',
  'Flame',
  'Briefcase',
  'Target',
  'Rocket',
  'Lightbulb',
  'Palette',
  'Package',
  'Sparkles',
  'Heart',
  'Code',
  'Users',
  'Folder',
] as const;

/**
 * Default icon for new collections
 */
export const DEFAULT_ICON = 'Star';

/**
 * Type for valid icon names
 */
export type ValidIcon = (typeof VALID_ICONS)[number];

// ============================================================================
// S3 File Names
// ============================================================================

/**
 * Main collections file name
 */
export const COLLECTIONS_FILE = 'collections.json';

/**
 * Metadata cache file name
 */
export const METADATA_CACHE_FILE = 'metadata-cache.json';

// ============================================================================
// Cache Control Headers
// ============================================================================

/**
 * Cache control for collections file (short TTL - mutable data)
 */
export const COLLECTIONS_CACHE_CONTROL = 'max-age=60'; // 1 minute

/**
 * Cache control for metadata cache file
 */
export const METADATA_CACHE_CONTROL = 'max-age=3600'; // 1 hour
