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
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { ActivityEvent, UserActivityResponse } from '@/app/api/github/user/[username]/activity/route';

interface CommitDetails {
  sha: string;
  message: string;
  date: string;
  url: string;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set());
  const [commitDetails, setCommitDetails] = useState<Record<string, CommitDetails[]>>({});
  const [loadingCommits, setLoadingCommits] = useState<Set<string>>(new Set());

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

  // Toggle commit expansion and fetch details if needed
  const toggleCommitExpansion = useCallback(async (event: ActivityEvent) => {
    const eventId = event.id;

    if (expandedCommits.has(eventId)) {
      // Collapse
      setExpandedCommits((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      return;
    }

    // Expand
    setExpandedCommits((prev) => new Set(prev).add(eventId));

    // Already have details cached
    if (commitDetails[eventId]) return;

    // Fetch commit details
    const [owner, repo] = event.repository.split('/');
    if (!owner || !repo || !targetUsername) return;

    setLoadingCommits((prev) => new Set(prev).add(eventId));

    try {
      const response = await fetch(
        `/api/github/user/${targetUsername}/commits/${owner}/${repo}`
      );
      if (response.ok) {
        const data = await response.json();
        setCommitDetails((prev) => ({
          ...prev,
          [eventId]: data.commits,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch commit details:', err);
    } finally {
      setLoadingCommits((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }, [expandedCommits, commitDetails, targetUsername]);

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
          <h3
            className="mb-1"
            style={{
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.semibold,
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
            }}
          >
            Activity Timeline
          </h3>
          <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
            Sign in to view your activity or visit a user&apos;s profile
          </p>
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
          <p style={{ fontSize: `${theme.fontSizes[2]}px`, fontFamily: theme.fonts.body }}>
            Loading activity...
          </p>
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
          <p
            className="mb-2"
            style={{ fontSize: `${theme.fontSizes[2]}px`, fontFamily: theme.fonts.body }}
          >
            Failed to load activity
          </p>
          <p
            className="mb-4"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
              color: theme.colors.textMuted,
            }}
          >
            {error}
          </p>
          <button
            onClick={() => void fetchActivity()}
            className="px-3 py-1.5 rounded"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
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
              className="px-3 py-1.5 rounded transition-colors"
              style={{
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
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
            <h3
              className="mb-1"
              style={{
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.semibold,
                fontFamily: theme.fonts.body,
                color: theme.colors.text,
              }}
            >
              No Activity Found
            </h3>
            <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
              No {filter === 'all' ? '' : filter + ' '}activity in the last day
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
      {/* Filter Tabs */}
      <div
        className="flex items-center gap-1 p-2 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        {(['all', 'commits', 'prs', 'issues'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded transition-colors"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
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
            className="ml-auto px-2 py-1 rounded"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
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
        {Array.from(groupedEvents.entries()).map(([date, dateEvents]) => (
          <div key={date} className="border-b" style={{ borderColor: theme.colors.border }}>
            {/* Date Header */}
            <div
              className="px-3 py-2 sticky top-0"
              style={{
                fontSize: `${theme.fontSizes[1]}px`,
                fontWeight: theme.fontWeights.medium,
                fontFamily: theme.fonts.body,
                background: theme.colors.surface,
                color: theme.colors.textMuted,
              }}
            >
              {date}
            </div>

            {/* Events for this date */}
            <div className="px-3 py-1">
              {dateEvents.map((event) => {
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
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            fontWeight: theme.fontWeights.medium,
                            fontFamily: theme.fonts.body,
                            background: `${color}20`,
                            color,
                          }}
                        >
                          {getEventLabel(event.type)}
                        </span>
                        <span
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            fontFamily: theme.fonts.body,
                            color: theme.colors.textMuted,
                          }}
                        >
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Title or commit info */}
                      {event.title ? (
                        <div
                          className="truncate"
                          style={{
                            fontSize: `${theme.fontSizes[2]}px`,
                            fontFamily: theme.fonts.body,
                            color: theme.colors.text,
                          }}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ) : event.type === 'commit' && event.metadata?.commitCount ? (
                        <button
                          onClick={() => toggleCommitExpansion(event)}
                          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                          style={{
                            fontSize: `${theme.fontSizes[2]}px`,
                            fontFamily: theme.fonts.body,
                            color: theme.colors.text,
                          }}
                        >
                          {expandedCommits.has(event.id) ? (
                            <ChevronDown className="w-4 h-4" style={{ color: theme.colors.textMuted }} />
                          ) : (
                            <ChevronRight className="w-4 h-4" style={{ color: theme.colors.textMuted }} />
                          )}
                          {event.metadata.commitCount} commit{event.metadata.commitCount !== 1 ? 's' : ''}
                        </button>
                      ) : null}

                      {/* Repository */}
                      <button
                        onClick={() => setSelectedRepo(event.repository)}
                        className="hover:underline"
                        style={{
                          fontSize: `${theme.fontSizes[1]}px`,
                          fontFamily: theme.fonts.body,
                          color: theme.colors.textMuted,
                        }}
                      >
                        {event.repository}
                      </button>

                      {/* PR stats */}
                      {event.type === 'pr_merged' && event.metadata && (
                        <div
                          className="flex items-center gap-2 mt-1"
                          style={{ fontSize: `${theme.fontSizes[0]}px`, fontFamily: theme.fonts.body }}
                        >
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

                      {/* Expanded commit details */}
                      {event.type === 'commit' && expandedCommits.has(event.id) && (
                        <div
                          className="mt-2 pl-5 border-l-2 space-y-1"
                          style={{ borderColor: theme.colors.border }}
                        >
                          {loadingCommits.has(event.id) ? (
                            <div
                              className="flex items-center gap-2 py-1"
                              style={{ color: theme.colors.textMuted }}
                            >
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
                                Loading commits...
                              </span>
                            </div>
                          ) : commitDetails[event.id]?.length ? (
                            commitDetails[event.id]!.map((commit) => (
                              <a
                                key={commit.sha}
                                href={commit.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 py-1 hover:opacity-80 transition-opacity"
                                style={{ textDecoration: 'none' }}
                              >
                                <code
                                  className="flex-shrink-0"
                                  style={{
                                    fontSize: `${theme.fontSizes[0]}px`,
                                    fontFamily: theme.fonts.monospace,
                                    color: theme.colors.info,
                                  }}
                                >
                                  {commit.sha}
                                </code>
                                <span
                                  className="truncate"
                                  style={{
                                    fontSize: `${theme.fontSizes[1]}px`,
                                    fontFamily: theme.fonts.body,
                                    color: theme.colors.text,
                                  }}
                                  title={commit.message}
                                >
                                  {commit.message}
                                </span>
                              </a>
                            ))
                          ) : (
                            <div
                              className="py-1"
                              style={{
                                fontSize: `${theme.fontSizes[1]}px`,
                                fontFamily: theme.fonts.body,
                                color: theme.colors.textMuted,
                              }}
                            >
                              No commit details available
                            </div>
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
        className="px-3 py-2 border-t text-center"
        style={{
          fontSize: `${theme.fontSizes[0]}px`,
          fontFamily: theme.fonts.body,
          borderColor: theme.colors.border,
          color: theme.colors.textMuted,
        }}
      >
        {filteredActivity.length} activities in the last day
      </div>
    </div>
  );
}
