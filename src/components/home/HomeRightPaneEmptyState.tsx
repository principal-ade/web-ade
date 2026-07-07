'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { ActivityHeatmap } from '../ActivityHeatmap';

export interface ContributedRepo {
  nameWithOwner: string;
  owner: string;
  name: string;
  url: string;
  commitCount: number;
  lastContributedAt: string;
  isPrivate: boolean;
  ownerType: 'User' | 'Organization';
  ownerAvatarUrl?: string;
}

export interface ActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened' | 'issue_opened';
  timestamp: string;
  repository: string;
  repositoryUrl?: string;
  ownerType?: 'User' | 'Organization';
  isPrivate?: boolean;
  title?: string;
  url?: string;
  metadata?: {
    commitCount?: number;
    additions?: number;
    deletions?: number;
    prNumber?: number;
    issueNumber?: number;
    isClosed?: boolean;
    closedBy?: string;
  };
}

type ActivityTab = 'all' | 'commits' | 'prs' | 'issues';

export interface HomeRightPaneEmptyStateProps {
  /** Map of date string (YYYY-MM-DD) to commit count for the activity heatmap */
  activityData: Map<string, number>;
  /** List of repositories the user has recently contributed to */
  contributedRepos: ContributedRepo[];
  /** List of recent activity events */
  activityEvents: ActivityEvent[];
}

/**
 * Empty state for the home page right pane showing:
 * 1. Activity heatmap across the top (365 days of contributions)
 * 2. Tabbed view of recent activity (all, commits, PRs, issues)
 */
export const HomeRightPaneEmptyState: React.FC<HomeRightPaneEmptyStateProps> = ({
  activityData,
  activityEvents,
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');
  const [filterPrivate, setFilterPrivate] = useState(false);

  const filteredEvents = activityEvents.filter((event) => {
    const typeMatch =
      activeTab === 'all' ||
      (activeTab === 'commits' && event.type === 'commit') ||
      (activeTab === 'prs' && (event.type === 'pr_merged' || event.type === 'pr_opened')) ||
      (activeTab === 'issues' && event.type === 'issue_opened');

    if (!typeMatch) return false;
    return event.isPrivate === filterPrivate;
  });

  const counts = {
    all: activityEvents.filter((e) => e.isPrivate === filterPrivate).length,
    commits: activityEvents.filter((e) => e.type === 'commit' && e.isPrivate === filterPrivate).length,
    prs: activityEvents.filter((e) => (e.type === 'pr_merged' || e.type === 'pr_opened') && e.isPrivate === filterPrivate).length,
    issues: activityEvents.filter((e) => e.type === 'issue_opened' && e.isPrivate === filterPrivate).length,
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      style={{ background: theme.colors.backgroundSecondary }}
    >
      {/* Activity Heatmap Section */}
      <div
        style={{
          borderBottom: `1px solid ${theme.colors.border}`,
          paddingTop: 12,
          paddingBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 16,
            paddingRight: 16,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[1],
              fontWeight: 600,
            }}
          >
            Your activity
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <HeaderToggleButton
              label="Public"
              active={!filterPrivate}
              onClick={() => setFilterPrivate(false)}
            />
            <HeaderToggleButton
              label="Private"
              active={filterPrivate}
              onClick={() => setFilterPrivate(true)}
            />
          </div>
        </div>
        <ActivityHeatmap activityData={activityData} bannerHeight={170} />
      </div>

      {/* Tabs Section */}
      <div
        style={{
          borderBottom: `1px solid ${theme.colors.border}`,
          padding: '12px 16px 0',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <TabButton
            label="All"
            count={counts.all}
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
          />
          <TabButton
            label="Commits"
            count={counts.commits}
            active={activeTab === 'commits'}
            onClick={() => setActiveTab('commits')}
          />
          <TabButton
            label="PRs"
            count={counts.prs}
            active={activeTab === 'prs'}
            onClick={() => setActiveTab('prs')}
          />
          <TabButton
            label="Issues"
            count={counts.issues}
            active={activeTab === 'issues'}
            onClick={() => setActiveTab('issues')}
          />
        </div>
      </div>

      {/* Activity List Section */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          padding: 16,
        }}
      >
        {filteredEvents.length === 0 ? (
          <div
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[1],
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            No recent activity found
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {filteredEvents.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface TabButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, count, active, onClick }) => {
  const { theme } = useTheme();

  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: '6px 6px 0 0',
        border: 'none',
        background: active ? theme.colors.background : 'transparent',
        color: active ? theme.colors.text : theme.colors.textMuted,
        fontSize: theme.fontSizes[1],
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = `${theme.colors.background}80`;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontSize: theme.fontSizes[0],
          opacity: 0.7,
        }}
      >
        {count}
      </span>
    </button>
  );
};

interface HeaderToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const HeaderToggleButton: React.FC<HeaderToggleButtonProps> = ({ label, active, onClick }) => {
  const { theme } = useTheme();

  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        borderRadius: 4,
        border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
        background: active ? theme.colors.primary : 'transparent',
        color: active ? '#fff' : theme.colors.textMuted,
        fontSize: theme.fontSizes[0],
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = theme.colors.textMuted;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = theme.colors.border;
        }
      }}
    >
      {label}
    </button>
  );
};

