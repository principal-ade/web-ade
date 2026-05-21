/**
 * Topics Sharing Constants
 *
 * Topics are curated collections of trails that span repositories — a place
 * to discuss implementation approaches across the codebases the trails point
 * at. Storage parallels the trails store ([[../trails/constants.ts]]); the
 * env-var knobs are shared so a single S3 bucket can hold both surfaces.
 */

export const BUCKET_NAME =
  process.env.TOPICS_S3_BUCKET ||
  process.env.TRAILS_S3_BUCKET ||
  process.env.SEQUENCE_DIAGRAMS_S3_BUCKET ||
  process.env.FEED_COLLECTIONS_S3_BUCKET ||
  'feed-collections';

export const BUCKET_REGION =
  process.env.TOPICS_AWS_REGION ||
  process.env.TRAILS_AWS_REGION ||
  process.env.SEQUENCE_DIAGRAMS_AWS_REGION ||
  process.env.FEED_COLLECTIONS_AWS_REGION ||
  'us-east-1';

export const S3_PREFIX = 'topics';

/** Soft cap on trails attached to a single topic. */
export const MAX_TRAILS_PER_TOPIC = 50;

export const MAX_TITLE_CHARS = 200;
export const MAX_DESCRIPTION_CHARS = 8_000;

export const MAX_COMMENT_CHARS = 8_000;
export const MAX_COMMENTS_PER_TOPIC = 500;

/**
 * Soft cap on *pending* trail suggestions per topic. Resolved suggestions
 * (accepted / rejected / withdrawn) stay in the container as an audit trail
 * but don't count toward this limit — only pending ones do.
 */
export const MAX_PENDING_SUGGESTIONS_PER_TOPIC = 100;

export const MAX_REASON_CHARS = 500;

export const PAYLOAD_CACHE_CONTROL = 'max-age=60';

export const MAX_ETAG_RETRIES = 3;
