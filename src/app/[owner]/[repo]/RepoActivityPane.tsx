'use client';

/**
 * RepoActivityPane
 *
 * Left-rail view that replaces the tours/trails list with the repo's recent
 * commit activity, contributor-first:
 *
 *  - The default view is a list of **contributor cards** — one per author across
 *    the loaded default-branch commits — showing that author's recent-commit and
 *    touched-file counts.
 *  - Selecting a card drills into that author's commits (a newest-first list).
 *    Hovering a row highlights the commit's files on the city; selecting a commit
 *    opens it as a synthesized changelog trail in the right pane.
 *
 * Commits are loaded a page at a time via `useRepoCommits`; per-commit changed
 * files come from the parent (`commitFiles`), which also paints the city.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  GitCommitHorizontal,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileDiff,
} from 'lucide-react';
import type { GitHubCommit } from '@/types/api';
import type { ChangedFile } from '@/lib/activity/commitLayers';
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

// A calendar-aware label for the activity view (contributors' last-active label
// and the commit rows): the clock time for today ("2:30 PM"), "yesterday" for
// the prior day, "Nd ago" within the week, then relativeTime for older.
function activityTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (dayDiff <= 0)
    return then.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return `${dayDiff}d ago`;
  return relativeTime(iso);
}

/**
 * Stable grouping key for a commit's author: prefer the GitHub login, falling
 * back to the commit-metadata name (prefixed so a login can never collide with
 * a name). Used both to build the contributor list and to filter it.
 */
function authorKey(commit: GitHubCommit): string {
  const login = commit.author?.login;
  return login ? `login:${login}` : `name:${commit.commit.author.name}`;
}

/** One contributor, aggregated across the loaded commits. */
interface Contributor {
  key: string;
  login: string | null;
  name: string;
  avatarUrl?: string;
  /** Newest-first SHAs by this author (in load order). */
  shas: string[];
  commitCount: number;
  /** Distinct files this author touched, across the commits we have files for. */
  fileCount: number;
  /** Most recent commit date, for the "active … ago" line. */
  lastCommitDate: string;
}

