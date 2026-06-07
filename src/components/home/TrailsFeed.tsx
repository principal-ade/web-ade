'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { TrailCard } from '@/components/trail/TrailCard';
import type {
  ListPublicTrailsResponse,
  PublicTrailEntry,
} from '@/lib/trails/types';

/**
 * The scrollable body of the "View Trails" surface: a flat, newest-first feed
 * of individual public trails, each rendered as an OG-style `TrailCard`.
 * Content only (no header/backdrop/chrome) so it mounts both on the standalone
 * `/explore` route and inline in the home page's body. Replaces the prior
 * repo-grouped `TrailsExplorer`.
 */
export function TrailsFeed() {
  const { theme } = useTheme();
  const [entries, setEntries] = useState<PublicTrailEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  // Guards against a stale "load more" from a prior render writing late.
  const reqRef = useRef(0);

  const load = useCallback(async (afterCursor?: string) => {
    const reqId = ++reqRef.current;
    try {
      const url = new URL('/api/trails/feed', window.location.origin);
      url.searchParams.set('limit', '30');
      if (afterCursor) url.searchParams.set('cursor', afterCursor);
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as ListPublicTrailsResponse;
      if (reqId !== reqRef.current) return; // superseded
      setEntries((prev) => (afterCursor ? [...prev, ...data.entries] : data.entries));
      setCursor(data.nextCursor);
      setStatus('ready');
    } catch (error) {
      if (reqId !== reqRef.current) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (reqId === reqRef.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void load(cursor);
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
      {status === 'loading' && <FeedSkeleton />}

      {status === 'error' && (
        <div
          style={{
            padding: 16,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 8,
            background: theme.colors.surface,
            color: theme.colors.textMuted,
            fontSize: 14,
          }}
        >
          Failed to load: {message}
        </div>
      )}

      {status === 'ready' && entries.length === 0 && (
        <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          No public trails yet.
        </div>
      )}

      {status === 'ready' && entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {entries.map((e) => (
            <TrailCard
              key={e.id}
              id={e.id}
              heading={e.title}
              owner={e.owner}
              repo={e.repo}
              authorLogin={e.createdBy?.githubLogin}
              updatedAt={e.updatedAt}
            />
          ))}

          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto mt-2 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
              style={{
                background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                color: theme.colors.primary,
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FeedSkeleton() {
  const { theme } = useTheme();
  const surface = `color-mix(in srgb, ${theme.colors.textMuted} 14%, transparent)`;
  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col-reverse sm:flex-row overflow-hidden rounded-2xl"
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div className="flex flex-1 flex-col gap-3 p-6">
            <div
              className="animate-pulse"
              style={{ width: 32, height: 32, borderRadius: 8, background: surface }}
            />
            <div
              className="animate-pulse"
              style={{ width: 100, height: 12, borderRadius: 4, background: surface }}
            />
            <div
              className="animate-pulse"
              style={{ width: '80%', height: 24, borderRadius: 6, background: surface }}
            />
            <div
              className="animate-pulse mt-auto"
              style={{ width: 160, height: 44, borderRadius: 8, background: surface }}
            />
          </div>
          <div
            className="w-full sm:w-[300px] aspect-square flex-shrink-0 animate-pulse"
            style={{ background: surface }}
          />
        </div>
      ))}
    </div>
  );
}
