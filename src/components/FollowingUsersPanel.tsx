'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import Link from 'next/link';
import type { PanelContextValue, PanelActions, PanelEventEmitter } from '@principal-ade/panel-framework-core';
import { Users, Loader2, ExternalLink } from 'lucide-react';

export interface FollowingUsersPanelProps {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
  username?: string;
}

interface FollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
}

export function FollowingUsersPanel({ context: _context, actions: _actions, events: _events, username }: FollowingUsersPanelProps) {
  const { theme } = useTheme();
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setFollowing(data.following || []);
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
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 border-b"
        style={{ borderColor: theme.colors.border }}
      >
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
          className="ml-auto px-1.5 py-0.5 rounded"
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
          <div className="p-2 space-y-1">
            {following.map((user) => (
              <Link
                key={user.login}
                href={`/activity/${user.login}`}
                className="flex items-center gap-3 p-2 rounded transition-colors hover:opacity-80"
                style={{
                  background: 'transparent',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.colors.surface;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <img
                  src={user.avatarUrl}
                  alt={user.login}
                  className="w-8 h-8 rounded-full flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{
                      fontSize: `${theme.fontSizes[2]}px`,
                      fontWeight: theme.fontWeights.medium,
                      fontFamily: theme.fonts.body,
                      color: theme.colors.text,
                    }}
                  >
                    {user.name || user.login}
                  </div>
                  <div
                    className="truncate"
                    style={{
                      fontSize: `${theme.fontSizes[1]}px`,
                      fontFamily: theme.fonts.body,
                      color: theme.colors.textMuted,
                    }}
                  >
                    @{user.login}
                  </div>
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
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
