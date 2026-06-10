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

/** Caps on the free-form text fields of a topic's status. */
export const MAX_STATUS_LABEL_CHARS = 80;
export const MAX_STATUS_NOTE_CHARS = 500;
export const MAX_STATUS_REF_VALUE_CHARS = 500;
export const MAX_STATUS_REF_TITLE_CHARS = 200;

export const PAYLOAD_CACHE_CONTROL = 'max-age=60';
export const INDEX_CACHE_CONTROL = 'max-age=60';

export const MAX_ETAG_RETRIES = 3;

// ============================================================================
// Inbox / Outbox — per-user topic delivery layer. Parallels the trails store
// ([[../trails/constants.ts]]); the limits and sub-prefixes are kept separate
// from trails so the two surfaces can drift independently.
// ============================================================================

export const INDEX_FILE = 'index.json';

/** Soft cap on inbox entries per recipient. Excess oldest are pruned. */
export const MAX_INBOX_ENTRIES = 500;

/** Soft cap on outbox entries per sender. Excess oldest are pruned. */
export const MAX_OUTBOX_ENTRIES = 500;

/** Inbox sender comment ("why I'm sharing this") max length in chars. */
export const MAX_INBOX_COMMENT_CHARS = 500;

/** Max recipients per send call. */
export const MAX_INBOX_RECIPIENTS = 50;

/** Inbox S3 sub-prefix (relative to `topics/`). */
export const INBOX_PREFIX = '_inbox';

/** Outbox (sent-items) S3 sub-prefix (relative to `topics/`). */
export const OUTBOX_PREFIX = '_outbox';