interface ActivityItemProps {
  event: ActivityEvent;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ event }) => {
  const { theme } = useTheme();
  const formattedDate = formatRelativeDate(event.timestamp);
  const owner = event.repository.split('/')[0] || '';
  const repo = event.repository.split('/')[1] || '';
  const avatarUrl = `https://github.com/${owner}.png`;

  // Determine event type label and icon
  let typeLabel = '';
  let typeColor = theme.colors.textMuted;
  
  if (event.type === 'commit') {
    typeLabel = event.metadata?.commitCount === 1 ? '1 commit' : `${event.metadata?.commitCount || 1} commits`;
    typeColor = theme.colors.primary;
  } else if (event.type === 'pr_merged') {
    typeLabel = 'Merged PR';
    typeColor = '#8957e5'; // Purple for merged
  } else if (event.type === 'pr_opened') {
    typeLabel = 'Opened PR';
    typeColor = '#3fb950'; // Green for open
  } else if (event.type === 'issue_opened') {
    typeLabel = 'Opened issue';
    typeColor = '#3fb950';
  }

  return (
    <Link
      href={`/${owner}/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        borderRadius: 6,
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.background,
        textDecoration: 'none',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
        e.currentTarget.style.background = theme.colors.backgroundSecondary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
        e.currentTarget.style.background = theme.colors.background;
      }}
    >
      {/* Owner Avatar */}
      <img
        src={avatarUrl}
        alt={`${owner} avatar`}
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          flexShrink: 0,
          objectFit: 'cover',
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flex: 1,
          minWidth: 0,
        }}
      >
        {/* Title or repo name */}
        <div
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSizes[2],
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.title || event.repository}
        </div>

        {/* Metadata row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: theme.fontSizes[1],
          }}
        >
          <span style={{ color: typeColor, fontWeight: 500 }}>
            {typeLabel}
          </span>
          {event.title && (
            <>
              <span style={{ color: theme.colors.textMuted }}>•</span>
              <span style={{ color: theme.colors.textMuted }}>
                {event.repository}
              </span>
            </>
          )}
          <span style={{ color: theme.colors.textMuted }}>•</span>
          <span style={{ color: theme.colors.textMuted }}>{formattedDate}</span>
          {event.isPrivate && (
            <>
              <span style={{ color: theme.colors.textMuted }}>•</span>
              <span
                style={{
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textMuted,
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                Private
              </span>
            </>
          )}
        </div>

        {/* Additional metadata for PRs */}
        {(event.type === 'pr_merged' || event.type === 'pr_opened') && event.metadata && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
            }}
          >
            {event.metadata.additions !== undefined && (
              <span style={{ color: '#3fb950' }}>+{event.metadata.additions}</span>
            )}
            {event.metadata.deletions !== undefined && (
              <span style={{ color: '#f85149' }}>-{event.metadata.deletions}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}
