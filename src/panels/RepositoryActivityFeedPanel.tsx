'use client';

/**
 * RepositoryActivityFeedPanel
 *
 * Displays activity feed for a specific repository, showing commits
 * grouped by hour over the last 24 hours. Simpler than ActivityFeedPanel
 * since it only tracks one repository.
 */

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Calendar, RefreshCw } from 'lucide-react';
import type { PanelEventEmitter } from '@principal-ade/panel-framework-core';
import { useGitHubActivityFeed, type RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { useCommitThemes } from '@/hooks/useCommitThemes';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { RepoActivityCard } from './RepoActivityCard';
import { RepoThemeCards } from './RepoThemeCards';
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

interface RepositoryActivityFeedPanelProps {
  owner: string;
  repo: string;
  className?: string;
  events?: PanelEventEmitter;
}

export const RepositoryActivityFeedPanel: React.FC<RepositoryActivityFeedPanelProps> = ({
  owner,
  repo,
  className,
  events,
}) => {
  const { theme } = useTheme();
  const router = useRouter();

  // Track expanded state for cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Track selected package for filtering
  const [selectedPackagePath, setSelectedPackagePath] = useState<string | null>(null);

  // Track selected theme for filtering
  const [selectedThemeTitle, setSelectedThemeTitle] = useState<string | null>(null);

  // Create a single-repo array for the activity feed hook
  const feedRepos = useMemo(() => [{
    owner,
    repo,
    description: undefined,
  }], [owner, repo]);

  // Fetch activity for this specific repo
  const { repoSummaries, loading, error, refresh } = useGitHubActivityFeed(feedRepos, 50); // Fetch more commits for a single repo

  // Flatten commits and derive emergent themes via LLM
  const themeInputs = useMemo(
    () =>
      repoSummaries.flatMap((s) =>
        s.commits.map((c) => ({ sha: c.sha, message: c.message, author: c.author }))
      ),
    [repoSummaries]
  );
  const { themes, loading: themesLoading, error: themesError } = useCommitThemes(
    `${owner}/${repo}`,
    themeInputs
  );
  const selectedTheme = useMemo(
    () => themes.find((t) => t.title === selectedThemeTitle) ?? null,
    [themes, selectedThemeTitle]
  );

  // Listen for package selection events
  useEffect(() => {
    if (!events) return;

    const unsubscribe = events.on('package:select', (event) => {
      const payload = event.payload as { packagePath?: string };
      setSelectedPackagePath(payload?.packagePath ?? null);
    });

    return unsubscribe;
  }, [events]);

  // Track commit file data for package filtering
  const [commitFilesData, setCommitFilesData] = useState<Map<string, string[]>>(new Map());
  const [fetchingCommitFiles, setFetchingCommitFiles] = useState(false);
  const fetchedShasRef = useRef<Set<string>>(new Set());

  // Fetch file lists for commits when package filter is applied
  useEffect(() => {
    if (!selectedPackagePath || repoSummaries.length === 0) return;

    const fetchCommitFiles = async () => {
      // Find commits we haven't fetched yet
      const shasToFetch = repoSummaries
        .flatMap(s => s.commits)
        .map(c => c.sha)
        .filter(sha => !fetchedShasRef.current.has(sha))
        .slice(0, 20); // Limit to 20 commits to avoid rate limits

      if (shasToFetch.length === 0) {
        return; // Nothing to fetch
      }

      setFetchingCommitFiles(true);

      try {
        // Mark these as being fetched
        shasToFetch.forEach(sha => fetchedShasRef.current.add(sha));

        const promises = shasToFetch.map(async (sha) => {
          try {
            const response = await fetch(
              `/api/github/repo/${owner}/${repo}/commits/${sha}`
            );
            if (!response.ok) return null;

            const data = await response.json();
            const files = (data.files || []).map((f: { filename: string }) => f.filename);
            return { sha, files };
          } catch {
            return null;
          }
        });

        const results = await Promise.all(promises);

        // Update state with new data
        setCommitFilesData((prevData) => {
          const newFilesData = new Map(prevData);
          results.forEach((result) => {
            if (result) {
              newFilesData.set(result.sha, result.files);
            }
          });
          return newFilesData;
        });
      } catch (error) {
        console.error('[RepositoryActivityFeedPanel] Error fetching commit files:', error);
      } finally {
        setFetchingCommitFiles(false);
      }
    };

    fetchCommitFiles();
  }, [selectedPackagePath, owner, repo, repoSummaries]);

  // Filter commits by selected package and/or theme
  const filteredSummaries = useMemo(() => {
    if (!selectedPackagePath && !selectedTheme) {
      return repoSummaries;
    }

    const themeShaSet = selectedTheme ? new Set(selectedTheme.shas) : null;
    const normalizedPackagePath = selectedPackagePath
      ? selectedPackagePath.replace(/^\/+|\/+$/g, '')
      : null;

    return repoSummaries
      .map((summary) => {
        const filteredCommits = summary.commits.filter((commit) => {
          if (themeShaSet && !themeShaSet.has(commit.sha)) return false;

          if (normalizedPackagePath) {
            // If we don't have file data yet, include the commit (will be filtered once data loads)
            const files = commitFilesData.get(commit.sha);
            if (!files) return true;

            return files.some((file) => {
              const normalizedFile = file.replace(/^\/+/, '');
              return normalizedFile.startsWith(normalizedPackagePath + '/') ||
                     normalizedFile === normalizedPackagePath ||
                     normalizedFile.startsWith(normalizedPackagePath) && normalizedFile[normalizedPackagePath.length] === '/';
            });
          }

          return true;
        });

        if (filteredCommits.length === 0) return null;

        return {
          ...summary,
          commits: filteredCommits,
          commitCount: filteredCommits.length,
        };
      })
      .filter((s): s is RepoActivitySummary => s !== null);
  }, [repoSummaries, selectedPackagePath, commitFilesData, selectedTheme]);

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
    return groupSummariesByHour(filteredSummaries);
  }, [filteredSummaries]);

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
        <InlineTrailLoader size={32} />
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
          {selectedPackagePath
            ? `No commits found for ${selectedPackagePath.split('/').pop() || selectedPackagePath}`
            : 'No activity in the last 24 hours'}
        </p>
        {selectedPackagePath && (
          <button
            onClick={() => setSelectedPackagePath(null)}
            style={{
              marginTop: spacing.md,
              padding: `${spacing.sm}px ${spacing.md}px`,
              background: theme.colors.primary,
              color: theme.colors.background,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[2],
            }}
          >
            Clear filter
          </button>
        )}
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

      {/* Theme cards */}
      <RepoThemeCards
        themes={themes}
        loading={themesLoading}
        error={themesError}
        selectedTitle={selectedThemeTitle}
        onSelect={setSelectedThemeTitle}
      />

      {/* Package filter chip */}
      {selectedPackagePath && (
        <div
          style={{
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderBottom: `1px solid ${theme.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <span style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}>
            Filtered by package:
          </span>
          <button
            onClick={() => setSelectedPackagePath(null)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              background: theme.colors.primary + '20',
              color: theme.colors.primary,
              border: `1px solid ${theme.colors.primary}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: theme.fontSizes[2],
              fontFamily: theme.fonts.body,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <span>{selectedPackagePath.split('/').pop() || selectedPackagePath}</span>
            <span>&times;</span>
          </button>
          {fetchingCommitFiles && (
            <>
              <InlineTrailLoader size={14} />
              <span style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}>
                Analyzing commits...
              </span>
            </>
          )}
        </div>
      )}

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
                      onCommitSelect={(commit) => {
                        // Emit event for commit selection
                        events?.emit({
                          type: 'git-panels.commit-detail:selected',
                          source: 'repository-activity-feed',
                          timestamp: Date.now(),
                          payload: {
                            hash: commit.sha,
                            repository: summary.fullName,
                            message: commit.message,
                            author: commit.author,
                            date: commit.date,
                          },
                        });
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
