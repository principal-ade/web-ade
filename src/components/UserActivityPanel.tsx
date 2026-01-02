'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import type { PanelContextValue, PanelActions, PanelEventEmitter } from '@principal-ade/panel-framework-core';
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Calendar,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { DocumentView } from 'themed-markdown';
import type { ActivityEvent, UserActivityResponse, ReactionContent, ReactionCounts } from '@/app/api/github/user/[username]/activity/route';
import { WeeklyTimelineHeader } from './WeeklyTimelineHeader';

const REACTION_EMOJI: Record<ReactionContent, string> = {
  THUMBS_UP: '👍',
  THUMBS_DOWN: '👎',
  LAUGH: '😄',
  HOORAY: '🎉',
  CONFUSED: '😕',
  HEART: '❤️',
  ROCKET: '🚀',
  EYES: '👀',
};

// Order reactions should appear (most positive first)
const REACTION_ORDER: ReactionContent[] = [
  'THUMBS_UP',
  'HEART',
  'HOORAY',
  'ROCKET',
  'EYES',
  'LAUGH',
  'CONFUSED',
  'THUMBS_DOWN',
];

interface ReactionBarProps {
  reactions: ReactionCounts;
  theme: ReturnType<typeof useTheme>['theme'];
  isAuthenticated: boolean;
  onToggleReaction?: (type: ReactionContent, currentReactionId?: number) => void;
  disabled?: boolean;
}

function formatUsersTooltip(users: string[], viewerReacted: boolean, isAuthenticated: boolean): string {
  if (users.length === 0) return '';

  const maxNames = 3;
  const displayNames = users.slice(0, maxNames);
  const remaining = users.length - maxNames;

  let text = displayNames.join(', ');
  if (remaining > 0) {
    text += ` and ${remaining} other${remaining > 1 ? 's' : ''}`;
  }

  if (isAuthenticated) {
    text += viewerReacted ? '\n(click to remove)' : '\n(click to add)';
  }

  return text;
}

