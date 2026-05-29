'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import type {
  ListPublicReposWithTrailsResponse,
  PublicRepoWithTrails,
} from '@/lib/trails/types';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))}mo ago`;
  return `${Math.floor(diffSec / (86400 * 365))}y ago`;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; repos: PublicRepoWithTrails[] }
  | { kind: 'error'; message: string };

/**
 * The scrollable body of the "View Trails" surface: every public repo with
 * trails, grouped by owner. Renders content only (no header/backdrop/outer
 * chrome) so it can mount both on the standalone `/explore` route and inline
 * in the home page's body.
 */
export function TrailsExplorer() {
  const { theme } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/trails/repos')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ListPublicReposWithTrailsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ kind: 'ready', repos: data.repos });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {state.kind === 'loading' && <TrailsSkeleton />}

      {state.kind === 'error' && (
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
          Failed to load: {state.message}
        </div>
      )}

      {state.kind === 'ready' && state.repos.length === 0 && (
        <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          No public repos with trails yet.
        </div>
      )}

      {state.kind === 'ready' && state.repos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {groupByOwner(state.repos).map(({ owner, repos }) => (
            <OwnerSection key={owner} owner={owner} repos={repos} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrailsSkeleton() {
  const { theme } = useTheme();
  const surface = `color-mix(in srgb, ${theme.colors.textMuted} 14%, transparent)`;
  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', flexDirection: 'column', gap: 40 }}
    >
      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}
          >
            <div
              className="animate-pulse"
              style={{ width: 48, height: 48, borderRadius: 10, background: surface }}
            />
            <div
              className="animate-pulse"
              style={{ width: 160, height: 22, borderRadius: 6, background: surface }}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {Array.from({ length: s === 0 ? 4 : 2 }).map((_, c) => (
              <div
                key={c}
                className="animate-pulse"
                style={{
                  height: 74,
                  borderRadius: 10,
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByOwner(
  repos: PublicRepoWithTrails[],
): Array<{ owner: string; repos: PublicRepoWithTrails[] }> {
  const groups = new Map<string, PublicRepoWithTrails[]>();
  for (const row of repos) {
    const bucket = groups.get(row.owner);
    if (bucket) bucket.push(row);
    else groups.set(row.owner, [row]);
  }
  return Array.from(groups, ([owner, rows]) => ({ owner, repos: rows }));
}

function OwnerSection({
  owner,
  repos,
}: {
  owner: string;
  repos: PublicRepoWithTrails[];
}) {
  const { theme } = useTheme();
  return (
    <section>
      <Link
        href={`/${owner}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 16,
          textDecoration: 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://github.com/${owner}.png?size=96`}
          alt=""
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: theme.colors.text,
            lineHeight: 1.2,
          }}
        >
          {owner}
        </span>
      </Link>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {repos.map((row) => (
          <li key={row.repo}>
            <RepoCard row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RepoCard({ row }: { row: PublicRepoWithTrails }) {
  const { theme } = useTheme();
  return (
    <Link
      href={`/${row.owner}/${row.repo}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 16px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 10,
        textDecoration: 'none',
        height: '100%',
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: theme.colors.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}
      >
        {row.repo}
      </div>
      <div
        style={{
          fontSize: 12,
          color: theme.colors.textMuted,
        }}
      >
        {row.trailCount} trail{row.trailCount === 1 ? '' : 's'} ·{' '}
        {relativeTime(row.lastUpdated)}
      </div>
    </Link>
  );
}
