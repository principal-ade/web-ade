'use client';

/**
 * RepoHeader
 *
 * Repository header component with GitHub-style activity heatmap banner,
 * owner avatar, and repository stats. Modeled after RepositoryProfilePanel.
 */

import React, { useMemo, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

interface RepoHeaderProps {
  repo: {
    name: string;
    full_name: string;
    owner: {
      login: string;
      avatar_url: string;
      type?: 'User' | 'Organization';
    };
    description: string | null;
    created_at: string | null;
    language?: string | null;
  };
  activityData: Map<string, number>;
  totalCommits: number;
  onBackClick: () => void;
}

/**
 * Format number with k/m suffix
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(num);
}

/**
 * Calculate repository age in human-readable format
 */
function getRepositoryAge(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''}`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears !== 1 ? 's' : ''}`;
}

/**
 * Activity Heatmap Banner Component
 */
const ActivityHeatmap: React.FC<{
  activityData: Map<string, number>;
  theme: ReturnType<typeof useTheme>['theme'];
  bannerHeight?: number;
}> = ({ activityData, theme, bannerHeight = 160 }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const squareSize = useMemo(() => {
    const verticalPadding = 8;
    const gap = 3;
    const availableHeight = bannerHeight - verticalPadding;
    const totalGaps = 6 * gap;
    return Math.floor((availableHeight - totalGaps) / 7);
  }, [bannerHeight]);

  // Scroll to the right to show recent activity
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
  }, [activityData]);

  const weeks = useMemo(() => {
    const today = new Date();
    const daysToShow = 365;
    const days: Array<{ date: string; count: number; dayOfWeek: number; dateObj: Date; monthLabel?: string }> = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      if (!dateKey) continue;

      const count = activityData.get(dateKey) || 0;

      const monthLabel = date.getDate() === 1
        ? ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][date.getMonth()]
        : undefined;

      days.push({ date: dateKey, count, dayOfWeek: date.getDay(), dateObj: date, monthLabel });
    }

    const weekGroups: Array<Array<{ date: string; count: number; dayOfWeek: number; dateObj: Date; monthLabel?: string }>> = [];
    let currentWeek: Array<{ date: string; count: number; dayOfWeek: number; dateObj: Date; monthLabel?: string }> = [];

    days.forEach((day) => {
      if (day.dayOfWeek === 0 && currentWeek.length > 0) {
        weekGroups.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });

    if (currentWeek.length > 0) {
      weekGroups.push(currentWeek);
    }

    return weekGroups;
  }, [activityData]);

  const maxCount = useMemo(() => {
    let max = 0;
    activityData.forEach((count) => {
      if (count > max) max = count;
    });
    return max || 1;
  }, [activityData]);

  const getColor = (count: number): string => {
    if (count === 0) return `${theme.colors.border}30`;
    const intensity = Math.min(count / maxCount, 1);
    const alpha = Math.floor(20 + intensity * 80);
    return `${theme.colors.primary}${alpha.toString(16).padStart(2, '0')}`;
  };

  const gap = 3;
  const borderRadius = Math.max(2, Math.floor(squareSize * 0.2));

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        gap,
        padding: '0 16px 8px 16px',
        width: '100%',
        height: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        alignItems: 'center',
      }}
    >
      {weeks.map((week, weekIndex) => (
        <div key={week[0]?.date ?? `week-${weekIndex}`} style={{ display: 'flex', flexDirection: 'column', gap, flexShrink: 0 }}>
          {week.map((day) => (
            <div
              key={day.date}
              style={{
                width: squareSize,
                height: squareSize,
                borderRadius,
                backgroundColor: getColor(day.count),
                transition: 'all 0.2s ease',
                flexShrink: 0,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={`${day.date}: ${day.count} commits`}
            >
              {day.monthLabel && (
                <span
                  style={{
                    fontSize: Math.max(8, Math.floor(squareSize * 0.6)),
                    fontFamily: theme.fonts?.body,
                    fontWeight: theme.fontWeights?.bold || 700,
                    color: theme.colors.background,
                    textShadow: `0 0 2px ${theme.colors.text}`,
                    pointerEvents: 'none',
                  }}
                >
                  {day.monthLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const RepoHeader: React.FC<RepoHeaderProps> = ({
  repo,
  activityData,
  totalCommits,
  onBackClick,
}) => {
  const { theme } = useTheme();

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background,
        marginBottom: spacing.md,
      }}
    >
      {/* Banner with Activity Heatmap */}
      <div
        style={{
          position: 'relative',
          height: 160,
          overflow: 'hidden',
        }}
      >
        <ActivityHeatmap
          activityData={activityData}
          theme={theme}
          bannerHeight={160}
        />
      </div>

      {/* Profile Content */}
      <div style={{ padding: `0 ${spacing.md}px`, marginTop: -60, position: 'relative' }}>
        {/* Avatar and Stats Section */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md }}>
          {/* Owner Avatar */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: repo.owner.type === 'Organization' ? '12px' : '50%',
              backgroundColor: theme.colors.surface,
              border: `4px solid ${theme.colors.background}`,
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={repo.owner.avatar_url}
              alt={repo.owner.login}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          {/* Stats and Back Button */}
          <div style={{ flex: 1, paddingBottom: spacing.xs, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {/* Stats */}
            <div style={{ display: 'flex', gap: spacing.lg, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: theme.fontSizes[3],
                  fontWeight: theme.fontWeights?.semibold ?? 600,
                  fontFamily: theme.fonts?.body,
                  color: theme.colors.text
                }}>
                  {formatNumber(totalCommits)}
                </div>
                <div style={{
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts?.body,
                  color: theme.colors.textMuted
                }}>
                  commits
                </div>
              </div>
              {repo.created_at !== null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: theme.fontSizes[3],
                    fontWeight: theme.fontWeights?.semibold ?? 600,
                    fontFamily: theme.fonts?.body,
                    color: theme.colors.text
                  }}>
                    {getRepositoryAge(repo.created_at)}
                  </div>
                  <div style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts?.body,
                    color: theme.colors.textMuted
                  }}>
                    old
                  </div>
                </div>
              )}
            </div>

            {/* Back Button */}
            <button
              onClick={onBackClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 4,
                color: theme.colors.textMuted,
                cursor: 'pointer',
                fontSize: theme.fontSizes[1],
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.colors.surface;
                e.currentTarget.style.color = theme.colors.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = theme.colors.textMuted;
              }}
            >
              ← Back to feed
            </button>
          </div>
        </div>

        {/* Repository Name */}
        <div style={{ marginBottom: spacing.sm }}>
          <a
            href={`https://github.com/${repo.full_name}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: theme.fontSizes[4],
                fontWeight: theme.fontWeights?.semibold ?? 600,
                fontFamily: theme.fonts?.heading ?? theme.fonts?.body,
                color: theme.colors.text,
                cursor: 'pointer',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.colors.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.colors.text;
              }}
            >
              {repo.name}
            </h2>
          </a>
          <div
            style={{
              fontSize: theme.fontSizes[1],
              fontFamily: theme.fonts?.body,
              color: theme.colors.textMuted,
              marginTop: spacing.xs,
            }}
          >
            {repo.owner.login}
          </div>
        </div>

        {/* Description */}
        {repo.description && (
          <p
            style={{
              margin: `0 0 ${spacing.md}px`,
              fontSize: theme.fontSizes[1],
              fontFamily: theme.fonts?.body,
              lineHeight: 1.5,
              color: theme.colors.text,
            }}
          >
            {repo.description}
          </p>
        )}
      </div>
    </div>
  );
};
