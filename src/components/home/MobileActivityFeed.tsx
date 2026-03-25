'use client';

/**
 * MobileActivityFeed
 *
 * Vertical swipeable feed of repo cards for mobile.
 * Uses CSS snap scrolling for smooth swipe-up navigation.
 */

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { FolderGit2, Loader2 } from 'lucide-react';
import type { RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { MobileRepoCard } from './MobileRepoCard';

interface MobileActivityFeedProps {
  summaries: RepoActivitySummary[];
  loading?: boolean;
  error?: string | null;
}

export const MobileActivityFeed: React.FC<MobileActivityFeedProps> = ({
  summaries,
  loading = false,
  error = null,
}) => {
  const { theme } = useTheme();

  const spacing = {
    md: 16,
    lg: 24,
  };

  if (loading && summaries.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: theme.colors.textMuted,
          gap: spacing.md,
        }}
      >
        <Loader2
          size={32}
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: theme.fontSizes[1] }}>Loading activity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: spacing.lg,
          color: theme.colors.error,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: theme.fontSizes[2] }}>{error}</span>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: spacing.lg,
          color: theme.colors.textMuted,
          textAlign: 'center',
        }}
      >
        <FolderGit2 size={48} style={{ marginBottom: spacing.md, opacity: 0.5 }} />
        <p style={{ margin: 0, fontSize: theme.fontSizes[2] }}>No recent activity</p>
        <p style={{ margin: `${spacing.md}px 0 0`, fontSize: theme.fontSizes[1] }}>
          Commits from featured repositories will appear here
        </p>
      </div>
    );
  }

  return (
    <div
      className="mobile-feed-scroll"
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollSnapType: 'y mandatory',
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <style>{`
        .mobile-feed-scroll::-webkit-scrollbar { display: none; }
        .mobile-feed-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      {summaries.slice(0, 2).map((summary) => (
        <div
          key={summary.fullName}
          style={{
            height: '100%',
            minHeight: '100%',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
        >
          <MobileRepoCard summary={summary} />
        </div>
      ))}

      {/* Indicator dots */}
      <div
        style={{
          position: 'fixed',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 4,
          zIndex: 10,
        }}
      >
        {summaries.slice(0, 10).map((summary) => (
          <div
            key={summary.fullName}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: theme.colors.primary,
              opacity: 0.4,
            }}
            title={summary.fullName}
          />
        ))}
        {summaries.length > 10 && (
          <div
            style={{
              fontSize: 8,
              color: theme.colors.textMuted,
              textAlign: 'center',
            }}
          >
            +{summaries.length - 10}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileActivityFeed;
