'use client';

/**
 * RepoActivityPane
 *
 * Left-rail view that replaces the tours/trails list with a newest-first list of
 * commits on the repo's default branch. Hovering a row highlights that commit's
 * files on the city; selecting a commit opens it as a synthesized changelog
 * trail in the right pane. Loaded a page at a time via `useRepoCommits`.
 */

import React, { useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { GitCommitHorizontal, RefreshCw } from 'lucide-react';
import type { GitHubCommit } from '@/types/api';
import { useRepoCommits } from '@/hooks/useRepoCommits';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  const DAY = 86400;
  if (secs < DAY) return 'today';
  const days = Math.floor(secs / DAY);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const CommitRow: React.FC<{
  commit: GitHubCommit;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}> = ({ commit, selected, onSelect, onHover, onHoverEnd }) => {
  const { theme } = useTheme();
  const title = commit.commit.message.split('\n')[0] ?? '';
  const login = commit.author?.login;
  const authorName = login ?? commit.commit.author.name;
  const avatar = commit.author?.avatar_url;
  const shortSha = commit.sha.slice(0, 7);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left px-4 py-3 border-b transition-colors"
      style={{
        borderColor: theme.colors.border,
        background: selected ? theme.colors.backgroundSecondary : 'transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!selected)
          e.currentTarget.style.background = theme.colors.backgroundSecondary;
        onHover();
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
        onHoverEnd();
      }}
    >
      <div
        className="line-clamp-2"
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
          fontSize: theme.fontSizes[1],
          fontWeight: theme.fontWeights.medium,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={authorName}
            width={16}
            height={16}
            style={{ borderRadius: '50%', flexShrink: 0 }}
          />
        )}
        <span
          className="truncate"
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSizes[0],
            minWidth: 0,
          }}
        >
          {authorName}
        </span>
        <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
          ·
        </span>
        <span
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[0],
            flexShrink: 0,
          }}
        >
          {relativeTime(commit.commit.author.date)}
        </span>
        <span
          className="ml-auto"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[0],
            fontFamily: theme.fonts.monospace ?? 'monospace',
            flexShrink: 0,
          }}
        >
          {shortSha}
        </span>
      </div>
    </button>
  );
};

export const RepoActivityPane: React.FC<{
  owner: string;
  repo: string;
  selectedCommitSha: string | null;
  onSelectCommit: (sha: string | null) => void;
  /** Reports the loaded commit SHAs so the parent can paint the city heatmap. */
  onCommitShasChange?: (shas: string[]) => void;
  /** Row hover → highlight that commit's files on the city (null clears). */
  onHoverCommit?: (sha: string | null) => void;
}> = ({
  owner,
  repo,
  selectedCommitSha,
  onSelectCommit,
  onCommitShasChange,
  onHoverCommit,
}) => {
  const { theme } = useTheme();
  const { commits, loading, loadingMore, error, hasMore, loadMore, refresh } =
    useRepoCommits(owner, repo);

  // Report loaded SHAs upward (keyed on the join so it only fires on change).
  const shasKey = commits.map((c) => c.sha).join(',');
  useEffect(() => {
    onCommitShasChange?.(shasKey ? shasKey.split(',') : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shasKey]);

  // Clear any city hover highlight when the pane unmounts.
  useEffect(() => {
    return () => onHoverCommit?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sticky header */}
      <div
        className="px-4 py-2 border-b sticky top-0 z-10 shrink-0 flex items-center gap-2"
        style={{ borderColor: theme.colors.border, background: theme.colors.background }}
      >
        <GitCommitHorizontal size={14} style={{ color: theme.colors.textSecondary }} />
        <span
          style={{
            fontSize: theme.fontSizes[0],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Activity
        </span>
        <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>
          main
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="ml-auto flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-70"
          style={{ color: theme.colors.textMuted, cursor: loading ? 'default' : 'pointer' }}
          title="Refresh commits"
          aria-label="Refresh commits"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <InlineTrailLoader size={40} />
            <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
              Loading commits…
            </span>
          </div>
        ) : error && commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
            <span style={{ color: theme.colors.error, fontSize: theme.fontSizes[1] }}>
              Failed to load commits
            </span>
            <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
              {error}
            </span>
            <button
              type="button"
              onClick={refresh}
              className="px-3 py-1.5 rounded transition-opacity hover:opacity-80"
              style={{
                background: theme.colors.backgroundSecondary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                fontSize: theme.fontSizes[1],
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
              No commits found
            </span>
          </div>
        ) : (
          <>
            {commits.map((commit) => (
              <CommitRow
                key={commit.sha}
                commit={commit}
                selected={commit.sha === selectedCommitSha}
                onSelect={() =>
                  onSelectCommit(commit.sha === selectedCommitSha ? null : commit.sha)
                }
                onHover={() => onHoverCommit?.(commit.sha)}
                onHoverEnd={() => onHoverCommit?.(null)}
              />
            ))}
            {hasMore && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2 rounded flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
                  style={{
                    background: theme.colors.backgroundSecondary,
                    color: theme.colors.text,
                    border: `1px solid ${theme.colors.border}`,
                    fontSize: theme.fontSizes[1],
                    cursor: loadingMore ? 'default' : 'pointer',
                  }}
                >
                  {loadingMore ? (
                    <>
                      <InlineTrailLoader size={14} />
                      Loading…
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