const ContributorCard: React.FC<{
  contributor: Contributor;
  onSelect: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}> = ({ contributor, onSelect, onHover, onHoverEnd }) => {
  const { theme } = useTheme();
  const { name, avatarUrl, commitCount, fileCount, lastCommitDate } =
    contributor;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left px-4 py-3 flex items-center gap-3 border-b transition-colors"
      style={{
        borderColor: theme.colors.border,
        color: theme.colors.text,
        background: 'transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.colors.backgroundSecondary;
        onHover();
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        onHoverEnd();
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}s=72`}
          alt={name}
          width={36}
          height={36}
          className="rounded-full shrink-0"
          style={{ background: theme.colors.backgroundSecondary }}
        />
      ) : (
        <div
          className="rounded-full shrink-0 flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            background: theme.colors.backgroundSecondary,
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {name}
        </div>
        <div
          className="flex items-center gap-2 mt-0.5"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          <span className="inline-flex items-center gap-1">
            <GitCommitHorizontal size={14} />
            {commitCount.toLocaleString()}
            {commitCount === 1 ? ' commit' : ' commits'}
          </span>
          {fileCount > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <FileDiff size={14} />
                {fileCount.toLocaleString()}
                {fileCount === 1 ? ' file' : ' files'}
              </span>
            </>
          )}
        </div>
      </div>
      {lastCommitDate && (
        <span
          className="shrink-0"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          {activityTime(lastCommitDate)}
        </span>
      )}
    </button>
  );
};

const CommitRow: React.FC<{
  commit: GitHubCommit;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}> = ({ commit, selected, onSelect, onHover, onHoverEnd }) => {
  const { theme } = useTheme();
  const title = commit.commit.message.split('\n')[0] ?? '';
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
          fontSize: theme.fontSizes[2],
          fontWeight: theme.fontWeights.medium,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <span
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[1],
            flexShrink: 0,
          }}
        >
          {activityTime(commit.commit.author.date)}
        </span>
        <span
          className="ml-auto"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[1],
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
  /** Changed-file lists for the loaded commits, keyed by SHA — drives the
   *  per-contributor touched-file counts (fetched + capped by the parent). */
  commitFiles: Map<string, ChangedFile[]>;
  /** Reports the loaded commit SHAs so the parent can paint the city heatmap. */
  onCommitShasChange?: (shas: string[]) => void;
  /** Reports the SHAs to focus the churn heatmap on — the selected contributor's
   *  commits, or null on the contributor list (the parent shows everyone then). */
  onFocusShasChange?: (shas: string[] | null) => void;
  /** Row hover → highlight that commit's files on the city (null clears). */
  onHoverCommit?: (sha: string | null) => void;
  /** Contributor-card hover → report that person's commit SHAs so the parent can
   *  preview their footprint on the city in a distinct color (null clears). */
  onHoverShasChange?: (shas: string[] | null) => void;
  /** Close the activity view and return to the tours / About rail. */
  onClose?: () => void;
  /** Externally-requested contributor (e.g. clicked from the About card) to open
   *  straight into their commit drill-down. The `token` bumps on each request so
   *  re-selecting the same person re-triggers the drill-in. */
  focusContributor?: {
    token: number;
    login: string;
    name: string;
    avatarUrl?: string;
  } | null;
}> = ({
  owner,
  repo,
  selectedCommitSha,
  onSelectCommit,
  commitFiles,
  onCommitShasChange,
  onFocusShasChange,
  onHoverCommit,
  onHoverShasChange,
  onClose,
  focusContributor,
}) => {
  const { theme } = useTheme();
  const { commits, loading, loadingMore, error, hasMore, loadMore, refresh } =
    useRepoCommits(owner, repo);

  // The contributor whose commits are showing (their `key`), or null for the
  // contributor card list.
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);

  // Aggregate the loaded commits into contributors, newest-active first.
  const contributors = useMemo<Contributor[]>(() => {
    const map = new Map<
      string,
      {
        key: string;
        login: string | null;
        name: string;
        avatarUrl?: string;
        shas: string[];
        files: Set<string>;
        lastCommitDate: string;
      }
    >();
    for (const c of commits) {
      const key = authorKey(c);
      let agg = map.get(key);
      if (!agg) {
        agg = {
          key,
          login: c.author?.login ?? null,
          name: c.commit.author.name || c.author?.login || 'Unknown',
          avatarUrl: c.author?.avatar_url,
          shas: [],
          files: new Set<string>(),
          lastCommitDate: c.commit.author.date,
        };
        map.set(key, agg);
      }
      agg.shas.push(c.sha);
      if (!agg.avatarUrl && c.author?.avatar_url) agg.avatarUrl = c.author.avatar_url;
      const files = commitFiles.get(c.sha);
      if (files) for (const f of files) agg.files.add(f.filename);
    }
    return Array.from(map.values())
      .map((a) => ({
        key: a.key,
        login: a.login,
        name: a.name,
        avatarUrl: a.avatarUrl,
        shas: a.shas,
        commitCount: a.shas.length,
        fileCount: a.files.size,
        lastCommitDate: a.lastCommitDate,
      }))
      .sort(
        (x, y) =>
          new Date(y.lastCommitDate).getTime() -
          new Date(x.lastCommitDate).getTime(),
      );
  }, [commits, commitFiles]);

  // Open the requested contributor's drill-down when asked from outside (the
  // About card). Keyed on the token so re-clicking the same person re-opens it.
  const focusToken = focusContributor?.token;
  useEffect(() => {
    if (focusContributor) setSelectedAuthor(`login:${focusContributor.login}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  const activeContributor = useMemo(
    () => contributors.find((c) => c.key === selectedAuthor) ?? null,
    [contributors, selectedAuthor],
  );

  // The drill-down is "open" whenever a contributor is selected; the body slides
  // the commit layer in over the contributor cards.
  const isOpen = selectedAuthor !== null;

  // Fallback identity for a contributor opened from the About card who hasn't
  // appeared in the loaded commits yet — so the header still shows their face
  // and name (and an empty state) rather than nothing.
  const externalContributor = useMemo<Contributor | null>(() => {
    if (!focusContributor) return null;
    return {
      key: `login:${focusContributor.login}`,
      login: focusContributor.login,
      name: focusContributor.name,
      avatarUrl: focusContributor.avatarUrl,
      shas: [],
      commitCount: 0,
      fileCount: 0,
      lastCommitDate: '',
    };
  }, [focusContributor]);

  // Retain the last-opened contributor so the commit layer keeps its content
  // while it slides back out (otherwise it'd blank the instant we deselect).
  const [panelContributor, setPanelContributor] = useState<Contributor | null>(
    null,
  );
  useEffect(() => {
    if (activeContributor) setPanelContributor(activeContributor);
  }, [activeContributor]);
  const shownContributor =
    activeContributor ??
    (externalContributor && externalContributor.key === selectedAuthor
      ? externalContributor
      : null) ??
    panelContributor;

  // The shown contributor's commits, newest-first (load order).
  const shownKey = shownContributor?.key ?? null;
  const authorCommits = useMemo<GitHubCommit[]>(() => {
    if (!shownKey) return [];
    return commits.filter((c) => authorKey(c) === shownKey);
  }, [commits, shownKey]);

  // Report loaded SHAs upward (keyed on the join so it only fires on change).
  // Always the full set, so the parent has changed-files for every contributor.
  const shasKey = commits.map((c) => c.sha).join(',');
  useEffect(() => {
    onCommitShasChange?.(shasKey ? shasKey.split(',') : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shasKey]);

  // Focus the churn heatmap on the selected contributor's commits (null ⇒ the
  // parent paints the aggregate across everyone).
  const focusKey = activeContributor ? activeContributor.shas.join(',') : '';
  useEffect(() => {
    onFocusShasChange?.(focusKey ? focusKey.split(',') : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Clear city hover + focus when the pane unmounts (leaving the activity view).
  useEffect(() => {
    return () => {
      onHoverCommit?.(null);
      onFocusShasChange?.(null);
      onHoverShasChange?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return to the contributor list, clearing any open commit / city hover.
  const backToContributors = () => {
    setSelectedAuthor(null);
    onSelectCommit(null);
    onHoverCommit?.(null);
    onHoverShasChange?.(null);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sticky header */}
      <div
        className="px-4 py-2 border-b sticky top-0 z-10 shrink-0 flex items-center gap-2"
        style={{ borderColor: theme.colors.border, background: theme.colors.background }}
      >
        {isOpen && shownContributor ? (
          // Drilled into one contributor: keep the section label as the back
          // target and append the handle as a breadcrumb (matching the
          // Contributors pane) rather than swapping the whole header.
          <>
            <button
              type="button"
              onClick={backToContributors}
              className="flex items-center gap-2 -ml-1 px-1.5 py-1 rounded transition-opacity hover:opacity-70 shrink-0"
              style={{ color: theme.colors.textSecondary, cursor: 'pointer' }}
              title="Back to recent activity"
              aria-label="Back to recent activity"
            >
              <ChevronLeft size={16} />
              <span
                style={{
                  fontSize: theme.fontSizes[0],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Recent Activity
              </span>
            </button>
            <ChevronRight
              size={14}
              style={{ color: theme.colors.textMuted, flexShrink: 0 }}
            />
            <span
              className="truncate"
              style={{
                fontSize: theme.fontSizes[1],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
              }}
            >
              {shownContributor.login
                ? `@${shownContributor.login}`
                : shownContributor.name}
            </span>
          </>
        ) : onClose ? (
          // Top-level: the "‹ Recent Activity main" header reads as one back
          // button to the overview, matching the other nav-card panes.
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 -ml-1 px-1.5 py-1 rounded transition-opacity hover:opacity-70"
            style={{ color: theme.colors.textSecondary, cursor: 'pointer' }}
            title="Back to overview"
            aria-label="Back to overview"
          >
            <ChevronLeft size={16} />
            <span
              style={{
                fontSize: theme.fontSizes[0],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Recent Activity
            </span>
            <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>
              main
            </span>
          </button>
        ) : (
          <>
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
              Recent Activity
            </span>
            <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>
              main
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-70"
            style={{ color: theme.colors.textMuted, cursor: loading ? 'default' : 'pointer' }}
            title="Refresh commits"
            aria-label="Refresh commits"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && commits.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 gap-3">
          <InlineTrailLoader size={40} />
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
            Loading commits…
          </span>
        </div>
      ) : error && commits.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
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
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 px-6 text-center">
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
            No commits found
          </span>
        </div>
      ) : (
        /* Two layers in a clipped track: contributor cards, and the selected
           contributor's commits, sliding the commits in over the cards. */
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {/* Contributor cards. */}
          <div
            className={`absolute inset-0 overflow-y-auto transition-transform duration-500 ease-out ${
              isOpen ? 'pointer-events-none' : ''
            }`}
            style={{ transform: isOpen ? 'translateX(-100%)' : 'translateX(0)' }}
            aria-hidden={isOpen}
          >
            <div className="flex flex-col">
              {contributors.map((c) => (
                <ContributorCard
                  key={c.key}
                  contributor={c}
                  onSelect={() => setSelectedAuthor(c.key)}
                  onHover={() => onHoverShasChange?.(c.shas)}
                  onHoverEnd={() => onHoverShasChange?.(null)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="px-3 pb-3">
                <LoadMoreButton loading={loadingMore} onClick={loadMore} />
              </div>
            )}
          </div>

          {/* Selected contributor's commits. */}
          <div
            className={`absolute inset-0 overflow-y-auto transition-transform duration-500 ease-out ${
              isOpen ? '' : 'pointer-events-none'
            }`}
            style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
            aria-hidden={!isOpen}
          >
            {authorCommits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 gap-3 text-center">
                <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
                  No recent commits from{' '}
                  {shownContributor?.login ?? shownContributor?.name ?? 'this contributor'}
                  {hasMore ? ' in the loaded history.' : '.'}
                </span>
                {hasMore && (
                  <LoadMoreButton loading={loadingMore} onClick={loadMore} />
                )}
              </div>
            ) : (
              <>
                {authorCommits.map((commit) => (
                  <CommitRow
                    key={commit.sha}
                    commit={commit}
                    selected={commit.sha === selectedCommitSha}
                    onSelect={() =>
                      onSelectCommit(
                        commit.sha === selectedCommitSha ? null : commit.sha,
                      )
                    }
                    onHover={() => onHoverCommit?.(commit.sha)}
                    onHoverEnd={() => onHoverCommit?.(null)}
                  />
                ))}
                {hasMore && (
                  <LoadMoreButton loading={loadingMore} onClick={loadMore} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const LoadMoreButton: React.FC<{ loading: boolean; onClick: () => void }> = ({
  loading,
  onClick,
}) => {
  const { theme } = useTheme();
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full py-2 rounded flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
        style={{
          background: theme.colors.backgroundSecondary,
          color: theme.colors.text,
          border: `1px solid ${theme.colors.border}`,
          fontSize: theme.fontSizes[1],
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <InlineTrailLoader size={14} />
            Loading…
          </>
        ) : (
          'Load more'
        )}
      </button>
    </div>
  );
};
