'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { PanelContextValue, PanelActions, PanelEventEmitter } from '@principal-ade/panel-framework-core';
import { Users, Loader2, ExternalLink } from 'lucide-react';

export interface FollowingUsersPanelProps {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
  username?: string;
  viewedUser?: string;
}

interface DailyContribution {
  date: string;
  count: number;
}

interface FollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  followersCount?: number;
}

// Activity graph component showing 7 days of contributions as squares
function ActivityGraph({ contributions, theme }: { contributions: DailyContribution[]; theme: ReturnType<typeof useTheme>['theme'] }) {
  // Find max contribution count to normalize colors
  const maxCount = Math.max(...contributions.map(c => c.count), 1);

  // Get style based on contribution count (GitHub-style intensity)
  const getStyle = (count: number): React.CSSProperties => {
    if (count === 0) {
      return {
        background: 'transparent',
        border: `1px solid ${theme.colors.border}`,
      };
    }
    const intensity = Math.min(count / maxCount, 1);
    let bg = theme.colors.success;
    if (intensity < 0.25) bg = theme.colors.success + '40';
    else if (intensity < 0.5) bg = theme.colors.success + '70';
    else if (intensity < 0.75) bg = theme.colors.success + 'A0';
    return { background: bg };
  };

  return (
    <div className="flex gap-1 mt-1">
      {contributions.map((day) => (
        <div
          key={day.date}
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            ...getStyle(day.count),
          }}
          title={`${day.date}: ${day.count} contribution${day.count !== 1 ? 's' : ''}`}
        />
      ))}
    </div>
  );
}

// Generate placeholder contributions for 7 days (all zeros)
function getPlaceholderContributions(): DailyContribution[] {
  const days: DailyContribution[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().slice(0, 10),
      count: 0,
    });
  }
  return days;
}

// Component that fetches and displays contributions for a single user
function UserContributions({ login, theme }: { login: string; theme: ReturnType<typeof useTheme>['theme'] }) {
  const [contributions, setContributions] = useState<DailyContribution[]>(getPlaceholderContributions);

  useEffect(() => {
    let cancelled = false;

    const fetchContributions = async () => {
      try {
        const response = await fetch(`/api/github/user/${login}/activity`);
        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled && data.contributions && data.contributions.length > 0) {
          setContributions(data.contributions);
        }
      } catch {
        // Silently fail - contributions are optional, placeholder stays
      }
    };

    fetchContributions();

    return () => {
      cancelled = true;
    };
  }, [login]);

  return <ActivityGraph contributions={contributions} theme={theme} />;
}

