'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { PanelContextValue, PanelActions, PanelEventEmitter } from '@principal-ade/panel-framework-core';
import {
  GitCommit,
  GitMerge,
  GitPullRequest,
  CircleDot,
  Filter,
  Loader2,
  FolderGit2,
} from 'lucide-react';
import type { ActivityEvent, UserActivityResponse } from '@/app/api/github/user/[username]/activity/route';

export interface ActivityFilterPanelProps {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
  username?: string;
}

type FilterType = 'all' | 'commits' | 'prs' | 'issues';

interface RepoStats {
  repository: string;
  count: number;
  types: Set<ActivityEvent['type']>;
}

export function ActivityFilterPanel({ context: _context, actions: _actions, events, username }: ActivityFilterPanelProps) {
  const { theme } = useTheme();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  // Fetch activity data (shared with UserActivityPanel via events)
  useEffect(() => {
    if (!username) {
      setLoading(false);
      return;
    }

    const fetchActivity = async () => {
      try {
        const response = await fetch(`/api/github/user/${username}/activity`);
        if (response.ok) {
          const data: UserActivityResponse = await response.json();
          setActivity(data.activity);
        }
      } catch (err) {
        console.error('Failed to fetch activity for filters:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [username]);

  // Calculate repository stats
  const repoStats = useMemo(() => {
    const stats = new Map<string, RepoStats>();

    for (const event of activity) {
      if (!stats.has(event.repository)) {
        stats.set(event.repository, {
          repository: event.repository,
          count: 0,
          types: new Set(),
        });
      }

      const repoStat = stats.get(event.repository)!;
      repoStat.count++;
      repoStat.types.add(event.type);
    }

    // Sort by count descending
    return Array.from(stats.values()).sort((a, b) => b.count - a.count);
  }, [activity]);

  // Calculate type counts
  const typeCounts = useMemo(() => {
    const counts = {
      commits: 0,
      prs: 0,
      issues: 0,
    };

    for (const event of activity) {
      if (event.type === 'commit') {
        counts.commits++;
      } else if (event.type === 'pr_merged' || event.type === 'pr_opened') {
        counts.prs++;
      } else if (event.type === 'issue_opened' || event.type === 'issue_closed') {
        counts.issues++;
      }
    }

    return counts;
  }, [activity]);

  // Emit filter changes to UserActivityPanel
  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    events.emit({
      type: 'activity:filter:type',
      source: 'activity-filter-panel',
      timestamp: Date.now(),
      payload: { filter },
    });
  };

  const handleRepoSelect = (repo: string | null) => {
    setSelectedRepo(repo);
    events.emit({
      type: 'activity:filter:repo',
      source: 'activity-filter-panel',
      timestamp: Date.now(),
      payload: { repository: repo },
    });
  };

  if (loading) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!username) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
            No user selected
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        <Filter className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
        <span
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.medium,
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
          }}
        >
          Filters
        </span>
      </div>

      {/* Filter by Type */}
      <div className="p-3 border-b" style={{ borderColor: theme.colors.border }}>
        <div
          className="uppercase tracking-wide mb-2"
          style={{
            fontSize: `${theme.fontSizes[0]}px`,
            fontWeight: theme.fontWeights.medium,
            fontFamily: theme.fonts.body,
            color: theme.colors.textMuted,
          }}
        >
          Activity Type
        </div>
        <div className="space-y-1">
          {/* All */}
          <button
            onClick={() => handleFilterChange('all')}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded transition-colors"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
              background: selectedFilter === 'all' ? theme.colors.surface : 'transparent',
              color: selectedFilter === 'all' ? theme.colors.text : theme.colors.textMuted,
              border: selectedFilter === 'all' ? `1px solid ${theme.colors.border}` : '1px solid transparent',
            }}
          >
            <span>All Activity</span>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                fontFamily: theme.fonts.body,
                background: theme.colors.surface,
              }}
            >
              {activity.length}
            </span>
          </button>

          {/* Commits */}
          <button
            onClick={() => handleFilterChange('commits')}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded transition-colors"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
              background: selectedFilter === 'commits' ? theme.colors.surface : 'transparent',
              color: selectedFilter === 'commits' ? theme.colors.text : theme.colors.textMuted,
              border: selectedFilter === 'commits' ? `1px solid ${theme.colors.border}` : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-2">
              <GitCommit className="h-3 w-3" style={{ color: theme.colors.info }} />
              <span>Commits</span>
            </div>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                fontFamily: theme.fonts.body,
                background: theme.colors.surface,
              }}
            >
              {typeCounts.commits}
            </span>
          </button>

          {/* PRs */}
          <button
            onClick={() => handleFilterChange('prs')}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded transition-colors"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
              background: selectedFilter === 'prs' ? theme.colors.surface : 'transparent',
              color: selectedFilter === 'prs' ? theme.colors.text : theme.colors.textMuted,
              border: selectedFilter === 'prs' ? `1px solid ${theme.colors.border}` : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-2">
              <GitMerge className="h-3 w-3" style={{ color: '#8957e5' }} />
              <span>Pull Requests</span>
            </div>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                fontFamily: theme.fonts.body,
                background: theme.colors.surface,
              }}
            >
              {typeCounts.prs}
            </span>
          </button>

          {/* Issues */}
          <button
            onClick={() => handleFilterChange('issues')}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded transition-colors"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
              background: selectedFilter === 'issues' ? theme.colors.surface : 'transparent',
              color: selectedFilter === 'issues' ? theme.colors.text : theme.colors.textMuted,
              border: selectedFilter === 'issues' ? `1px solid ${theme.colors.border}` : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-2">
              <CircleDot className="h-3 w-3" style={{ color: theme.colors.success }} />
              <span>Issues</span>
            </div>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                fontFamily: theme.fonts.body,
                background: theme.colors.surface,
              }}
            >
              {typeCounts.issues}
            </span>
          </button>
        </div>
      </div>

      {/* Filter by Repository */}
      <div className="flex-1 flex flex-col min-h-0">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ color: theme.colors.textMuted }}
        >
          <span
            className="uppercase tracking-wide"
            style={{
              fontSize: `${theme.fontSizes[0]}px`,
              fontWeight: theme.fontWeights.medium,
              fontFamily: theme.fonts.body,
            }}
          >
            Repositories
          </span>
          {selectedRepo && (
            <button
              onClick={() => handleRepoSelect(null)}
              className="hover:underline"
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                fontFamily: theme.fonts.body,
                color: theme.colors.primary,
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {repoStats.length === 0 ? (
            <div
              className="text-center py-4"
              style={{ color: theme.colors.textMuted }}
            >
              <FolderGit2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
                No repositories
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {repoStats.map((repo) => (
                <button
                  key={repo.repository}
                  onClick={() => handleRepoSelect(
                    selectedRepo === repo.repository ? null : repo.repository
                  )}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded transition-colors text-left"
                  style={{
                    fontSize: `${theme.fontSizes[1]}px`,
                    fontFamily: theme.fonts.body,
                    background: selectedRepo === repo.repository ? theme.colors.surface : 'transparent',
                    color: selectedRepo === repo.repository ? theme.colors.text : theme.colors.textMuted,
                    border: selectedRepo === repo.repository ? `1px solid ${theme.colors.border}` : '1px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={`https://github.com/${repo.repository.split('/')[0]}.png?size=32`}
                      alt=""
                      className="w-4 h-4 rounded"
                    />
                    <span className="truncate">{repo.repository.split('/')[1]}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Show type indicators */}
                    {repo.types.has('commit') && (
                      <GitCommit className="h-2.5 w-2.5" style={{ color: theme.colors.info }} />
                    )}
                    {(repo.types.has('pr_merged') || repo.types.has('pr_opened')) && (
                      <GitPullRequest className="h-2.5 w-2.5" style={{ color: '#8957e5' }} />
                    )}
                    {(repo.types.has('issue_opened') || repo.types.has('issue_closed')) && (
                      <CircleDot className="h-2.5 w-2.5" style={{ color: theme.colors.success }} />
                    )}
                    <span
                      className="ml-1 px-1.5 py-0.5 rounded"
                      style={{
                        fontSize: `${theme.fontSizes[0]}px`,
                        fontFamily: theme.fonts.body,
                        background: theme.colors.surface,
                      }}
                    >
                      {repo.count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
