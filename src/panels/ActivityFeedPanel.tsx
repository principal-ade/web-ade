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

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { FolderGit2, Search, X, ArrowLeft, Globe, Building2, MapPin } from 'lucide-react';
import { GitHubSearchingAnimation } from '@/components/home/GitHubSearchingAnimation';
import { Logo } from '@principal-ai/logo-component';
import { useGitHubActivityFeed, type RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { FEATURED_REPOS } from '@/lib/featured-repos';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { RepoActivityCard } from './RepoActivityCard';
import { MobileActivityFeed } from '@/components/home/MobileActivityFeed';
import { RepoHeader } from '@/components/RepoHeader';

// Hour helpers for grouping
const formatHourLabel = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

interface HourGroup {
  hour: number;
  date: Date;
  dateKey: string;
  isFirst: boolean;
  summaries: RepoActivitySummary[];
  commitCount: number;
}

// Group summaries by hour, splitting repos that span multiple hours
function groupSummariesByHour(summaries: RepoActivitySummary[]): HourGroup[] {
  const hourMap = new Map<string, {
    hour: number;
    date: Date;
    summaryMap: Map<string, RepoActivitySummary>;
    commitCount: number;
  }>();

  // Process each summary
  for (const summary of summaries) {
    for (const commit of summary.commits) {
      const commitDate = new Date(commit.date);
      const hour = commitDate.getHours();
      const dateKey = `${commitDate.getFullYear()}-${commitDate.getMonth()}-${commitDate.getDate()}-${hour}`;

      if (!hourMap.has(dateKey)) {
        // Create a representative date for this hour
        const hourDate = new Date(commitDate);
        hourDate.setMinutes(0, 0, 0);
        hourMap.set(dateKey, {
          hour,
          date: hourDate,
          summaryMap: new Map(),
          commitCount: 0,
        });
      }

      const group = hourMap.get(dateKey)!;
      group.commitCount++;

      // Add or update the summary for this repo in this hour
      if (!group.summaryMap.has(summary.fullName)) {
        group.summaryMap.set(summary.fullName, {
          ...summary,
          commits: [],
          commitCount: 0,
          latestCommitAt: commitDate,
        });
      }

      const hourSummary = group.summaryMap.get(summary.fullName)!;
      hourSummary.commits.push(commit);
      hourSummary.commitCount++;
      if (commitDate > hourSummary.latestCommitAt) {
        hourSummary.latestCommitAt = commitDate;
      }
    }
  }

  // Convert to array and sort by time (most recent first)
  const groups: HourGroup[] = [];
  for (const [dateKey, group] of hourMap) {
    const summaryList = Array.from(group.summaryMap.values())
      .sort((a, b) => new Date(b.latestCommitAt).getTime() - new Date(a.latestCommitAt).getTime());

    groups.push({
      hour: group.hour,
      date: group.date,
      dateKey,
      isFirst: false,
      summaries: summaryList,
      commitCount: group.commitCount,
    });
  }

  // Sort by date (most recent first)
  groups.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Mark the first one
  if (groups.length > 0) {
    groups[0]!.isFirst = true;
  }

  return groups;
}

function formatDateLabel(date: Date): string | null {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return null;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

interface GitHubSearchRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type?: 'User' | 'Organization';
  };
  description: string | null;
}

interface GitHubUserProfile {
  login: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  twitter_username: string | null;
  company: string | null;
  location: string | null;
  html_url: string;
  avatar_url: string;
  public_repos: number;
  followers: number;
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

  // Fetch activity for the featured repos
  const { repoSummaries, loading, error, addRepo, refresh } = useGitHubActivityFeed(FEATURED_REPOS, 10);

  // Combined loading state
  const isLoading = loading;

