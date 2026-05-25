/**
 * In-memory IP rate-limiter for anonymous trail-note submissions.
 *
 * CAVEAT: This is process-local. On Vercel / any multi-instance
 * deployment, a determined abuser can route around it by spreading
 * requests across cold-start instances. It still raises the effort
 * bar enough to deter casual spam; for real abuse, swap in a Redis-
 * backed limiter (Upstash etc.) keyed the same way.
 *
 * Limit: 5 submissions per IP per trail per rolling hour. Anon viewers
 * who genuinely want to leave several notes can pace themselves; this
 * just stops a script from dumping a thousand entries.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;
const MAX_TRACKED_KEYS = 10_000; // soft cap on memory footprint

interface Entry {
  /** Submission timestamps within the current window, oldest first. */
  timestamps: number[];
}

const buckets = new Map<string, Entry>();

function pruneOldest(): void {
  // Cheap LRU-ish eviction. When the map exceeds the soft cap, drop
  // the first inserted entry (Map iteration is insertion-order).
  const first = buckets.keys().next();
  if (!first.done) buckets.delete(first.value);
}

/**
 * Records an attempt and returns whether it should be allowed.
 * `false` means rate-limited; do NOT proceed with the submission.
 */
export function recordAndCheck(ip: string, trailId: string): boolean {
  const key = `${ip}:${trailId}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = buckets.get(key);
  if (entry) {
    // Re-insert at the end so the LRU eviction is more accurate.
    buckets.delete(key);
  } else {
    entry = { timestamps: [] };
  }

  // Drop timestamps outside the rolling window.
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= MAX_PER_WINDOW) {
    buckets.set(key, entry);
    return false;
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);

  if (buckets.size > MAX_TRACKED_KEYS) pruneOldest();

  return true;
}

/**
 * Extract a best-effort client IP from a Next.js request. Falls back
 * to `unknown` so rate-limit keying still works (everyone behind an
 * unknown proxy lands in the same bucket, which is conservative).
 */
export function getClientIp(request: Request): string {
  // Vercel / standard CDN headers — first hop is the client.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
