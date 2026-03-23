'use client';

/**
 * ActivityFeedPanel
 *
 * Displays an aggregated activity feed showing repository cards
 * sorted by recent activity. Each card combines the File City visualization
 * with commit summaries for a repo-centric view.
 */

import React, { useState, useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { FolderGit2, Check } from 'lucide-react';
import { useGitHubActivityFeed, type RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { FEATURED_REPOS } from '@/lib/featured-repos';
import { RepoActivityCard } from './RepoActivityCard';

export interface ActivityFeedPanelProps {
  className?: string;
}

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({
  className,
}) => {
  const { theme } = useTheme();
  const { repoSummaries, loading, error } = useGitHubActivityFeed(FEATURED_REPOS, 10);

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // State for expanded cards
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());

  // Check if we're within last 24 hours scope
  const { recentRepos, olderRepos } = useMemo(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recent = repoSummaries.filter(
      (s) => s.latestCommitAt >= twentyFourHoursAgo
    );
    const older = repoSummaries.filter(
      (s) => s.latestCommitAt < twentyFourHoursAgo
    );
    return { recentRepos: recent, olderRepos: older };
  }, [repoSummaries]);

  const totalRecentCommits = recentRepos.reduce((sum, r) => sum + r.commitCount, 0);

  // Toggle card expansion
  const toggleExpanded = (fullName: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return next;
    });
  };

  // Handle opening repo (navigate to repo page)
  const handleRepoOpen = (summary: RepoActivitySummary) => {
    window.location.href = `/${summary.owner}/${summary.repo}`;
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: theme.colors.background,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: spacing.md,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <h3
            style={{
              margin: 0,
              fontSize: theme.fontSizes[3],
              fontWeight: 600,
              color: theme.colors.text,
            }}
          >
            Activity Feed
          </h3>
          {loading && (
            <span
              style={{
                fontSize: theme.fontSizes[1],
                color: theme.colors.textMuted,
              }}
            >
              Loading...
            </span>
          )}
        </div>

        {/* Status indicator */}
        {!loading && repoSummaries.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              fontSize: theme.fontSizes[1],
              color: recentRepos.length === 0 ? theme.colors.success : theme.colors.textMuted,
            }}
          >
            {recentRepos.length === 0 ? (
              <>
                <Check size={14} />
                <span>All caught up</span>
              </>
            ) : (
              <span>
                {recentRepos.length} repo{recentRepos.length !== 1 ? 's' : ''} active today
                {totalRecentCommits > 0 && ` · ${totalRecentCommits} commit${totalRecentCommits !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: spacing.md,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          {error && (
            <div
              style={{
                padding: spacing.md,
                backgroundColor: `${theme.colors.error}20`,
                borderRadius: 8,
                color: theme.colors.error,
                marginBottom: spacing.md,
              }}
            >
              {error}
            </div>
          )}

          {repoSummaries.length === 0 && !loading ? (
            // Empty state
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: 400,
                color: theme.colors.textMuted,
                textAlign: 'center',
              }}
            >
              <FolderGit2 size={48} style={{ marginBottom: spacing.md, opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: theme.fontSizes[2] }}>No recent activity</p>
              <p style={{ margin: `${spacing.xs}px 0 0`, fontSize: theme.fontSizes[1] }}>
                Commits from featured repositories will appear here
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {/* Recent repos (last 24h) */}
              {recentRepos.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: theme.fontSizes[1],
                      fontWeight: 600,
                      color: theme.colors.textMuted,
                      marginBottom: spacing.sm,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Last 24 Hours
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {recentRepos.map((summary) => (
                      <RepoActivityCard
                        key={summary.fullName}
                        summary={summary}
                        isExpanded={expandedRepos.has(summary.fullName)}
                        onToggleExpand={() => toggleExpanded(summary.fullName)}
                        onOpen={() => handleRepoOpen(summary)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Older repos */}
              {olderRepos.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: theme.fontSizes[1],
                      fontWeight: 600,
                      color: theme.colors.textMuted,
                      marginBottom: spacing.sm,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Earlier
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {olderRepos.map((summary) => (
                      <RepoActivityCard
                        key={summary.fullName}
                        summary={summary}
                        isExpanded={expandedRepos.has(summary.fullName)}
                        onToggleExpand={() => toggleExpanded(summary.fullName)}
                        onOpen={() => handleRepoOpen(summary)}
                        dimmed
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