  // Detect mobile to avoid rendering heavy desktop components
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // State for expanded cards
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());

  // Store file counts per repo
  const [repoFileStats, setRepoFileStats] = useState<Map<string, { filesChanged: number }>>(new Map());

  // URL param sync for shareable links
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialLoadHandled = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GitHubSearchRepo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Selected repo from search (replaces feed with single repo)
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchRepo | null>(null);

  // Full repository details for header display
  const [selectedRepoDetails, setSelectedRepoDetails] = useState<{
    created_at: string;
    updated_at: string;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    watchers_count: number;
    open_issues_count: number;
  } | null>(null);

  // Full year contribution data for heatmap
  const [contributionData, setContributionData] = useState<{
    contributions: Array<{ date: string; count: number }>;
    totalCommits: number;
  } | null>(null);

  // Selected author (shows profile in right column)
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [authorProfile, setAuthorProfile] = useState<GitHubUserProfile | null>(null);
  const [authorLoading, setAuthorLoading] = useState(false);

  // Search expansion state for left column
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Poll for updates every 60 seconds when tab is visible and no specific repo is selected
  useEffect(() => {
    const POLL_INTERVAL = 60 * 1000; // 60 seconds
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        refresh();
      }, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden || selectedRepo) {
        stopPolling();
      } else {
        // Refresh immediately when tab becomes visible (but not when viewing a specific repo)
        refresh();
        startPolling();
      }
    };

    // Start polling if tab is visible and no specific repo is selected
    if (!document.hidden && !selectedRepo) {
      startPolling();
    } else {
      stopPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh, selectedRepo]);

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
    // Immediately set repo with data we already have
    setSelectedRepo(repo);

    // Update URL with repo for sharing
    router.replace(`${pathname}?q=${repo.full_name}`, { scroll: false });

    // Fetch full repository details and contributions in parallel
    try {
      const [detailsResponse, contributionsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo.owner.login}/${repo.name}`),
        fetch(`/api/github/repo/${repo.owner.login}/${repo.name}/contributions`)
      ]);

      if (detailsResponse.ok) {
        const data = await detailsResponse.json();
        setSelectedRepoDetails({
          created_at: data.created_at,
          updated_at: data.updated_at,
          language: data.language,
          stargazers_count: data.stargazers_count || 0,
          forks_count: data.forks_count || 0,
          watchers_count: data.watchers_count || 0,
          open_issues_count: data.open_issues_count || 0,
        });
      }

      if (contributionsResponse.ok) {
        const data = await contributionsResponse.json();
        setContributionData({
          contributions: data.contributions || [],
          totalCommits: data.totalCommits || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch repository details:', error);
    }

    // Fetch activity for this repo (for recent 24h feed)
    await addRepo(repo.owner.login, repo.name);
  }, [addRepo, pathname, router]);

  // Clear selected repo to go back to featured repos
  const clearSelectedRepo = useCallback(() => {
    setSelectedRepo(null);
    setSelectedRepoDetails(null);
    setContributionData(null);
    // Clear URL param
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  // Auto-select repo from URL param on initial load
  useEffect(() => {
    if (initialLoadHandled.current) return;

    const urlQuery = searchParams.get('q');
    if (!urlQuery) {
      initialLoadHandled.current = true;
      return;
    }

    const parsed = parseGitHubUrl(urlQuery);
    if (parsed && parsed.repo) {
      initialLoadHandled.current = true;

      // Fetch and select the repo
      (async () => {
        try {
          const [repoResponse, contributionsResponse] = await Promise.all([
            fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`),
            fetch(`/api/github/repo/${parsed.owner}/${parsed.repo}/contributions`)
          ]);

          if (repoResponse.ok) {
            const repoData = await repoResponse.json();
            setSelectedRepo(repoData);
            setSelectedRepoDetails({
              created_at: repoData.created_at,
              updated_at: repoData.updated_at,
              language: repoData.language,
              stargazers_count: repoData.stargazers_count || 0,
              forks_count: repoData.forks_count || 0,
              watchers_count: repoData.watchers_count || 0,
              open_issues_count: repoData.open_issues_count || 0,
            });
            await addRepo(parsed.owner, parsed.repo);
          }

          if (contributionsResponse.ok) {
            const contributionsData = await contributionsResponse.json();
            setContributionData({
              contributions: contributionsData.contributions || [],
              totalCommits: contributionsData.totalCommits || 0,
            });
          }
        } catch (err) {
          console.warn('Failed to load repo from URL:', err);
        }
      })();
    } else {
      initialLoadHandled.current = true;
    }
  }, [searchParams, addRepo]);

  // All repos sorted by most recent commit (for left sidebar)
  const allSummaries = useMemo(() => {
    return [...repoSummaries].sort((a, b) => {
      return new Date(b.latestCommitAt).getTime() - new Date(a.latestCommitAt).getTime();
    });
  }, [repoSummaries]);

  // Get summaries to display in center column (either selected repo or all featured)
  const displaySummaries = useMemo(() => {
    let summaries: RepoActivitySummary[];
    if (selectedRepo) {
      // Show only the selected repo
      summaries = repoSummaries.filter(
        (s) => s.fullName.toLowerCase() === selectedRepo.full_name.toLowerCase()
      );
    } else {
      summaries = repoSummaries;
    }

    // Sort by most recent commit
    return summaries.sort((a, b) => {
      return new Date(b.latestCommitAt).getTime() - new Date(a.latestCommitAt).getTime();
    });
  }, [repoSummaries, selectedRepo]);

  // Build activity data map for the heatmap from full year contribution data
  const selectedRepoActivityData = useMemo(() => {
    if (!selectedRepo || !contributionData) return new Map<string, number>();

    const activityMap = new Map<string, number>();
    contributionData.contributions.forEach((contribution) => {
      activityMap.set(contribution.date, contribution.count);
    });

    return activityMap;
  }, [selectedRepo, contributionData]);

  // Group summaries by hour for the center feed
  const hourGroups = useMemo(() => {
    return groupSummariesByHour(displaySummaries);
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

  // Handle opening repo (show header view)
  const handleRepoOpen = useCallback(async (summary: RepoActivitySummary) => {
    // Update URL with repo for sharing
    router.replace(`${pathname}?q=${summary.fullName}`, { scroll: false });

    // Immediately set repo with data we already have
    setSelectedRepo({
      id: 0,
      name: summary.repo,
      full_name: summary.fullName,
      owner: {
        login: summary.owner,
        avatar_url: summary.ownerAvatarUrl || `https://github.com/${summary.owner}.png`,
        type: undefined,
      },
      description: null,
    });

    // Fetch full details in background
    try {
      const [repoResponse, contributionsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${summary.owner}/${summary.repo}`),
        fetch(`/api/github/repo/${summary.owner}/${summary.repo}/contributions`)
      ]);

      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        setSelectedRepo({
          id: repoData.id || 0,
          name: repoData.name,
          full_name: repoData.full_name,
          owner: {
            login: repoData.owner.login,
            avatar_url: repoData.owner.avatar_url,
            type: repoData.owner.type,
          },
          description: repoData.description,
        });
        setSelectedRepoDetails({
          created_at: repoData.created_at,
          updated_at: repoData.updated_at,
          language: repoData.language,
          stargazers_count: repoData.stargazers_count || 0,
          forks_count: repoData.forks_count || 0,
          watchers_count: repoData.watchers_count || 0,
          open_issues_count: repoData.open_issues_count || 0,
        });
      }

      if (contributionsResponse.ok) {
        const contributionsData = await contributionsResponse.json();
        setContributionData({
          contributions: contributionsData.contributions || [],
          totalCommits: contributionsData.totalCommits || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch repository details:', error);
    }
  }, [pathname, router]);

  // Handle author click - fetch profile
  const handleAuthorClick = useCallback((username: string) => {
    setSelectedAuthor(username);
    setSearchQuery(''); // Clear search when viewing author
    setSearchExpanded(false); // Close search panel
  }, []);

  // Fetch file stats for all repos
  useEffect(() => {
    let cancelled = false;

    const fetchFileStats = async () => {
      const statsMap = new Map<string, { filesChanged: number }>();

      await Promise.all(
        allSummaries.map(async (summary) => {
          const allFiles = new Set<string>();

          await Promise.all(
            summary.commits.map(async (commit) => {
              try {
                const response = await fetch(
                  `/api/github/repo/${summary.owner}/${summary.repo}/commits/${commit.sha}`
                );

                if (!response.ok || cancelled) return;

                const data = await response.json();
                if (data.files) {
                  data.files.forEach((f: { filename: string }) => {
                    allFiles.add(f.filename);
                  });
                }
              } catch (err) {
                console.warn(`Failed to fetch stats for ${commit.sha}:`, err);
              }
            })
          );

          if (!cancelled) {
            statsMap.set(summary.fullName, {
              filesChanged: allFiles.size,
            });
          }
        })
      );

      if (!cancelled) {
        setRepoFileStats(statsMap);
      }
    };

    fetchFileStats();

    return () => {
      cancelled = true;
    };
  }, [allSummaries]);

  // Fetch author profile when selected
  useEffect(() => {
    if (!selectedAuthor) {
      setAuthorProfile(null);
      return;
    }

    let cancelled = false;
    setAuthorLoading(true);

    const fetchProfile = async () => {
      try {
        const response = await fetch(`https://api.github.com/users/${selectedAuthor}`);
        if (response.ok && !cancelled) {
          const data = await response.json();
          setAuthorProfile(data);
        }
      } catch (err) {
        console.warn('Failed to fetch author profile:', err);
      } finally {
        if (!cancelled) {
          setAuthorLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedAuthor]);


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
      {/* Mobile only: Vertical swipe feed */}
      <div className="md:hidden" style={{ flex: 1, overflow: 'hidden' }}>
        <MobileActivityFeed
          summaries={displaySummaries}
          loading={isLoading}
          error={error}
        />
      </div>

      {/* Tablet & Desktop: 3-Column Content - only mount on non-mobile to avoid canvas memory issues */}
      {!isMobile && (
      <div
        className="hidden md:flex"
        style={{
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left column - Repository List (desktop only) */}
        <div
          className="hidden lg:flex"
          style={{
            flex: 1,
            minWidth: 200,
            flexDirection: 'column',
            alignItems: 'flex-end',
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
              gap: spacing.sm,
              overflow: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: spacing.xs,
              }}
            >
              <div
                style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: 600,
                  color: theme.colors.text,
                }}
              >
                Popular Projects
              </div>
              <button
                onClick={() => setSearchExpanded(!searchExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: spacing.xs,
                  backgroundColor: searchExpanded ? theme.colors.primary : theme.colors.surface,
                  border: `1px solid ${searchExpanded ? theme.colors.primary : theme.colors.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!searchExpanded) {
                    e.currentTarget.style.opacity = '0.8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!searchExpanded) {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
              >
                <Search size={16} color={searchExpanded ? theme.colors.textOnPrimary : theme.colors.text} />
              </button>
            </div>

            {/* Search interface - shown when expanded */}
            {searchExpanded && (
              <div style={{ marginBottom: spacing.md }}>
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
                    marginBottom: spacing.sm,
                  }}
                >
                  <Search size={16} color={theme.colors.textMuted} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchQuery(value);
                      if (value.trim()) setSearchLoading(true);
                    }}
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

                {/* Search results */}
                {searchLoading ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: spacing.lg,
                    }}
                  >
                    <GitHubSearchingAnimation size={80} />
                  </div>
                ) : searchQuery.trim() && searchResults.length === 0 ? (
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
                ) : searchResults.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {searchResults.map((repo) => {
                      const isSelected = selectedRepo?.full_name === repo.full_name;
                      return (
                      <button
                        key={repo.id}
                        onClick={() => {
                          handleSelectRepo(repo);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.sm,
                          padding: spacing.sm,
                          backgroundColor: isSelected ? theme.colors.surface : 'transparent',
                          border: `1px solid ${isSelected ? theme.colors.primary : theme.colors.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = theme.colors.surface;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        {/* Avatar */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={repo.owner.avatar_url}
                          alt={repo.owner.login}
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 8,
                            flexShrink: 0,
                          }}
                        />

                        {/* Text content */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: spacing.xs,
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: theme.fontSizes[1],
                              fontWeight: 600,
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
                            }}
                          >
                            {repo.owner.login}
                          </div>
                          {repo.description && (
                            <div
                              style={{
                                fontSize: theme.fontSizes[0],
                                color: theme.colors.textMuted,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {repo.description}
                            </div>
                          )}
                        </div>
                      </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {/* Popular projects list - only show when search is not expanded */}
            {!searchExpanded && allSummaries.map((summary) => {
              return (
                <button
                  key={summary.fullName}
                  onClick={async () => {
                    if (selectedRepo?.full_name === summary.fullName) {
                      // Deselect if clicking the same repo
                      clearSelectedRepo();
                    } else {
                      // Update URL with repo for sharing
                      router.replace(`${pathname}?q=${summary.fullName}`, { scroll: false });

                      // Immediately set repo with data we already have
                      setSelectedRepo({
                        id: 0,
                        name: summary.repo,
                        full_name: summary.fullName,
                        owner: {
                          login: summary.owner,
                          avatar_url: summary.ownerAvatarUrl || `https://github.com/${summary.owner}.png`,
                          type: undefined,
                        },
                        description: null,
                      });

                      // Fetch full details in background
                      try {
                        const [repoResponse, contributionsResponse] = await Promise.all([
                          fetch(`https://api.github.com/repos/${summary.owner}/${summary.repo}`),
                          fetch(`/api/github/repo/${summary.owner}/${summary.repo}/contributions`)
                        ]);

                        if (repoResponse.ok) {
                          const repoData = await repoResponse.json();
                          setSelectedRepo({
                            id: repoData.id || 0,
                            name: repoData.name,
                            full_name: repoData.full_name,
                            owner: {
                              login: repoData.owner.login,
                              avatar_url: repoData.owner.avatar_url,
                              type: repoData.owner.type,
                            },
                            description: repoData.description,
                          });
                          setSelectedRepoDetails({
                            created_at: repoData.created_at,
                            updated_at: repoData.updated_at,
                            language: repoData.language,
                            stargazers_count: repoData.stargazers_count || 0,
                            forks_count: repoData.forks_count || 0,
                            watchers_count: repoData.watchers_count || 0,
                            open_issues_count: repoData.open_issues_count || 0,
                          });
                        }

                        if (contributionsResponse.ok) {
                          const contributionsData = await contributionsResponse.json();
                          setContributionData({
                            contributions: contributionsData.contributions || [],
                            totalCommits: contributionsData.totalCommits || 0,
                          });
                        }
                      } catch (error) {
                        console.error('Failed to fetch repository details:', error);
                      }
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    padding: spacing.sm,
                    backgroundColor: selectedRepo?.full_name === summary.fullName ? theme.colors.surface : 'transparent',
                    border: `1px solid ${selectedRepo?.full_name === summary.fullName ? theme.colors.primary : theme.colors.border}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedRepo?.full_name !== summary.fullName) {
                      e.currentTarget.style.backgroundColor = theme.colors.surface;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedRepo?.full_name !== summary.fullName) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {/* Avatar */}
                  {summary.ownerAvatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={summary.ownerAvatarUrl}
                      alt={summary.owner}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Text content */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: spacing.xs,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: theme.fontSizes[1],
                        fontWeight: 600,
                        color: theme.colors.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {summary.repo}
                    </div>
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                      }}
                    >
                      {summary.owner}
                    </div>
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                      }}
                    >
                      {(() => {
                        const stats = repoFileStats.get(summary.fullName);
                        if (stats && stats.filesChanged > 0) {
                          return `${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed in ${summary.commitCount} commit${summary.commitCount !== 1 ? 's' : ''}`;
                        }
                        return `${summary.commitCount} commit${summary.commitCount !== 1 ? 's' : ''}`;
                      })()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center column - Feed */}
        <div
          className="activity-feed-scroll w-full lg:w-[800px] px-4 lg:px-0"
          style={{
            flexShrink: 0,
            overflow: 'auto',
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE/Edge
          }}
        >
          <style>{`.activity-feed-scroll::-webkit-scrollbar { display: none; }`}</style>
          {/* Selected repo header */}
          {selectedRepo && (
            <RepoHeader
              repo={{
                name: selectedRepo.name,
                full_name: selectedRepo.full_name,
                owner: {
                  login: selectedRepo.owner.login,
                  avatar_url: selectedRepo.owner.avatar_url,
                  type: selectedRepo.owner.type,
                },
                description: selectedRepo.description,
                created_at: selectedRepoDetails?.created_at || null,
                language: selectedRepoDetails?.language || null,
              }}
              activityData={selectedRepoActivityData}
              totalCommits={contributionData?.totalCommits || 0}
              onBackClick={clearSelectedRepo}
            />
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

          {hourGroups.length === 0 && !isLoading ? (
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
                {selectedRepo ? 'No commits in the last 24 hours' : 'No recent activity'}
              </p>
              <p style={{ margin: `${spacing.xs}px 0 0`, fontSize: theme.fontSizes[1] }}>
                {selectedRepo ? 'This repository has no recent commits' : 'Commits from featured repositories will appear here'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {hourGroups.map((group, groupIndex) => {
                const dateLabel = formatDateLabel(group.date);
                const label = formatHourLabel(group.hour);

                return (
                  <div key={group.dateKey}>
                    {/* Hour header */}
                    <div
                      style={{
                        paddingTop: groupIndex > 0 ? spacing.sm : 0,
                        paddingBottom: spacing.sm,
                        borderTop: groupIndex > 0 ? `1px solid ${theme.colors.border}` : undefined,
                        marginTop: groupIndex > 0 ? spacing.sm : 0,
                      }}
                    >
                      {dateLabel && (
                        <div
                          style={{
                            fontSize: theme.fontSizes[0],
                            color: theme.colors.textMuted,
                            marginBottom: spacing.xs,
                          }}
                        >
                          {dateLabel}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <div
                          style={{
                            fontSize: theme.fontSizes[2],
                            fontWeight: 600,
                            color: theme.colors.text,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: theme.fontSizes[0],
                            color: theme.colors.textMuted,
                          }}
                        >
                          {group.commitCount} commit{group.commitCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Cards for this hour */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                      {group.summaries.map((summary) => (
                        <RepoActivityCard
                          key={`${group.dateKey}-${summary.fullName}`}
                          summary={summary}
                          isExpanded={expandedRepos.has(`${group.dateKey}-${summary.fullName}`)}
                          onToggleExpand={() => toggleExpanded(`${group.dateKey}-${summary.fullName}`)}
                          onOpen={() => handleRepoOpen(summary)}
                          onAuthorClick={handleAuthorClick}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column - Author profile or default content (desktop only) */}
        <div
          className="hidden lg:flex"
          style={{
            flex: 1,
            minWidth: 200,
            flexDirection: 'column',
            alignItems: 'flex-start',
            overflow: 'hidden',
          }}
        >
          {/* Author profile or default content */}
          <div style={{ width: 300, flex: 1, overflow: 'auto', padding: spacing.md }}>
            {selectedAuthor ? (
              // Author profile view
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing.md,
                }}
              >
                {/* Back button */}
                <button
                  onClick={() => setSelectedAuthor(null)}
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
                    alignSelf: 'flex-start',
                  }}
                >
                  <ArrowLeft size={14} />
                  Back
                </button>

                {authorLoading ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: spacing.lg,
                    }}
                  >
                    <LoadingSpinner size={24} />
                  </div>
                ) : authorProfile ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.md,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 12,
                      border: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    {/* Avatar */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={authorProfile.avatar_url}
                      alt={authorProfile.login}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        border: `3px solid ${theme.colors.primary}`,
                      }}
                    />

                    {/* Name and username */}
                    <div style={{ textAlign: 'center' }}>
                      {authorProfile.name && (
                        <div
                          style={{
                            fontSize: theme.fontSizes[3],
                            fontWeight: 600,
                            color: theme.colors.text,
                          }}
                        >
                          {authorProfile.name}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: theme.fontSizes[1],
                          color: theme.colors.textMuted,
                        }}
                      >
                        @{authorProfile.login}
                      </div>
                    </div>

                    {/* Bio */}
                    {authorProfile.bio && (
                      <div
                        style={{
                          fontSize: theme.fontSizes[1],
                          color: theme.colors.text,
                          textAlign: 'center',
                          lineHeight: 1.5,
                        }}
                      >
                        {authorProfile.bio}
                      </div>
                    )}

                    {/* Stats */}
                    <div
                      style={{
                        display: 'flex',
                        gap: spacing.lg,
                        fontSize: theme.fontSizes[1],
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: theme.colors.text }}>
                          {authorProfile.public_repos}
                        </div>
                        <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
                          repos
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: theme.colors.text }}>
                          {authorProfile.followers}
                        </div>
                        <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
                          followers
                        </div>
                      </div>
                    </div>

                    {/* Social links */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: spacing.sm,
                        width: '100%',
                      }}
                    >
                      {/* GitHub profile */}
                      <a
                        href={authorProfile.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.sm,
                          padding: spacing.sm,
                          backgroundColor: theme.colors.background,
                          borderRadius: 6,
                          color: theme.colors.text,
                          textDecoration: 'none',
                          fontSize: theme.fontSizes[1],
                        }}
                      >
                        <FolderGit2 size={16} />
                        GitHub Profile
                      </a>

                      {/* Twitter/X */}
                      {authorProfile.twitter_username && (
                        <a
                          href={`https://twitter.com/${authorProfile.twitter_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.sm,
                            padding: spacing.sm,
                            backgroundColor: theme.colors.background,
                            borderRadius: 6,
                            color: theme.colors.text,
                            textDecoration: 'none',
                            fontSize: theme.fontSizes[1],
                          }}
                        >
                          <span style={{ fontSize: 16 }}>𝕏</span>
                          @{authorProfile.twitter_username}
                        </a>
                      )}

                      {/* Website/Blog */}
                      {authorProfile.blog && (
                        <a
                          href={authorProfile.blog.startsWith('http') ? authorProfile.blog : `https://${authorProfile.blog}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.sm,
                            padding: spacing.sm,
                            backgroundColor: theme.colors.background,
                            borderRadius: 6,
                            color: theme.colors.text,
                            textDecoration: 'none',
                            fontSize: theme.fontSizes[1],
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Globe size={14} />
                          {authorProfile.blog.replace(/^https?:\/\//, '')}
                        </a>
                      )}

                      {/* Company */}
                      {authorProfile.company && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.sm,
                            padding: spacing.sm,
                            backgroundColor: theme.colors.background,
                            borderRadius: 6,
                            color: theme.colors.textMuted,
                            fontSize: theme.fontSizes[1],
                          }}
                        >
                          <Building2 size={14} />
                          {authorProfile.company}
                        </div>
                      )}

                      {/* Location */}
                      {authorProfile.location && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.sm,
                            padding: spacing.sm,
                            backgroundColor: theme.colors.background,
                            borderRadius: 6,
                            color: theme.colors.textMuted,
                            fontSize: theme.fontSizes[1],
                          }}
                        >
                          <MapPin size={14} />
                          {authorProfile.location}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: spacing.md,
                      textAlign: 'center',
                      color: theme.colors.textMuted,
                    }}
                  >
                    Could not load profile
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: spacing.lg,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: spacing.lg * 1.5,
                    padding: `${spacing.lg * 2}px ${spacing.lg}px`,
                    borderRadius: 12,
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.colors.primary}20`,
                  }}
                >
                  {/* Principal AI Title */}
                  <div
                    style={{
                      fontSize: theme.fontSizes[3],
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: theme.colors.text }}>Principal</span>
                    {' '}
                    <span style={{ color: theme.colors.primary }}>AI</span>
                  </div>

                  {/* Logo */}
                  <Logo width={96} height={96} color={theme.colors.accent} particleColor={theme.colors.primary} letterColor={theme.colors.text} />

                  {/* Text */}
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        color: theme.colors.text,
                        fontSize: theme.fontSizes[2],
                        fontWeight: 600,
                        marginBottom: spacing.lg,
                        lineHeight: 1.6,
                      }}
                    >
                      File City Activity View
                    </div>
                    <div
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSizes[1],
                        lineHeight: 1.5,
                        marginBottom: spacing.md,
                      }}
                    >
                      Download for your projects
                    </div>
                  </div>

                  {/* Button */}
                  <a
                    href="https://principal-ade.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: `${spacing.sm + 4}px ${spacing.lg}px`,
                      backgroundColor: theme.colors.primary,
                      color: theme.colors.textOnPrimary,
                      borderRadius: 8,
                      fontSize: theme.fontSizes[2],
                      fontWeight: 600,
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                      boxShadow: `0 2px 8px ${theme.colors.primary}30`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}40`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 2px 8px ${theme.colors.primary}30`;
                    }}
                  >
                    Download
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
