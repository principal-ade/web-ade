/**
 * Trails Sharing Constants
 *
 * Trails ship parallel to sequence diagrams (see
 * `industry-themed-file-city-panels/docs/TRAIL_DESIGN.md`). These constants
 * deliberately do NOT alias the sequence-diagram constants so the storage
 * surface, env-var knobs, and limits can drift independently as the medium
 * matures.
 */

export const BUCKET_NAME =
  process.env.TRAILS_S3_BUCKET ||
  process.env.SEQUENCE_DIAGRAMS_S3_BUCKET ||
  process.env.FEED_COLLECTIONS_S3_BUCKET ||
  'feed-collections';

export const BUCKET_REGION =
  process.env.TRAILS_AWS_REGION ||
  process.env.SEQUENCE_DIAGRAMS_AWS_REGION ||
  process.env.FEED_COLLECTIONS_AWS_REGION ||
  'us-east-1';

export const S3_PREFIX = 'trails';

export const INDEX_FILE = 'index.json';

/** Maximum payload object size (bytes). Mirrors the desktop-app cap. */
export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Soft cap on shared trails per repo. Excess oldest entries are pruned. */
export const MAX_TRAILS_PER_REPO = 200;

/** Soft cap on inbox entries per recipient. Excess oldest are pruned. */
export const MAX_INBOX_ENTRIES = 500;

/** Inbox sender comment ("why I'm sharing this") max length in chars. */
export const MAX_INBOX_COMMENT_CHARS = 500;

/** Max recipients per send call. */
export const MAX_INBOX_RECIPIENTS = 50;

/** Inbox S3 sub-prefix (relative to `trails/`). */
export const INBOX_PREFIX = '_inbox';

/** Soft cap on outbox entries per sender. Excess oldest are pruned. */
export const MAX_OUTBOX_ENTRIES = 500;

/** Outbox (sent-items) S3 sub-prefix (relative to `trails/`). */
export const OUTBOX_PREFIX = '_outbox';

export const MAX_ETAG_RETRIES = 3;

export const INDEX_CACHE_CONTROL = 'max-age=60';
export const PAYLOAD_CACHE_CONTROL = 'max-age=60';

/** Repo access check (GET /repos/{owner}/{repo}) cache TTL in seconds. */
export const REPO_ACCESS_CACHE_TTL = 60;
