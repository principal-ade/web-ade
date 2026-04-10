'use client';

/**
 * RepositoryActivityFeedPanel
 *
 * Displays activity feed for a specific repository, showing commits
 * grouped by hour over the last 24 hours. Simpler than ActivityFeedPanel
 * since it only tracks one repository.
 */

import React, { useMemo, useEffect, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Calendar, RefreshCw } from 'lucide-react';
import { useGitHubActivityFeed, type RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { RepoActivityCard } from './RepoActivityCard';
import { useRouter } from 'next/navigation';

// Hour helpers for grouping
const formatHourLabel = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

interface HourGroup {
  hour: number;
  date: Date;
  dateKey: string;
  isFirst: boolean;
  summaries: RepoActivitySummary[];
  commitCount: number;
}

// Group summaries by hour, splitting repos that span multiple hours
function groupSummariesByHour(summaries: RepoActivitySummary[]): HourGroup[] {
  const hourMap = new Map<string, {
    hour: number;
    date: Date;
    summaryMap: Map<string, RepoActivitySummary>;
    commitCount: number;
  }>();

  // Process each summary
  for (const summary of summaries) {
    for (const commit of summary.commits) {
      const commitDate = new Date(commit.date);
      const hour = commitDate.getHours();
      const dateKey = `${commitDate.getFullYear()}-${commitDate.getMonth()}-${commitDate.getDate()}-${hour}`;

      if (!hourMap.has(dateKey)) {
        // Create a representative date for this hour
        const hourDate = new Date(commitDate);
        hourDate.setMinutes(0, 0, 0);
        hourMap.set(dateKey, {
          hour,
          date: hourDate,
          summaryMap: new Map(),
          commitCount: 0,
        });
      }

      const group = hourMap.get(dateKey)!;
      group.commitCount++;

      // Add or update the summary for this repo in this hour
      if (!group.summaryMap.has(summary.fullName)) {
        group.summaryMap.set(summary.fullName, {
          ...summary,
          commits: [],
          commitCount: 0,
          latestCommitAt: commitDate,
        });
      }

      const hourSummary = group.summaryMap.get(summary.fullName)!;
      hourSummary.commits.push(commit);
      hourSummary.commitCount++;
      if (commitDate > hourSummary.latestCommitAt) {
        hourSummary.latestCommitAt = commitDate;
      }
    }
  }

  // Convert to array and sort by time (most recent first)
  const groups: HourGroup[] = [];
  for (const [dateKey, group] of hourMap) {
    const summaryList = Array.from(group.summaryMap.values())
      .sort((a, b) => new Date(b.latestCommitAt).getTime() - new Date(a.latestCommitAt).getTime());

    groups.push({
      hour: group.hour,
      date: group.date,
      dateKey,
      isFirst: false,
      summaries: summaryList,
      commitCount: group.commitCount,
    });
  }

  // Sort by date (most recent first)
  groups.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Mark the first one
  if (groups.length > 0) {
    groups[0]!.isFirst = true;
  }

  return groups;
}

function formatDateLabel(date: Date): string | null {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return null;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

export interface RepositoryActivityFeedPanelProps {
  owner: string;
  repo: string;
  className?: string;
}

export const RepositoryActivityFeedPanel: React.FC<RepositoryActivityFeedPanelProps> = ({
  owner,
  repo,
  className,
}) => {
  const { theme } = useTheme();
  const router = useRouter();

  // Track expanded state for cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Create a single-repo array for the activity feed hook
  const feedRepos = useMemo(() => [{
    owner,
    repo,
    description: undefined,
  }], [owner, repo]);

  // Fetch activity for this specific repo
  const { repoSummaries, loading, error, refresh } = useGitHubActivityFeed(feedRepos, 50); // Fetch more commits for a single repo

  // Poll for updates every 60 seconds when tab is visible
  useEffect(() => {
    const POLL_INTERVAL = 60 * 1000; // 60 seconds
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        refresh();
      }, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Refresh immediately when tab becomes visible
        refresh();
        startPolling();
      }
    };

    // Start polling if tab is visible
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  };

  // Group commits by hour
  const hourGroups = useMemo(() => {
    return groupSummariesByHour(repoSummaries);
  }, [repoSummaries]);

  // Loading state
  if (loading && repoSummaries.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full ${className || ''}`}
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
        }}
      >
        <LoadingSpinner size={32} color={theme.colors.primary} />
        <p style={{ marginTop: spacing.md, color: theme.colors.textMuted }}>
          Loading activity...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full ${className || ''}`}
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
        }}
      >
        <p style={{ color: theme.colors.error }}>Failed to load activity</p>
        <p style={{ marginTop: spacing.sm, color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
          {error}
        </p>
        <button
          onClick={refresh}
          style={{
            marginTop: spacing.md,
            padding: `${spacing.sm}px ${spacing.md}px`,
            background: theme.colors.primary,
            color: theme.colors.background,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: theme.fontSizes[2],
            fontFamily: theme.fonts.body,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // No activity state
  if (hourGroups.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full ${className || ''}`}
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
        }}
      >
        <Calendar size={48} style={{ color: theme.colors.textMuted, marginBottom: spacing.md }} />
        <p style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[3] }}>
          No activity in the last 24 hours
        </p>
        <button
          onClick={refresh}
          style={{
            marginTop: spacing.md,
            padding: `${spacing.sm}px ${spacing.md}px`,
            background: theme.colors.secondary,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: theme.fontSizes[2],
            fontFamily: theme.fonts.body,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
    );
  }

  // Activity feed
  return (
    <div
      className={`h-full overflow-y-auto ${className || ''}`}
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: theme.colors.background,
          borderBottom: `1px solid ${theme.colors.border}`,
          padding: `${spacing.md}px ${spacing.lg}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: theme.fontSizes[4], fontWeight: 600 }}>
            Activity Feed
          </h2>
          <p style={{ margin: `${spacing.xs}px 0 0 0`, fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}>
            Last 24 hours
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            background: theme.colors.secondary,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: theme.fontSizes[2],
            fontFamily: theme.fonts.body,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Activity cards grouped by hour */}
      <div style={{ padding: spacing.lg }}>
        {hourGroups.map((group) => {
          const dateLabel = formatDateLabel(group.date);

          return (
            <div key={group.dateKey} style={{ marginBottom: spacing.xl }}>
              {/* Date header if not today */}
              {dateLabel && (
                <div
                  style={{
                    fontSize: theme.fontSizes[2],
                    fontWeight: 600,
                    color: theme.colors.textMuted,
                    marginBottom: spacing.md,
                    paddingTop: spacing.md,
                    borderTop: `1px solid ${theme.colors.border}`,
                  }}
                >
                  {dateLabel}
                </div>
              )}

              {/* Hour header */}
              <div
                style={{
                  fontSize: theme.fontSizes[3],
                  fontWeight: 600,
                  marginBottom: spacing.md,
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <span>{formatHourLabel(group.hour)}</span>
                <span style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted, fontWeight: 400 }}>
                  {group.commitCount} {group.commitCount === 1 ? 'commit' : 'commits'}
                </span>
              </div>

              {/* Repo cards for this hour */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {group.summaries.map((summary) => {
                  const cardKey = `${summary.fullName}-${group.dateKey}`;
                  return (
                    <RepoActivityCard
                      key={cardKey}
                      summary={summary}
                      isExpanded={expandedCards.has(cardKey)}
                      onToggleExpand={() => {
                        setExpandedCards(prev => {
                          const next = new Set(prev);
                          if (next.has(cardKey)) {
                            next.delete(cardKey);
                          } else {
                            next.add(cardKey);
                          }
                          return next;
                        });
                      }}
                      onOpen={() => {
                        router.push(`/${summary.owner}/${summary.repo}`);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
