'use client';

import { useEffect, useMemo, useState } from 'react';

/** login → GitHub display name. Display-only; never an identity key. */
export type AuthorNames = Record<string, string>;

// Process-wide caches so every trail/topic surface on the page shares one
// lookup. `nameCache` holds resolved display names; `triedSet` records logins
// we've already queried (incl. ones with no name) so we don't refetch them.
// Reloads are covered by the route's `Cache-Control` (the browser serves the
// /api/github/usernames response from its HTTP cache).
const nameCache = new Map<string, string>();
const triedSet = new Set<string>();

function snapshot(logins: string[]): AuthorNames {
  const out: AuthorNames = {};
  for (const login of logins) {
    const name = nameCache.get(login);
    if (name) out[login] = name;
  }
  return out;
}

/**
 * Resolve a set of GitHub logins to their display names. Returns a
 * `{ login: name }` map containing only the logins that have a known name;
 * unresolved logins are simply absent, so callers fall back to the login.
 *
 * Pass the distinct logins a surface cares about (note authors, sign-off
 * authors, visitors, the trail author). The hook dedupes, fetches only the
 * not-yet-seen logins via `/api/github/usernames`, and re-renders when names
 * arrive.
 */
export function useAuthorNames(logins: string[]): AuthorNames {
  const distinct = useMemo(
    () => Array.from(new Set(logins.filter(Boolean))).sort(),
    [logins]
  );
  const key = distinct.join(',');

  const [names, setNames] = useState<AuthorNames>(() => snapshot(distinct));

  useEffect(() => {
    const missing = distinct.filter((login) => !triedSet.has(login));
    if (missing.length === 0) {
      setNames(snapshot(distinct));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/github/usernames?logins=${encodeURIComponent(missing.join(','))}`
        );
        if (res.ok) {
          const { names: fetched } = (await res.json()) as {
            names: AuthorNames;
          };
          for (const [login, name] of Object.entries(fetched)) {
            if (name) nameCache.set(login, name);
          }
        }
      } catch {
        // Network failure → leave names unresolved; UI falls back to logins.
      } finally {
        // Mark every requested login as tried (even unresolved ones) so we
        // don't hammer the endpoint for names that don't exist.
        for (const login of missing) triedSet.add(login);
        if (!cancelled) setNames(snapshot(distinct));
      }
    })();

    return () => {
      cancelled = true;
    };
    // `key` is the stable content digest of `distinct`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}