export function FollowingUsersPanel({ context: _context, actions: _actions, events, username, viewedUser }: FollowingUsersPanelProps) {
  const { theme } = useTheme();
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selfInfo, setSelfInfo] = useState<{ login: string; name: string | null; avatarUrl: string; followersCount?: number } | null>(null);

  // Fetch current user's info for the "You" entry
  useEffect(() => {
    if (!username) return;

    const fetchSelfInfo = async () => {
      try {
        const response = await fetch(`/api/github/user/${username}/activity`);
        if (response.ok) {
          const data = await response.json();
          setSelfInfo({
            login: data.user.login,
            name: data.user.name,
            avatarUrl: data.user.avatarUrl,
            followersCount: data.user.followersCount,
          });
        }
      } catch {
        // Silently fail - we can still show username
        setSelfInfo({ login: username, name: null, avatarUrl: `https://github.com/${username}.png?size=64` });
      }
    };

    fetchSelfInfo();
  }, [username]);

  useEffect(() => {
    if (!username) {
      setLoading(false);
      return;
    }

    const fetchFollowing = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/github/user/${username}/following`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to fetch following: ${response.status}`);
        }

        const data = await response.json();
        // Sort alphabetically by name (fall back to login if no name)
        const sorted = (data.following || []).sort((a: FollowingUser, b: FollowingUser) => {
          const nameA = (a.name || a.login).toLowerCase();
          const nameB = (b.name || b.login).toLowerCase();
          return nameA.localeCompare(nameB);
        });
        setFollowing(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch following');
      } finally {
        setLoading(false);
      }
    };

    fetchFollowing();
  }, [username]);

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
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
            No user selected
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
            {error}
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
      {/* Current user (You) at the top */}
      {selfInfo && (
        <div className="flex justify-end p-2 border-b" style={{ borderColor: theme.colors.border }}>
          <button
            onClick={() => {
              events.emit({
                type: 'activity:view:user',
                source: 'following-users-panel',
                timestamp: Date.now(),
                payload: { username: selfInfo.login },
              });
            }}
            className="w-full lg:max-w-[300px] flex items-center gap-3 p-2 rounded transition-colors hover:opacity-80 text-left"
            style={{
              background: viewedUser === selfInfo.login ? theme.colors.surface : 'transparent',
              border: viewedUser === selfInfo.login ? `1px solid ${theme.colors.border}` : '1px solid transparent',
            }}
          >
            <img
              src={selfInfo.avatarUrl}
              alt={selfInfo.login}
              className="w-8 h-8 rounded-full flex-shrink-0"
              style={{
                boxShadow: viewedUser === selfInfo.login ? `0 0 0 2px ${theme.colors.primary}` : 'none',
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="truncate"
                  style={{
                    fontSize: `${theme.fontSizes[2]}px`,
                    fontWeight: theme.fontWeights.medium,
                    fontFamily: theme.fonts.body,
                    color: viewedUser === selfInfo.login ? theme.colors.primary : theme.colors.text,
                  }}
                >
                  {selfInfo.name || selfInfo.login}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{
                    background: theme.colors.primary + '20',
                    color: theme.colors.primary,
                    fontFamily: theme.fonts.body,
                  }}
                >
                  You
                </span>
              </div>
              {selfInfo.name && (
                <div
                  className="flex items-center gap-2"
                  style={{
                    fontSize: `${theme.fontSizes[1]}px`,
                    fontFamily: theme.fonts.body,
                    color: theme.colors.textMuted,
                  }}
                >
                  <span className="truncate">@{selfInfo.login}</span>
                  {selfInfo.followersCount !== undefined && (
                    <span
                      className="flex-shrink-0"
                      title={`${selfInfo.followersCount.toLocaleString()} followers`}
                    >
                      · {selfInfo.followersCount.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>
            <UserContributions login={selfInfo.login} theme={theme} />
          </button>
        </div>
      )}

      {/* Header */}
      <div
        className="flex justify-end p-2 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        <div className="w-full lg:max-w-[300px] flex items-center gap-2 p-1">
          <Users className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
          <span
            style={{
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.medium,
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
            }}
          >
            Following
          </span>
          <span
            className="px-1.5 py-0.5 rounded"
            style={{
              fontSize: `${theme.fontSizes[0]}px`,
              fontFamily: theme.fonts.body,
              background: theme.colors.surface,
              color: theme.colors.textMuted,
            }}
          >
            {following.length}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {following.length === 0 ? (
          <div
            className="flex items-center justify-center h-full p-4"
            style={{ color: theme.colors.textMuted }}
          >
            <div className="text-center">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p style={{ fontSize: `${theme.fontSizes[1]}px`, fontFamily: theme.fonts.body }}>
                Not following anyone
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1 flex flex-col items-end">
            {following.map((user) => {
              const isViewing = viewedUser === user.login;
              return (
                <button
                  key={user.login}
                  onClick={() => {
                    events.emit({
                      type: 'activity:view:user',
                      source: 'following-users-panel',
                      timestamp: Date.now(),
                      payload: { username: user.login },
                    });
                  }}
                  className="w-full lg:max-w-[300px] flex items-center gap-3 p-2 rounded transition-colors hover:opacity-80 text-left"
                  style={{
                    background: isViewing ? theme.colors.surface : 'transparent',
                    border: isViewing ? `1px solid ${theme.colors.border}` : '1px solid transparent',
                  }}
                >
                  <img
                    src={user.avatarUrl}
                    alt={user.login}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                    style={{
                      boxShadow: isViewing ? `0 0 0 2px ${theme.colors.primary}` : 'none',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{
                        fontSize: `${theme.fontSizes[2]}px`,
                        fontWeight: theme.fontWeights.medium,
                        fontFamily: theme.fonts.body,
                        color: isViewing ? theme.colors.primary : theme.colors.text,
                      }}
                    >
                      {user.name || user.login}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        fontSize: `${theme.fontSizes[1]}px`,
                        fontFamily: theme.fonts.body,
                        color: theme.colors.textMuted,
                      }}
                    >
                      <span className="truncate">@{user.login}</span>
                      {user.followersCount !== undefined && (
                        <span
                          className="flex-shrink-0"
                          title={`${user.followersCount.toLocaleString()} followers`}
                        >
                          · {user.followersCount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <UserContributions login={user.login} theme={theme} />
                  </div>
                  <a
                    href={`https://github.com/${user.login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1 rounded opacity-0 hover:opacity-100 transition-opacity"
                    style={{ color: theme.colors.textMuted }}
                    title="Open in GitHub"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
