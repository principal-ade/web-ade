'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import type { PanelContextValue, PanelActions, PanelEventEmitter } from '@principal-ade/panel-framework-core';
import {
  GitCommit,
  GitMerge,
  GitPullRequest,
  CircleDot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import type { ActivityEvent, UserActivityResponse } from '@/app/api/github/user/[username]/activity/route';

export interface UserActivityPanelProps {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
  username?: string;
}

type FilterType = 'all' | 'commits' | 'prs' | 'issues';

function getEventIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'commit':
      return GitCommit;
    case 'pr_merged':
      return GitMerge;
    case 'pr_opened':
      return GitPullRequest;
    case 'issue_opened':
      return CircleDot;
    case 'issue_closed':
      return CheckCircle2;
    default:
      return CircleDot;
  }
}

function getEventColor(type: ActivityEvent['type'], theme: ReturnType<typeof useTheme>['theme']) {
  switch (type) {
    case 'commit':
      return theme.colors.info;
    case 'pr_merged':
      return '#8957e5'; // GitHub purple
    case 'pr_opened':
      return theme.colors.success;
    case 'issue_opened':
      return theme.colors.success;
    case 'issue_closed':
      return theme.colors.error;
    default:
      return theme.colors.textMuted;
  }
}

function getEventLabel(type: ActivityEvent['type']) {
  switch (type) {
    case 'commit':
      return 'Commits';
    case 'pr_merged':
      return 'Merged PR';
    case 'pr_opened':
      return 'Opened PR';
    case 'issue_opened':
      return 'Opened Issue';
    case 'issue_closed':
      return 'Closed Issue';
    default:
      return 'Activity';
  }
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function groupEventsByDate(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const groups = new Map<string, ActivityEvent[]>();

  for (const event of events) {
    const date = new Date(event.timestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(event);
  }

  return groups;
}

function filterEvents(events: ActivityEvent[], filter: FilterType): ActivityEvent[] {
  if (filter === 'all') return events;

  return events.filter((event) => {
    switch (filter) {
      case 'commits':
        return event.type === 'commit';
      case 'prs':
        return event.type === 'pr_merged' || event.type === 'pr_opened';
      case 'issues':
        return event.type === 'issue_opened' || event.type === 'issue_closed';
      default:
        return true;
    }
  });
}

export function UserActivityPanel({ context: _context, actions: _actions, events, username }: UserActivityPanelProps) {
  const { theme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [userInfo, setUserInfo] = useState<UserActivityResponse['user'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  // Determine which username to fetch
  const targetUsername = username || user?.login;

  const fetchActivity = useCallback(async () => {
    if (!targetUsername) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/github/user/${targetUsername}/activity`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to fetch activity: ${response.status}`);
      }

      const data: UserActivityResponse = await response.json();
      setUserInfo(data.user);
      setActivity(data.activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  }, [targetUsername]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Listen for filter events from ActivityFilterPanel
  useEffect(() => {
    const unsubscribers = [
      events.on('activity:filter:type', (event) => {
        const payload = event.payload as { filter: FilterType };
        if (payload?.filter) {
          setFilter(payload.filter);
        }
      }),
      events.on('activity:filter:repo', (event) => {
        const payload = event.payload as { repository: string | null };
        setSelectedRepo(payload?.repository ?? null);
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events]);

  // Show auth prompt if no username provided and not authenticated
  if (!targetUsername && !isAuthenticated) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <h3 className="text-sm font-semibold mb-1" style={{ color: theme.colors.text }}>
            Activity Timeline
          </h3>
          <p className="text-xs">Sign in to view your activity or visit a user&apos;s profile</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading activity...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.error }}
      >
        <div className="text-center max-w-xs">
          <p className="text-sm mb-2">Failed to load activity</p>
          <p className="text-xs mb-4" style={{ color: theme.colors.textMuted }}>
            {error}
          </p>
          <button
            onClick={() => void fetchActivity()}
            className="px-3 py-1.5 text-xs rounded"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <RefreshCw className="h-3 w-3 inline mr-1" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Apply filters
  let filteredActivity = filterEvents(activity, filter);
  if (selectedRepo) {
    filteredActivity = filteredActivity.filter((e) => e.repository === selectedRepo);
  }

  const groupedEvents = groupEventsByDate(filteredActivity);

  // Empty state
  if (filteredActivity.length === 0) {
    return (
      <div
        className="h-full w-full flex flex-col overflow-hidden"
        style={{ background: theme.colors.background }}
      >
        {/* Filter Tabs */}
        <div
          className="flex items-center gap-1 p-2 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          {(['all', 'commits', 'prs', 'issues'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 text-xs rounded transition-colors"
              style={{
                background: filter === f ? theme.colors.primary : 'transparent',
                color: filter === f ? theme.colors.textOnPrimary : theme.colors.textMuted,
              }}
            >
              {f === 'all' ? 'All' : f === 'commits' ? 'Commits' : f === 'prs' ? 'PRs' : 'Issues'}
            </button>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center" style={{ color: theme.colors.textMuted }}>
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-semibold mb-1" style={{ color: theme.colors.text }}>
              No Activity Found
            </h3>
            <p className="text-xs">
              No {filter === 'all' ? '' : filter + ' '}activity in the last 30 days
              {selectedRepo ? ` for ${selectedRepo}` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      {/* Header with user info */}
      {userInfo && (
        <div
          className="flex items-center justify-between p-3 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          <div className="flex items-center gap-2">
            <img
              src={userInfo.avatarUrl}
              alt={userInfo.login}
              className="w-6 h-6 rounded-full"
            />
            <span className="text-sm font-medium" style={{ color: theme.colors.text }}>
              {userInfo.name || userInfo.login}
            </span>
            {userInfo.name && (
              <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                @{userInfo.login}
              </span>
            )}
          </div>
          <button
            onClick={() => void fetchActivity()}
            className="p-1 rounded hover:opacity-75"
            style={{ color: theme.colors.textMuted }}
            title="Refresh activity"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div
        className="flex items-center gap-1 p-2 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        {(['all', 'commits', 'prs', 'issues'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 text-xs rounded transition-colors"
            style={{
              background: filter === f ? theme.colors.primary : 'transparent',
              color: filter === f ? theme.colors.textOnPrimary : theme.colors.textMuted,
            }}
          >
            {f === 'all' ? 'All' : f === 'commits' ? 'Commits' : f === 'prs' ? 'PRs' : 'Issues'}
          </button>
        ))}
        {selectedRepo && (
          <button
            onClick={() => setSelectedRepo(null)}
            className="ml-auto px-2 py-1 text-xs rounded"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {selectedRepo.split('/')[1]} &times;
          </button>
        )}
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(groupedEvents.entries()).map(([date, events]) => (
          <div key={date} className="border-b" style={{ borderColor: theme.colors.border }}>
            {/* Date Header */}
            <div
              className="px-3 py-2 text-xs font-medium sticky top-0"
              style={{
                background: theme.colors.surface,
                color: theme.colors.textMuted,
              }}
            >
              {date}
            </div>

            {/* Events for this date */}
            <div className="px-3 py-1">
              {events.map((event) => {
                const Icon = getEventIcon(event.type);
                const color = getEventColor(event.type, theme);

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 py-2 group"
                  >
                    {/* Icon */}
                    <div
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                      style={{ background: `${color}20` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            background: `${color}20`,
                            color,
                          }}
                        >
                          {getEventLabel(event.type)}
                        </span>
                        <span className="text-[10px]" style={{ color: theme.colors.textMuted }}>
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Title or commit info */}
                      {event.title ? (
                        <div
                          className="text-sm truncate"
                          style={{ color: theme.colors.text }}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ) : event.type === 'commit' && event.metadata?.commitCount ? (
                        <div className="text-sm" style={{ color: theme.colors.text }}>
                          {event.metadata.commitCount} commit{event.metadata.commitCount !== 1 ? 's' : ''}
                        </div>
                      ) : null}

                      {/* Repository */}
                      <button
                        onClick={() => setSelectedRepo(event.repository)}
                        className="text-xs hover:underline"
                        style={{ color: theme.colors.textMuted }}
                      >
                        {event.repository}
                      </button>

                      {/* PR stats */}
                      {event.type === 'pr_merged' && event.metadata && (
                        <div className="flex items-center gap-2 mt-1 text-[10px]">
                          {event.metadata.additions !== undefined && (
                            <span style={{ color: theme.colors.success }}>
                              +{event.metadata.additions}
                            </span>
                          )}
                          {event.metadata.deletions !== undefined && (
                            <span style={{ color: theme.colors.error }}>
                              -{event.metadata.deletions}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* External link */}
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: theme.colors.textMuted }}
                        title="Open in GitHub"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer with stats */}
      <div
        className="px-3 py-2 border-t text-[10px] text-center"
        style={{
          borderColor: theme.colors.border,
          color: theme.colors.textMuted,
        }}
      >
        {filteredActivity.length} activities in the last 30 days
      </div>
    </div>
  );
}
