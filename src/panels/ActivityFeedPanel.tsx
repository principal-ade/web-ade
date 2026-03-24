'use client';

/**
 * ActivityFeedPanel
 *
 * Displays an aggregated activity feed showing repository cards
 * sorted by recent activity. Features a 3-column layout:
 * - Left: Search repositories
 * - Center: Activity feed cards
 * - Right: Hourly activity heatmap
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { FolderGit2, Search, X, Loader2 } from 'lucide-react';
import { useGitHubActivityFeed, type RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { FEATURED_REPOS } from '@/lib/featured-repos';
import { RepoActivityCard } from './RepoActivityCard';
import { HourlyActivityHeatmap, type CommitTimestamp } from '@/components/HourlyActivityHeatmap';

interface GitHubSearchRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
}

function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const urlPatterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i,
    /^github\.com\/([^/]+)\/([^/]+)/i,
  ];
  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1] && match[2]) {
      const repo = match[2].replace(/\.git$/, '').split(/[?#]/)[0];
      return { owner: match[1], repo: repo || '' };
    }
  }
  const repoPathMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (repoPathMatch && repoPathMatch[1] && repoPathMatch[2]) {
    return { owner: repoPathMatch[1], repo: repoPathMatch[2] };
  }
  return null;
}

export interface ActivityFeedPanelProps {
  className?: string;
}

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({
  className,
}) => {
  const { theme } = useTheme();
  const { repoSummaries, loading, error, addRepo } = useGitHubActivityFeed(FEATURED_REPOS, 10);

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // State for expanded cards
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GitHubSearchRepo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Selected repo from search (replaces feed with single repo)
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchRepo | null>(null);
  const [selectedRepoLoading, setSelectedRepoLoading] = useState(false);

  // Time filter from heatmap
  const [timeFilter, setTimeFilter] = useState<{ start: Date; end: Date } | null>(null);

  // Debounced GitHub search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const parsed = parseGitHubUrl(searchQuery);
      if (parsed && parsed.repo) {
        // Direct repo lookup
        try {
          const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
          if (response.ok) {
            const data = await response.json();
            setSearchResults([data]);
          } else {
            setSearchResults([]);
          }
        } catch {
          setSearchResults([]);
        }
      } else {
        // Search API
        try {
          const response = await fetch(`/api/github/search?q=${encodeURIComponent(searchQuery)}&per_page=10`);
          if (response.ok) {
            const data = await response.json();
            setSearchResults(data.items || []);
          } else {
            setSearchResults([]);
          }
        } catch {
          setSearchResults([]);
        }
      }
      setSearchLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle selecting a repo from search results
  const handleSelectRepo = useCallback(async (repo: GitHubSearchRepo) => {
    setSelectedRepo(repo);
    setSelectedRepoLoading(true);
    setSearchQuery('');
    setSearchResults([]);
    // Fetch activity for this repo
    await addRepo(repo.owner.login, repo.name);
    setSelectedRepoLoading(false);
  }, [addRepo]);

  // Clear selected repo to go back to featured repos
  const clearSelectedRepo = useCallback(() => {
    setSelectedRepo(null);
  }, []);

  // Get summaries to display (either selected repo or all featured)
  const displaySummaries = useMemo(() => {
    if (selectedRepo) {
      // Show only the selected repo
      return repoSummaries.filter(
        (s) => s.fullName.toLowerCase() === selectedRepo.full_name.toLowerCase()
      );
    }
    return repoSummaries;
  }, [repoSummaries, selectedRepo]);

  // Filter repos by time (from heatmap click)
  const timeFilteredSummaries = useMemo(() => {
    if (!timeFilter) return displaySummaries;

    return displaySummaries.filter((summary) =>
      summary.commits.some((commit) => {
        const commitDate = new Date(commit.date);
        return commitDate >= timeFilter.start && commitDate < timeFilter.end;
      })
    );
  }, [displaySummaries, timeFilter]);

  // Build heatmap commits from displayed summaries
  const heatmapCommits = useMemo<CommitTimestamp[]>(() => {
    const commits: CommitTimestamp[] = [];
    for (const summary of displaySummaries) {
      for (const commit of summary.commits) {
        commits.push({
          timestamp: commit.date,
          repoId: summary.fullName,
        });
      }
    }
    return commits;
  }, [displaySummaries]);

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

  // Handle heatmap block click
  const handleHeatmapBlockClick = useCallback((start: Date, end: Date, count: number) => {
    if (count === 0) return;

    // Toggle filter if clicking same block
    if (timeFilter && timeFilter.start.getTime() === start.getTime()) {
      setTimeFilter(null);
    } else {
      setTimeFilter({ start, end });
    }
  }, [timeFilter]);

  // Clear time filter
  const clearTimeFilter = () => {
    setTimeFilter(null);
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
      {/* 3-Column Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Left column - Search */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: 300, padding: spacing.md }}>
            {/* Search input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: theme.colors.surface,
                borderRadius: 4,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <Search size={16} color={theme.colors.textMuted} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search GitHub or paste a link..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: theme.colors.text,
                  fontSize: theme.fontSizes[1],
                  fontFamily: 'inherit',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: spacing.xs,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  <X size={14} color={theme.colors.textMuted} />
                </button>
              )}
            </div>
          </div>

          {/* Search results */}
          <div style={{ width: 300, flex: 1, overflow: 'auto', padding: `0 ${spacing.md}px ${spacing.md}px` }}>
            {!searchQuery.trim() ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: theme.colors.textMuted,
                  textAlign: 'center',
                  fontSize: theme.fontSizes[1],
                }}
              >
                <Search size={32} style={{ marginBottom: spacing.sm, opacity: 0.3 }} />
                <span>Search GitHub to add repos</span>
              </div>
            ) : searchLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: spacing.md,
                  color: theme.colors.textMuted,
                }}
              >
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : searchResults.length === 0 ? (
              <div
                style={{
                  padding: spacing.md,
                  textAlign: 'center',
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSizes[1],
                }}
              >
                No results for &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                {searchResults.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => handleSelectRepo(repo)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      padding: spacing.sm,
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.colors.surface;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={repo.owner.avatar_url}
                      alt={repo.owner.login}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: theme.fontSizes[1],
                          fontWeight: 500,
                          color: theme.colors.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {repo.name}
                      </div>
                      <div
                        style={{
                          fontSize: theme.fontSizes[0],
                          color: theme.colors.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {repo.owner.login}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center column - Feed */}
        <div
          className="activity-feed-scroll"
          style={{
            width: 800,
            flexShrink: 0,
            overflow: 'auto',
            padding: spacing.md,
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE/Edge
          }}
        >
          <style>{`.activity-feed-scroll::-webkit-scrollbar { display: none; }`}</style>
          {/* Selected repo header */}
          {selectedRepo && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                marginBottom: spacing.md,
              }}
            >
              <button
                onClick={clearSelectedRepo}
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
                }}
              >
                ← Back to feed
              </button>
              <span style={{ fontSize: theme.fontSizes[2], fontWeight: 600, color: theme.colors.text }}>
                {selectedRepo.full_name}
              </span>
              {selectedRepoLoading && (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              )}
            </div>
          )}

          {/* Time filter indicator */}
          {timeFilter && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.sm,
                marginBottom: spacing.md,
                backgroundColor: `${theme.colors.primary}10`,
                borderRadius: 4,
                border: `1px solid ${theme.colors.primary}`,
              }}
            >
              <span style={{ fontSize: theme.fontSizes[1], color: theme.colors.text }}>
                Showing commits from {timeFilter.start.toLocaleTimeString()} - {timeFilter.end.toLocaleTimeString()}
              </span>
              <button
                onClick={clearTimeFilter}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.colors.primary}`,
                  borderRadius: 4,
                  color: theme.colors.primary,
                  cursor: 'pointer',
                  fontSize: theme.fontSizes[1],
                }}
              >
                <X size={12} />
                Clear
              </button>
            </div>
          )}

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

          {timeFilteredSummaries.length === 0 && !loading ? (
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
              <p style={{ margin: 0, fontSize: theme.fontSizes[2] }}>
                {timeFilter ? 'No commits in this time range' : selectedRepo ? 'No commits in the last 24 hours' : 'No recent activity'}
              </p>
              <p style={{ margin: `${spacing.xs}px 0 0`, fontSize: theme.fontSizes[1] }}>
                {timeFilter ? 'Try selecting a different time block' : selectedRepo ? 'This repository has no recent commits' : 'Commits from featured repositories will appear here'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {timeFilteredSummaries.map((summary) => (
                <RepoActivityCard
                  key={summary.fullName}
                  summary={summary}
                  isExpanded={expandedRepos.has(summary.fullName)}
                  onToggleExpand={() => toggleExpanded(summary.fullName)}
                  onOpen={() => handleRepoOpen(summary)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right column - Heatmap */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 300,
              height: '100%',
              padding: spacing.md,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <HourlyActivityHeatmap
              commits={heatmapCommits}
              loading={loading}
              onBlockClick={handleHeatmapBlockClick}
              selectedBlock={timeFilter?.start.toISOString() ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