function ReactionBar({ reactions, theme, isAuthenticated, onToggleReaction, disabled }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);

  const sortedReactions = REACTION_ORDER
    .filter((type) => reactions.counts[type])
    .map((type) => ({
      type,
      count: reactions.counts[type]!,
      viewerReacted: !!reactions.viewerReactions[type],
      reactionId: reactions.viewerReactions[type],
      users: reactions.users[type] || [],
    }));

  const handleReactionClick = (type: ReactionContent, reactionId?: number) => {
    if (!isAuthenticated || disabled || !onToggleReaction) return;
    onToggleReaction(type, reactionId);
  };

  const handlePickerSelect = (type: ReactionContent) => {
    setShowPicker(false);
    if (!isAuthenticated || disabled || !onToggleReaction) return;
    // Check if viewer already reacted with this type
    const reactionId = reactions.viewerReactions[type];
    onToggleReaction(type, reactionId);
  };

  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      {sortedReactions.map(({ type, count, viewerReacted, reactionId, users }) => (
        <button
          key={type}
          onClick={(e) => {
            e.stopPropagation();
            handleReactionClick(type, reactionId);
          }}
          disabled={!isAuthenticated || disabled}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full transition-all"
          style={{
            fontSize: `${theme.fontSizes[0]}px`,
            fontFamily: theme.fonts.body,
            background: viewerReacted ? theme.colors.primary + '20' : theme.colors.surface,
            border: `1px solid ${viewerReacted ? theme.colors.primary : theme.colors.border}`,
            color: viewerReacted ? theme.colors.primary : theme.colors.textMuted,
            cursor: isAuthenticated && !disabled ? 'pointer' : 'default',
            opacity: disabled ? 0.5 : 1,
          }}
          title={formatUsersTooltip(users, viewerReacted, isAuthenticated)}
        >
          <span>{REACTION_EMOJI[type]}</span>
          <span>{count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      {isAuthenticated && !disabled && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPicker(!showPicker);
            }}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full transition-all hover:scale-110"
            style={{
              fontSize: `${theme.fontSizes[0]}px`,
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.textMuted,
            }}
            title="Add reaction"
          >
            +
          </button>

          {/* Emoji picker popover */}
          {showPicker && (
            <div
              className="absolute bottom-full left-0 mb-1 p-1 rounded-lg shadow-lg z-50 flex gap-0.5"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {REACTION_ORDER.map((type) => {
                const viewerReacted = !!reactions.viewerReactions[type];
                return (
                  <button
                    key={type}
                    onClick={() => handlePickerSelect(type)}
                    className="p-1 rounded hover:scale-125 transition-transform"
                    style={{
                      background: viewerReacted ? theme.colors.primary + '20' : 'transparent',
                    }}
                    title={type.replace('_', ' ').toLowerCase()}
                  >
                    {REACTION_EMOJI[type]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CommitDetails {
  sha: string;
  message: string;
  date: string;
  url: string;
}

interface IssueDetails {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{ id: number; name: string; color: string }>;
  comments: number;
}

interface PRDetails {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
}

export interface UserActivityPanelProps {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
  username?: string;
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
      return 'Opened issue';
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
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function UserActivityPanel({ context: _context, actions: _actions, events, username }: UserActivityPanelProps) {
  const { theme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set());
  const [commitDetails, setCommitDetails] = useState<Record<string, CommitDetails[]>>({});
  const [loadingCommits, setLoadingCommits] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [issueDetails, setIssueDetails] = useState<Record<string, IssueDetails>>({});
  const [loadingIssues, setLoadingIssues] = useState<Set<string>>(new Set());
  const [expandedPRs, setExpandedPRs] = useState<Set<string>>(new Set());
  const [prDetails, setPRDetails] = useState<Record<string, PRDetails>>({});
  const [loadingPRs, setLoadingPRs] = useState<Set<string>>(new Set());
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loadingReactions, setLoadingReactions] = useState<Set<string>>(new Set());

  // Scroll tracking for WeeklyTimelineHeader
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

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
      // Use the event timestamp to get commits from that day
      const eventDate = new Date(event.timestamp);
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);

      const response = await fetch(
        `/api/github/user/${targetUsername}/commits/${owner}/${repo}?since=${startOfDay.toISOString()}&until=${endOfDay.toISOString()}`
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

  // Toggle issue expansion and fetch body if needed
  const toggleIssueExpansion = useCallback(async (event: ActivityEvent) => {
    const eventId = event.id;

    if (expandedIssues.has(eventId)) {
      // Collapse
      setExpandedIssues((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      return;
    }

    // Expand
    setExpandedIssues((prev) => new Set(prev).add(eventId));

    // Already have details cached
    if (issueDetails[eventId]) return;

    // Fetch issue details
    const [owner, repo] = event.repository.split('/');
    const issueNumber = event.metadata?.issueNumber;
    if (!owner || !repo || !issueNumber) return;

    setLoadingIssues((prev) => new Set(prev).add(eventId));

    try {
      const response = await fetch(
        `/api/github/repo/${owner}/${repo}/issues/${issueNumber}`
      );
      if (response.ok) {
        const data = await response.json();
        setIssueDetails((prev) => ({
          ...prev,
          [eventId]: data,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch issue details:', err);
    } finally {
      setLoadingIssues((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }, [expandedIssues, issueDetails]);

  // Toggle PR expansion and fetch body if needed
  const togglePRExpansion = useCallback(async (event: ActivityEvent) => {
    const eventId = event.id;

    if (expandedPRs.has(eventId)) {
      // Collapse
      setExpandedPRs((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      return;
    }

    // Expand
    setExpandedPRs((prev) => new Set(prev).add(eventId));

    // Already have details cached
    if (prDetails[eventId]) return;

    // Fetch PR details
    const [owner, repo] = event.repository.split('/');
    const prNumber = event.metadata?.prNumber;
    if (!owner || !repo || !prNumber) return;

    setLoadingPRs((prev) => new Set(prev).add(eventId));

    try {
      const response = await fetch(
        `/api/github/repo/${owner}/${repo}/pull-requests/${prNumber}`
      );
      if (response.ok) {
        const data = await response.json();
        setPRDetails((prev) => ({
          ...prev,
          [eventId]: data,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch PR details:', err);
    } finally {
      setLoadingPRs((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }, [expandedPRs, prDetails]);

  // Toggle reaction (add or remove)
  const toggleReaction = useCallback(async (
    event: ActivityEvent,
    reactionType: ReactionContent,
    currentReactionId?: number
  ) => {
    if (!isAuthenticated) return;

    const [owner, repo] = event.repository.split('/');
    const issueNumber = event.metadata?.prNumber || event.metadata?.issueNumber;
    if (!owner || !repo || !issueNumber) return;

    const loadingKey = `${event.id}-${reactionType}`;
    setLoadingReactions((prev) => new Set(prev).add(loadingKey));

    // Optimistic update
    const viewerLogin = user?.login || '';
    setActivity((prev) => prev.map((e) => {
      if (e.id !== event.id || !e.metadata?.reactions) return e;

      const reactions = { ...e.metadata.reactions };
      const counts = { ...reactions.counts };
      const viewerReactions = { ...reactions.viewerReactions };
      const users = { ...reactions.users };

      if (currentReactionId) {
        // Remove reaction
        counts[reactionType] = Math.max(0, (counts[reactionType] || 1) - 1);
        if (counts[reactionType] === 0) delete counts[reactionType];
        delete viewerReactions[reactionType];
        // Remove viewer from users list
        if (users[reactionType] && viewerLogin) {
          users[reactionType] = users[reactionType]!.filter((u) => u !== viewerLogin);
          if (users[reactionType]!.length === 0) delete users[reactionType];
        }
      } else {
        // Add reaction
        counts[reactionType] = (counts[reactionType] || 0) + 1;
        viewerReactions[reactionType] = -1; // Temporary ID
        // Add viewer to users list
        if (viewerLogin) {
          users[reactionType] = [...(users[reactionType] || []), viewerLogin];
        }
      }

      return {
        ...e,
        metadata: {
          ...e.metadata,
          reactions: {
            ...reactions,
            totalCount: Object.values(counts).reduce((a, b) => a + (b || 0), 0),
            counts,
            viewerReactions,
            users,
          },
        },
      };
    }));

    try {
      if (currentReactionId) {
        // Delete reaction
        const response = await fetch(
          `/api/github/repo/${owner}/${repo}/issues/${issueNumber}/reactions?reactionId=${currentReactionId}`,
          { method: 'DELETE' }
        );
        if (!response.ok) {
          throw new Error('Failed to remove reaction');
        }
      } else {
        // Add reaction
        const response = await fetch(
          `/api/github/repo/${owner}/${repo}/issues/${issueNumber}/reactions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: reactionType }),
          }
        );
        if (!response.ok) {
          throw new Error('Failed to add reaction');
        }
        const data = await response.json();

        // Update with real reaction ID
        setActivity((prev) => prev.map((e) => {
          if (e.id !== event.id || !e.metadata?.reactions) return e;
          return {
            ...e,
            metadata: {
              ...e.metadata,
              reactions: {
                ...e.metadata.reactions,
                viewerReactions: {
                  ...e.metadata.reactions.viewerReactions,
                  [reactionType]: data.id,
                },
              },
            },
          };
        }));
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
      // Revert optimistic update on error
      setActivity((prev) => prev.map((e) => {
        if (e.id !== event.id || !e.metadata?.reactions) return e;

        const reactions = { ...e.metadata.reactions };
        const counts = { ...reactions.counts };
        const viewerReactions = { ...reactions.viewerReactions };
        const users = { ...reactions.users };

        if (currentReactionId) {
          // Revert removal
          counts[reactionType] = (counts[reactionType] || 0) + 1;
          viewerReactions[reactionType] = currentReactionId;
          // Re-add viewer to users list
          if (viewerLogin) {
            users[reactionType] = [...(users[reactionType] || []), viewerLogin];
          }
        } else {
          // Revert addition
          counts[reactionType] = Math.max(0, (counts[reactionType] || 1) - 1);
          if (counts[reactionType] === 0) delete counts[reactionType];
          delete viewerReactions[reactionType];
          // Remove viewer from users list
          if (users[reactionType] && viewerLogin) {
            users[reactionType] = users[reactionType]!.filter((u) => u !== viewerLogin);
            if (users[reactionType]!.length === 0) delete users[reactionType];
          }
        }

        return {
          ...e,
          metadata: {
            ...e.metadata,
            reactions: {
              ...reactions,
              totalCount: Object.values(counts).reduce((a, b) => a + (b || 0), 0),
              counts,
              viewerReactions,
              users,
            },
          },
        };
      }));
    } finally {
      setLoadingReactions((prev) => {
        const next = new Set(prev);
        next.delete(loadingKey);
        return next;
      });
    }
  }, [isAuthenticated]);

  // Listen for repo filter events
  useEffect(() => {
    const unsubscribe = events.on('activity:filter:repo', (event) => {
      const payload = event.payload as { repository: string | null };
      setSelectedRepo(payload?.repository ?? null);
    });

    return () => unsubscribe();
  }, [events]);

  // Scroll tracking for WeeklyTimelineHeader
  const todayDayOfWeek = new Date().getDay();
  const maxScrollIndex = todayDayOfWeek; // Can only scroll back to Sunday of this week

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const maxScroll = scrollHeight - clientHeight;
    const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
    setScrollProgress(progress);

    // Determine current day based on scroll position
    const containerTop = scrollRef.current.getBoundingClientRect().top;
    let currentDay = 0;

    sectionRefs.current.forEach((ref, day) => {
      const rect = ref.getBoundingClientRect();
      if (rect.top <= containerTop + 80) { // 80px offset for header
        currentDay = day;
      }
    });

    setCurrentDayIndex(currentDay);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToDay = useCallback((scrollIndex: number) => {
    const section = sectionRefs.current.get(scrollIndex);
    if (section && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const sectionTop = section.getBoundingClientRect().top;
      const offset = sectionTop - containerTop - 80;
      scrollRef.current.scrollBy({ top: offset, behavior: 'smooth' });
    }
  }, []);

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
  let filteredActivity = activity;
  if (selectedRepo) {
    filteredActivity = filteredActivity.filter((e) => e.repository === selectedRepo);
  }

  // Group events by scroll index (0 = today, 1 = yesterday, etc.)
  const now = new Date();
  const eventsByScrollIndex = new Map<number, ActivityEvent[]>();

  filteredActivity.forEach((event) => {
    const eventDate = new Date(event.timestamp);
    const dayDiff = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff >= 0 && dayDiff <= maxScrollIndex) {
      if (!eventsByScrollIndex.has(dayDiff)) {
        eventsByScrollIndex.set(dayDiff, []);
      }
      eventsByScrollIndex.get(dayDiff)!.push(event);
    }
  });

  const getDayLabel = (scrollIndex: number) => {
    if (scrollIndex === 0) return 'Today';
    if (scrollIndex === 1) return 'Yesterday';
    const date = new Date(now);
    date.setDate(date.getDate() - scrollIndex);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const numDaysToShow = maxScrollIndex + 1;

  // Empty state
  if (filteredActivity.length === 0) {
    return (
      <div
        className="h-full w-full flex flex-col overflow-hidden"
        style={{ background: theme.colors.background }}
      >
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
              No activity in the last 7 days
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
      {/* Weekly Timeline Header */}
      <WeeklyTimelineHeader
        events={filteredActivity}
        scrollProgress={scrollProgress}
        currentDayIndex={currentDayIndex}
        totalActivities={filteredActivity.length}
        onDayClick={scrollToDay}
      />

      {/* Header with selected repo chip */}
      {selectedRepo && (
        <div
          className="flex items-center gap-1 p-2 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          <button
            onClick={() => setSelectedRepo(null)}
            className="px-2 py-1 rounded"
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
        </div>
      )}

      {/* Timeline Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {Array.from({ length: numDaysToShow }, (_, scrollIndex) => {
          const dayEvents = eventsByScrollIndex.get(scrollIndex) || [];

          return (
            <div
              key={scrollIndex}
              ref={(el) => {
                if (el) sectionRefs.current.set(scrollIndex, el);
              }}
            >
              {/* Day section header - skip for Today since it's in the WeeklyTimelineHeader */}
              {scrollIndex > 0 && (
                <div
                  className="px-3 py-2"
                  style={{
                    fontSize: `${theme.fontSizes[1]}px`,
                    fontWeight: theme.fontWeights.medium,
                    fontFamily: theme.fonts.body,
                    background: theme.colors.surface,
                    color: theme.colors.textMuted,
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}
                >
                  {getDayLabel(scrollIndex)}
                </div>
              )}

              {/* Events for this day */}
              {dayEvents.map((event) => {
                const color = getEventColor(event.type, theme);
                const isEventSelected = selectedEventId === event.id;

                return (
                  <button
                    key={event.id}
                    className="w-full flex items-start gap-4 px-4 py-4 group text-left transition-all border-b cursor-pointer"
                    style={{
                      background: isEventSelected ? theme.colors.primary + '15' : 'transparent',
                      borderColor: theme.colors.border,
                    }}
                    onClick={() => {
                      setSelectedEventId(event.id);
                      setSelectedCommit(null); // Clear individual commit selection
                      events.emit({
                        type: 'activity:item:selected',
                        source: 'user-activity-panel',
                        timestamp: Date.now(),
                        payload: {
                          repository: event.repository,
                          type: event.type,
                          url: event.url,
                        },
                      });
                    }}
                    onMouseEnter={(e) => {
                      if (!isEventSelected) {
                        e.currentTarget.style.background = theme.colors.primary + '10';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isEventSelected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {/* Repo Owner Avatar */}
                    <img
                      src={`https://github.com/${event.repository.split('/')[0]}.png?size=64`}
                      alt={event.repository.split('/')[0]}
                      className={`flex-shrink-0 w-10 h-10 ${event.ownerType === 'Organization' ? 'rounded-lg' : 'rounded-full'}`}
                    />

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
                          {event.type === 'issue_opened' && event.metadata?.isClosed
                            ? 'Issue'
                            : getEventLabel(event.type)}
                        </span>
                        <span
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            fontFamily: theme.fonts.body,
                            color: theme.colors.textMuted,
                          }}
                        >
                          {event.type === 'commit' ? 'to ' : 'in '}
                          <span style={{ color }}>{event.repository.split('/')[1] || event.repository}</span>
                          {event.type === 'issue_opened' && event.metadata?.isClosed && (
                            <>
                              {' was '}
                              <span style={{ color: theme.colors.error }}>Closed</span>
                              {event.metadata.closedBy && (
                                <span> by @{event.metadata.closedBy}</span>
                              )}
                            </>
                          )}
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
                      {event.type === 'issue_opened' && event.title ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleIssueExpansion(event);
                          }}
                          className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left"
                          style={{
                            fontSize: `${theme.fontSizes[2]}px`,
                            fontFamily: theme.fonts.body,
                            color: theme.colors.text,
                          }}
                        >
                          {expandedIssues.has(event.id) ? (
                            <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.textMuted }} />
                          ) : (
                            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.textMuted }} />
                          )}
                          <span className="truncate" title={event.title}>{event.title}</span>
                        </button>
                      ) : event.type === 'pr_merged' && event.title ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePRExpansion(event);
                          }}
                          className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left"
                          style={{
                            fontSize: `${theme.fontSizes[2]}px`,
                            fontFamily: theme.fonts.body,
                            color: theme.colors.text,
                          }}
                        >
                          {expandedPRs.has(event.id) ? (
                            <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.textMuted }} />
                          ) : (
                            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.textMuted }} />
                          )}
                          <span className="truncate" title={event.title}>{event.title}</span>
                        </button>
                      ) : event.title ? (
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

                      {/* PR stats and reactions */}
                      {event.type === 'pr_merged' && event.metadata && (
                        <div
                          className="flex items-center gap-2 mt-1 flex-wrap"
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

                      {/* Reactions for PRs and issues */}
                      {(event.type === 'pr_merged' || event.type === 'pr_opened' || event.type === 'issue_opened') &&
                        event.metadata?.reactions && (
                          <ReactionBar
                            reactions={event.metadata.reactions}
                            theme={theme}
                            isAuthenticated={isAuthenticated}
                            onToggleReaction={(type, reactionId) => toggleReaction(event, type, reactionId)}
                            disabled={REACTION_ORDER.some((t) => loadingReactions.has(`${event.id}-${t}`))}
                          />
                        )}

                      {/* Expanded PR body */}
                      {event.type === 'pr_merged' && expandedPRs.has(event.id) && (
                        <div
                          className="mt-2 rounded-md overflow-hidden min-w-0"
                          style={{
                            border: `1px solid ${theme.colors.border}`,
                            background: theme.colors.surface,
                          }}
                        >
                          {loadingPRs.has(event.id) ? (
                            <div
                              className="flex items-center gap-2 p-3"
                              style={{ color: theme.colors.textMuted }}
                            >
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
                                Loading PR...
                              </span>
                            </div>
                          ) : prDetails[event.id]?.body ? (
                            <div className="max-h-[32rem] overflow-y-auto overflow-x-hidden">
                              <div className="p-3 min-w-0 break-words" style={{ wordBreak: 'break-word' }}>
                                <DocumentView
                                  content={prDetails[event.id]!.body!}
                                  theme={theme}
                                  maxWidth="100%"
                                  transparentBackground
                                />
                              </div>
                            </div>
                          ) : (
                            <div
                              className="p-3"
                              style={{
                                fontSize: `${theme.fontSizes[1]}px`,
                                fontFamily: theme.fonts.body,
                                color: theme.colors.textMuted,
                                fontStyle: 'italic',
                              }}
                            >
                              No description provided
                            </div>
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
                            commitDetails[event.id]!.map((commit) => {
                              const isSelected = selectedCommit === commit.sha;
                              return (
                                <button
                                  key={commit.sha}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCommit(commit.sha);
                                    setSelectedEventId(event.id); // Also mark parent event as selected
                                    // Emit event to select this commit for file-city visualization
                                    events.emit({
                                      type: 'git-panels.commit-detail:selected',
                                      source: 'user-activity-panel',
                                      timestamp: Date.now(),
                                      payload: {
                                        hash: commit.sha,
                                        repository: event.repository,
                                      },
                                    });
                                  }}
                                  className="flex items-start gap-2 py-1 px-2 rounded transition-all w-full text-left"
                                  style={{
                                    background: isSelected ? theme.colors.primary + '20' : 'transparent',
                                    border: isSelected ? `1px solid ${theme.colors.primary}` : '1px solid transparent',
                                  }}
                                >
                                  <code
                                    className="flex-shrink-0"
                                    style={{
                                      fontSize: `${theme.fontSizes[0]}px`,
                                      fontFamily: theme.fonts.monospace,
                                      color: isSelected ? theme.colors.primary : theme.colors.info,
                                    }}
                                  >
                                    {commit.sha}
                                  </code>
                                  <span
                                    className="truncate"
                                    style={{
                                      fontSize: `${theme.fontSizes[1]}px`,
                                      fontFamily: theme.fonts.body,
                                      color: isSelected ? theme.colors.primary : theme.colors.text,
                                    }}
                                    title={commit.message}
                                  >
                                    {commit.message}
                                  </span>
                                </button>
                              );
                            })
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

                      {/* Expanded issue body */}
                      {event.type === 'issue_opened' && expandedIssues.has(event.id) && (
                        <div
                          className="mt-2 rounded-md overflow-hidden min-w-0"
                          style={{
                            border: `1px solid ${theme.colors.border}`,
                            background: theme.colors.surface,
                          }}
                        >
                          {loadingIssues.has(event.id) ? (
                            <div
                              className="flex items-center gap-2 p-3"
                              style={{ color: theme.colors.textMuted }}
                            >
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
                                Loading issue...
                              </span>
                            </div>
                          ) : issueDetails[event.id]?.body ? (
                            <div className="max-h-[32rem] overflow-y-auto overflow-x-hidden">
                              <div className="p-3 min-w-0 break-words" style={{ wordBreak: 'break-word' }}>
                                <DocumentView
                                  content={issueDetails[event.id]!.body!}
                                  theme={theme}
                                  maxWidth="100%"
                                  transparentBackground
                                />
                              </div>
                            </div>
                          ) : (
                            <div
                              className="p-3"
                              style={{
                                fontSize: `${theme.fontSizes[1]}px`,
                                fontFamily: theme.fonts.body,
                                color: theme.colors.textMuted,
                                fontStyle: 'italic',
                              }}
                            >
                              No description provided
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
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
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
        {filteredActivity.length} activities in the last 7 days
      </div>
    </div>
  );
}
