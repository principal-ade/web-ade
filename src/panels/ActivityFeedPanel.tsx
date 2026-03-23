'use client';

/**
 * ActivityFeedPanel
 *
 * Displays an aggregated activity feed showing repository cards
 * sorted by recent activity. Features a 3-column layout:
 * - Left: Search repositories
 * - Center: Activity feed cards
 * - Right: Hourly activity heatmap
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { FolderGit2, Search, X } from 'lucide-react';
import { useGitHubActivityFeed, type RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { FEATURED_REPOS } from '@/lib/featured-repos';
import { RepoActivityCard } from './RepoActivityCard';
import { HourlyActivityHeatmap, type CommitTimestamp } from '@/components/HourlyActivityHeatmap';

export interface ActivityFeedPanelProps {
  className?: string;
}

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({
  className,
}) => {
  const { theme } = useTheme();
  const { repoSummaries, loading, error } = useGitHubActivityFeed(FEATURED_REPOS, 10);

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // State for expanded cards
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Time filter from heatmap
  const [timeFilter, setTimeFilter] = useState<{ start: Date; end: Date } | null>(null);

  // Filter repos by search query
  const filteredRepoSummaries = useMemo(() => {
    if (!searchQuery.trim()) return repoSummaries;

    const query = searchQuery.toLowerCase();
    return repoSummaries.filter(
      (s) =>
        s.repo.toLowerCase().includes(query) ||
        s.owner.toLowerCase().includes(query) ||
        s.fullName.toLowerCase().includes(query)
    );
  }, [repoSummaries, searchQuery]);

  // Filter repos by time (from heatmap click)
  const timeFilteredSummaries = useMemo(() => {
    if (!timeFilter) return filteredRepoSummaries;

    return filteredRepoSummaries.filter((summary) =>
      summary.commits.some((commit) => {
        const commitDate = new Date(commit.date);
        return commitDate >= timeFilter.start && commitDate < timeFilter.end;
      })
    );
  }, [filteredRepoSummaries, timeFilter]);

  // Split into recent and older
  const { recentRepos, olderRepos } = useMemo(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recent = timeFilteredSummaries.filter(
      (s) => s.latestCommitAt >= twentyFourHoursAgo
    );
    const older = timeFilteredSummaries.filter(
      (s) => s.latestCommitAt < twentyFourHoursAgo
    );
    return { recentRepos: recent, olderRepos: older };
  }, [timeFilteredSummaries]);

  // Build heatmap commits from all repo summaries
  const heatmapCommits = useMemo<CommitTimestamp[]>(() => {
    const commits: CommitTimestamp[] = [];
    for (const summary of repoSummaries) {
      for (const commit of summary.commits) {
        commits.push({
          timestamp: commit.date,
          repoId: summary.fullName,
        });
      }
    }
    return commits;
  }, [repoSummaries]);

  // Toggle card expansion
  const toggleExpanded = (fullName: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return next;
    });
  };

  // Handle opening repo (navigate to repo page)
  const handleRepoOpen = (summary: RepoActivitySummary) => {
    window.location.href = `/${summary.owner}/${summary.repo}`;
  };

  // Handle heatmap block click
  const handleHeatmapBlockClick = useCallback((start: Date, end: Date, count: number) => {
    if (count === 0) return;

    // Toggle filter if clicking same block
    if (timeFilter && timeFilter.start.getTime() === start.getTime()) {
      setTimeFilter(null);
    } else {
      setTimeFilter({ start, end });
    }
  }, [timeFilter]);

  // Clear time filter
  const clearTimeFilter = () => {
    setTimeFilter(null);
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: theme.colors.background,
      }}
    >
      {/* 3-Column Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Left column - Search */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: 300, padding: spacing.md }}>
            {/* Search input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: theme.colors.surface,
                borderRadius: 4,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <Search size={16} color={theme.colors.textMuted} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search repositories..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: theme.colors.text,
                  fontSize: theme.fontSizes[1],
                  fontFamily: 'inherit',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: spacing.xs,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  <X size={14} color={theme.colors.textMuted} />
                </button>
              )}
            </div>
          </div>

          {/* Search info */}
          <div style={{ width: 300, flex: 1, overflow: 'auto', padding: `0 ${spacing.md}px ${spacing.md}px` }}>
            {!searchQuery.trim() ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: theme.colors.textMuted,
                  textAlign: 'center',
                  fontSize: theme.fontSizes[1],
                }}
              >
                <Search size={32} style={{ marginBottom: spacing.sm, opacity: 0.3 }} />
                <span>Search featured repos</span>
              </div>
            ) : filteredRepoSummaries.length === 0 ? (
              <div
                style={{
                  padding: spacing.md,
                  textAlign: 'center',
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSizes[1],
                }}
              >
                No results for &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div
                style={{
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textMuted,
                }}
              >
                {filteredRepoSummaries.length} result{filteredRepoSummaries.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Center column - Feed */}
        <div
          style={{
            width: 800,
            flexShrink: 0,
            overflow: 'auto',
            padding: spacing.md,
          }}
        >
          {/* Time filter indicator */}
          {timeFilter && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.sm,
                marginBottom: spacing.md,
                backgroundColor: `${theme.colors.primary}10`,
                borderRadius: 4,
                border: `1px solid ${theme.colors.primary}`,
              }}
            >
              <span style={{ fontSize: theme.fontSizes[1], color: theme.colors.text }}>
                Showing commits from {timeFilter.start.toLocaleTimeString()} - {timeFilter.end.toLocaleTimeString()}
              </span>
              <button
                onClick={clearTimeFilter}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.colors.primary}`,
                  borderRadius: 4,
                  color: theme.colors.primary,
                  cursor: 'pointer',
                  fontSize: theme.fontSizes[1],
                }}
              >
                <X size={12} />
                Clear
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: spacing.md,
                backgroundColor: `${theme.colors.error}20`,
                borderRadius: 8,
                color: theme.colors.error,
                marginBottom: spacing.md,
              }}
            >
              {error}
            </div>
          )}

          {timeFilteredSummaries.length === 0 && !loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: 400,
                color: theme.colors.textMuted,
                textAlign: 'center',
              }}
            >
              <FolderGit2 size={48} style={{ marginBottom: spacing.md, opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: theme.fontSizes[2] }}>
                {timeFilter ? 'No commits in this time range' : 'No recent activity'}
              </p>
              <p style={{ margin: `${spacing.xs}px 0 0`, fontSize: theme.fontSizes[1] }}>
                {timeFilter ? 'Try selecting a different time block' : 'Commits from featured repositories will appear here'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {/* Recent repos (last 24h) */}
              {recentRepos.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: theme.fontSizes[1],
                      fontWeight: 600,
                      color: theme.colors.textMuted,
                      marginBottom: spacing.sm,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Last 24 Hours
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {recentRepos.map((summary) => (
                      <RepoActivityCard
                        key={summary.fullName}
                        summary={summary}
                        isExpanded={expandedRepos.has(summary.fullName)}
                        onToggleExpand={() => toggleExpanded(summary.fullName)}
                        onOpen={() => handleRepoOpen(summary)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Older repos */}
              {olderRepos.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: theme.fontSizes[1],
                      fontWeight: 600,
                      color: theme.colors.textMuted,
                      marginBottom: spacing.sm,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Earlier
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {olderRepos.map((summary) => (
                      <RepoActivityCard
                        key={summary.fullName}
                        summary={summary}
                        isExpanded={expandedRepos.has(summary.fullName)}
                        onToggleExpand={() => toggleExpanded(summary.fullName)}
                        onOpen={() => handleRepoOpen(summary)}
                        dimmed
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column - Heatmap */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 300,
              height: '100%',
              padding: spacing.md,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <HourlyActivityHeatmap
              commits={heatmapCommits}
              loading={loading}
              onBlockClick={handleHeatmapBlockClick}
              selectedBlock={timeFilter?.start.toISOString() ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
