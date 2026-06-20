/**
 * Tours storage constants.
 *
 * Tours are moving off git (the `*.tour.json` tree walk + `TOUR_ORGS` fork
 * fallback) and onto an S3 store that mirrors the trails store. These
 * constants intentionally parallel `../trails/constants.ts` rather than
 * aliasing it, so the tour storage surface, env knobs, and limits can drift
 * independently of trails as the medium matures. The bucket falls back to the
 * trails bucket by default so both media share infra unless explicitly split.
 */

export const BUCKET_NAME =
  process.env.TOURS_S3_BUCKET ||
  process.env.TRAILS_S3_BUCKET ||
  process.env.FEED_COLLECTIONS_S3_BUCKET ||
  'feed-collections';

export const BUCKET_REGION =
  process.env.TOURS_AWS_REGION ||
  process.env.TRAILS_AWS_REGION ||
  process.env.FEED_COLLECTIONS_AWS_REGION ||
  'us-east-1';

export const S3_PREFIX = 'tours';

export const INDEX_FILE = 'index.json';

/** Maximum tour payload object size (bytes). Mirrors the trails cap. */
export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Soft cap on stored tours per repo. Excess oldest entries are pruned. */
export const MAX_TOURS_PER_REPO = 200;

export const MAX_ETAG_RETRIES = 3;

export const INDEX_CACHE_CONTROL = 'max-age=60';
export const PAYLOAD_CACHE_CONTROL = 'max-age=60';
