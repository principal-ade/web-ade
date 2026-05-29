'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { TrailBackdrop } from '@/components/home/TrailBackdrop';
import type {
  ListTopicsFeedResponse,
  TopicFeedEntry,
} from '@/lib/topics/types';

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
  | { kind: 'ready'; topics: TopicFeedEntry[] }
  | { kind: 'error'; message: string };

const VISITED_KEY = 'topics:visited';

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) ? new Set(ids.filter((v) => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export default function TopicsPage() {
  const { theme } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Populated client-side after mount to avoid an SSR/hydration mismatch.
  const [visited, setVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    setVisited(loadVisited());
  }, []);

  const markVisited = useCallback((id: string) => {
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(VISITED_KEY, JSON.stringify([...next]));
      } catch {
        // Storage unavailable (private mode / quota) — dimming just won't
        // persist across reloads; not worth surfacing.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/topics/feed')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ListTopicsFeedResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ kind: 'ready', topics: data.topics });
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
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      <TrailBackdrop theme={theme} />

      <header
        className="border-b px-4 flex items-center gap-2 flex-shrink-0 backdrop-blur-xl"
        style={{
          background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          paddingBottom: '0.5rem',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className="text-xl font-bold transition-opacity hover:opacity-80"
            style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>{' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </Link>

          <span
            className="mx-2"
            style={{ color: theme.colors.textMuted }}
            aria-hidden="true"
          >
            /
          </span>

          <span
            className="text-base font-semibold truncate"
            style={{ fontFamily: theme.fonts.body, color: theme.colors.text }}
          >
            Topics
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <UserAvatarMenu />
        </div>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '32px 24px 80px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {state.kind === 'loading' && (
            <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>
              Loading…
            </div>
          )}

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

          {state.kind === 'ready' && state.topics.length === 0 && (
            <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>
              No topics yet.
            </div>
          )}

          {state.kind === 'ready' && state.topics.length > 0 && (
            <ol
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {state.topics.map((topic, i) => (
                <TopicRow
                  key={topic.id}
                  rank={i + 1}
                  topic={topic}
                  visited={visited.has(topic.id)}
                  onVisit={() => markVisited(topic.id)}
                />
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}

function TopicRow({
  rank,
  topic,
  visited,
  onVisit,
}: {
  rank: number;
  topic: TopicFeedEntry;
  visited: boolean;
  onVisit: () => void;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [titleHover, setTitleHover] = useState(false);

  const titleColor = titleHover
    ? theme.colors.primary
    : visited
      ? theme.colors.textMuted
      : theme.colors.text;
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span
        style={{
          flexShrink: 0,
          minWidth: 28,
          textAlign: 'right',
          fontSize: 18,
          fontVariantNumeric: 'tabular-nums',
          color: theme.colors.textMuted,
        }}
      >
        {rank}.
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <Link
          href={`/topic/${topic.id}`}
          onClick={onVisit}
          onMouseEnter={() => setTitleHover(true)}
          onMouseLeave={() => setTitleHover(false)}
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: titleColor,
            textDecoration: 'none',
            lineHeight: 1.3,
            transition: 'color 0.12s ease',
          }}
        >
          {topic.title}
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            color: theme.colors.textMuted,
            marginTop: 6,
          }}
        >
          <span>
            by{' '}
            <Link
              href={`/${topic.author.githubLogin}`}
              style={{ color: theme.colors.textMuted, textDecoration: 'none' }}
              className="hover:underline"
            >
              {topic.author.displayName}
            </Link>{' '}
            · {relativeTime(topic.updatedAt)}
          </span>
          <ReposToggle
            repos={topic.repos}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />
        </div>

        {expanded && topic.repos.length > 0 && (
          <RepoList repos={topic.repos} />
        )}
      </div>
    </li>
  );
}

const MAX_AVATARS = 5;

/** Distinct owners across the repos, order preserved (repos are owner-sorted). */
function distinctOwners(repos: TopicFeedEntry['repos']): string[] {
  return [...new Set(repos.map((r) => r.owner))];
}

function ReposToggle({
  repos,
  expanded,
  onToggle,
}: {
  repos: TopicFeedEntry['repos'];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  if (repos.length === 0) return null;

  const owners = distinctOwners(repos);
  const shown = owners.slice(0, MAX_AVATARS);
  const overflow = owners.length - shown.length;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Hide' : 'Show'} the ${repos.length} project${
        repos.length === 1 ? '' : 's'
      } in this topic`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        color: theme.colors.textMuted,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {shown.map((owner, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={owner}
            src={`https://github.com/${owner}.png?size=48`}
            alt=""
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              display: 'block',
              marginLeft: i === 0 ? 0 : -6,
              zIndex: shown.length - i,
              border: `1.5px solid ${theme.colors.background}`,
              background: theme.colors.surface,
            }}
          />
        ))}
        {overflow > 0 && (
          <span style={{ marginLeft: 6, fontSize: 13 }}>+{overflow}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontSize: 11,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.12s ease',
        }}
      >
        ▸
      </span>
    </button>
  );
}

function RepoList({ repos }: { repos: TopicFeedEntry['repos'] }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '10px 0 2px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {repos.map(({ owner, repo }) => (
        <RepoRow key={`${owner}/${repo}`} owner={owner} repo={repo} />
      ))}
    </ul>
  );
}

function RepoRow({ owner, repo }: { owner: string; repo: string }) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <li>
      <Link
        href={`/${owner}/${repo}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: hover ? theme.colors.primary : theme.colors.text,
          fontSize: 14,
          transition: 'color 0.12s ease',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://github.com/${owner}.png?size=48`}
          alt=""
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            display: 'block',
            flexShrink: 0,
            background: theme.colors.surface,
          }}
        />
        <span
          style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {repo}
        </span>
      </Link>
    </li>
  );
}
