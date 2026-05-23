/**
 * Stars Constants
 *
 * Stars are a per-user indirection layer on top of the existing topics and
 * trails surfaces. Two indexes per user:
 *
 *   topics/_starred/{githubId}/index.json   ← starred topics
 *   trails/_starred/{githubId}/index.json   ← starred trails
 *
 * Storage and env-var knobs share the bucket the topics / trails surfaces
 * already use — the keys just live under the existing prefixes.
 */

export const BUCKET_NAME =
  process.env.STARS_S3_BUCKET ||
  process.env.TOPICS_S3_BUCKET ||
  process.env.TRAILS_S3_BUCKET ||
  process.env.SEQUENCE_DIAGRAMS_S3_BUCKET ||
  process.env.FEED_COLLECTIONS_S3_BUCKET ||
  'feed-collections';

export const BUCKET_REGION =
  process.env.STARS_AWS_REGION ||
  process.env.TOPICS_AWS_REGION ||
  process.env.TRAILS_AWS_REGION ||
  process.env.SEQUENCE_DIAGRAMS_AWS_REGION ||
  process.env.FEED_COLLECTIONS_AWS_REGION ||
  'us-east-1';

/** Sub-prefix (relative to the parent `topics/` or `trails/` prefix). */
export const STARRED_PREFIX = '_starred';

/**
 * Soft cap on entries per starred list. Hitting the cap prunes the oldest
 * entry on append and surfaces `STAR_LIMIT_REACHED` as a warning on the
 * 200 response — it never blocks a star.
 */
export const MAX_STARRED_ENTRIES = 500;

export const MAX_ETAG_RETRIES = 3;

export const PAYLOAD_CACHE_CONTROL = 'max-age=60';
