/**
 * Email → GitHub-account identity cache (account-global).
 *
 * A commit email's link to a GitHub account is a property of the account, not of
 * any one repo — so we cache it under a repo-INDEPENDENT Redis key and reuse it
 * across every repo that sees the same email (and across reloads). Resolution
 * reads GitHub's own email↔account link: `GET /commits?author={email}` returns
 * commits by that email, each carrying the linked `author` (or null when GitHub
 * can't attribute it). That's why the caller must pass a repo the email actually
 * has commits in — otherwise the query is empty and the link can't be read.
 *
 * Two tiers feed the contributor list:
 *  - this hot per-email Redis cache (here), shared across repos and reloads;
 *  - a per-repo S3 map blob (s3-cache.ts) the GET route embeds in its payload, so
 *    the page resolves identities with zero client round-trips on first paint.
 */
import { getCached, setCachedAsync } from '@/lib/redis-cache';

const GITHUB_API_BASE = 'https://api.github.com';

/** A blame email resolved to its GitHub account. */
export interface ResolvedIdentity {
  login: string;
  id: number;
  avatarUrl: string;
  htmlUrl: string;
}

/** Lowercased-email → resolved account (or null when GitHub can't attribute it).
 *  An email absent from the map was never resolved (a transient miss), which is
 *  distinct from a present `null` (a confident "no account"). */
export type IdentityByEmail = Record<string, ResolvedIdentity | null>;

/** Positive links change on the order of months — cache them long. */
const POSITIVE_TTL_SECONDS = 30 * 24 * 3600; // 30d
/** A no-match can become a match (account created / email verified later), so
 *  expire negatives far sooner than positives. */
const NEGATIVE_TTL_SECONDS = 24 * 3600; // 24h
/** A wide fan-out trips GitHub's secondary rate limit. */
const CONCURRENCY = 6;

/** Account-global cache key — deliberately repo-independent so a resolution done
 *  for one repo serves every other. */
function identityByEmailCacheKey(email: string): string {
  return `gh:identity-by-email:v1:${email.toLowerCase()}`;
}

interface CommitAuthorRow {
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  } | null;
}

async function githubGet<T>(endpoint: string, token: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CodeCity-App/1.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Resolve emails to GitHub accounts — Redis-first, then GitHub for misses — and
 * write every confident result (negatives included) back to the global cache.
 * `owner/repo` must be a repo the emails have commits in. Returns a lowercased-
 * email → identity|null map. Emails that hit a transient error (rate limit /
 * private) are OMITTED rather than recorded as null, so a blip never persists as
 * a false "no account" — they're simply retried on the next visit.
 */
export async function resolveIdentitiesByEmail(
  owner: string,
  repo: string,
  emails: string[],
  token: string | null,
): Promise<IdentityByEmail> {
  const uniq = Array.from(new Set(emails.map((e) => e.toLowerCase())));

  // null = confident "no account"; undefined = transient error (don't record).
  const lookup = async (
    email: string,
  ): Promise<ResolvedIdentity | null | undefined> => {
    const key = identityByEmailCacheKey(email);
    const cached = await getCached<ResolvedIdentity | { none: true }>(key);
    if (cached) return 'none' in cached ? null : cached;
    try {
      const rows = await githubGet<CommitAuthorRow[]>(
        `/repos/${owner}/${repo}/commits?author=${encodeURIComponent(email)}&per_page=1`,
        token,
      );
      const a = rows[0]?.author ?? null;
      const identity: ResolvedIdentity | null = a
        ? { login: a.login, id: a.id, avatarUrl: a.avatar_url, htmlUrl: a.html_url }
        : null;
      setCachedAsync(
        key,
        identity ?? { none: true },
        identity ? POSITIVE_TTL_SECONDS : NEGATIVE_TTL_SECONDS,
      );
      return identity;
    } catch {
      return undefined;
    }
  };

  const out: IdentityByEmail = {};
  for (let i = 0; i < uniq.length; i += CONCURRENCY) {
    const chunk = uniq.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(lookup));
    chunk.forEach((email, j) => {
      const r = results[j];
      if (r !== undefined) out[email] = r;
    });
  }
  return out;
}
