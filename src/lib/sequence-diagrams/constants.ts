/**
 * Sequence Diagrams Sharing Constants
 */

export const BUCKET_NAME =
  process.env.SEQUENCE_DIAGRAMS_S3_BUCKET ||
  process.env.FEED_COLLECTIONS_S3_BUCKET ||
  'feed-collections';

export const BUCKET_REGION =
  process.env.SEQUENCE_DIAGRAMS_AWS_REGION ||
  process.env.FEED_COLLECTIONS_AWS_REGION ||
  'us-east-1';

export const S3_PREFIX = 'sequence-diagrams';

export const INDEX_FILE = 'index.json';

/** Maximum payload object size (bytes). Mirrors the desktop-app cap. */
export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Soft cap on shared diagrams per repo. Excess oldest entries are pruned. */
export const MAX_DIAGRAMS_PER_REPO = 200;

export const MAX_ETAG_RETRIES = 3;

export const INDEX_CACHE_CONTROL = 'max-age=60';
export const PAYLOAD_CACHE_CONTROL = 'max-age=60';

/** Repo access check (GET /repos/{owner}/{repo}) cache TTL in seconds. */
export const REPO_ACCESS_CACHE_TTL = 60;
