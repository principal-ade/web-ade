'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ArrowRight, Star, GitFork } from 'lucide-react';
import Link from 'next/link';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
}

interface UserRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
}

interface GitHubSearchResultsProps {
  searchQuery: string;
  userRepos?: UserRepo[];
}

/**
 * Parse a GitHub URL and extract owner/repo
 */
function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();

  // Try to parse as URL first
  const urlPatterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i,
    /^github\.com\/([^/]+)\/([^/]+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1] && match[2]) {
      // Clean repo name (remove .git suffix, query params, etc.)
      const repo = match[2].replace(/\.git$/, '').split(/[?#]/)[0];
      return { owner: match[1], repo: repo || '' };
    }
  }

  // Try owner/repo format (must have exactly one slash, no spaces, valid chars)
  const repoPathMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (repoPathMatch && repoPathMatch[1] && repoPathMatch[2]) {
    return { owner: repoPathMatch[1], repo: repoPathMatch[2] };
  }

  return null;
}

export function GitHubSearchResults({ searchQuery, userRepos = [] }: GitHubSearchResultsProps) {
  const { theme } = useTheme();
  const [results, setResults] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directRepo, setDirectRepo] = useState<GitHubRepo | null>(null);
  const [directRepoLoading, setDirectRepoLoading] = useState(false);
  const [pendingSearch, setPendingSearch] = useState(false); // Track debounce period

  // Filter user repos that match the search query
  const matchingUserRepos = userRepos.filter((repo) => {
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.full_name.toLowerCase().includes(query) ||
      repo.owner.login.toLowerCase().includes(query) ||
      (repo.description?.toLowerCase().includes(query) ?? false)
    );
  });

  // Get IDs of matching user repos to filter from GitHub results
  const userRepoFullNames = new Set(matchingUserRepos.map((r) => r.full_name.toLowerCase()));

  // Fetch a specific repo by owner/repo
  const fetchDirectRepo = useCallback(async (owner: string, repo: string) => {
    setDirectRepoLoading(true);
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`
      );
      if (response.ok) {
        const data = await response.json();
        setDirectRepo(data);
      } else {
        setDirectRepo(null);
      }
    } catch {
      setDirectRepo(null);
    } finally {
      setDirectRepoLoading(false);
    }
  }, []);

  const searchGitHub = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/github/search?q=${encodeURIComponent(query)}&per_page=12`
      );

      if (!response.ok) {
        throw new Error('Failed to search GitHub');
      }

      const data = await response.json();
      setResults(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search - also check for direct URLs
  useEffect(() => {
    if (searchQuery.trim()) {
      setPendingSearch(true); // Show loading immediately while debouncing
    }

    const timer = setTimeout(() => {
      setPendingSearch(false);
      const parsed = parseGitHubUrl(searchQuery);
      if (parsed && parsed.repo) {
        // It's a URL or owner/repo format - fetch directly
        fetchDirectRepo(parsed.owner, parsed.repo);
        setResults([]); // Clear search results when fetching direct
      } else {
        setDirectRepo(null);
        searchGitHub(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchGitHub, fetchDirectRepo]);

  // No search query - show nothing
  if (!searchQuery.trim()) {
    return null;
  }

  // Check if we parsed a URL/repo path
  const parsedUrl = parseGitHubUrl(searchQuery);

  // Show loading skeleton during debounce period or while fetching
  const isLoading = pendingSearch || loading || directRepoLoading;

  if (isLoading) {
    // Show fewer skeletons for URL lookups, more for search
    const skeletonCount = parsedUrl ? 1 : 6;
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          width: '100%',
        }}
      >
        {Array.from({ length: skeletonCount }, (_, i) => (
          <SkeletonCard key={i} theme={theme} />
        ))}
      </div>
    );
  }

  // Show direct repo if found via URL
  if (parsedUrl && directRepo) {
    return (
      <div style={{ width: '100%' }}>
        <p
          style={{
            fontSize: '14px',
            color: theme.colors.textMuted,
            marginBottom: '16px',
          }}
        >
          Repository from URL:
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
            width: '100%',
          }}
        >
          <RepoCard repo={directRepo} theme={theme} />
        </div>
      </div>
    );
  }

  // URL was parsed but repo not found
  if (parsedUrl && !directRepo) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: theme.colors.textMuted,
        }}
      >
        <p style={{ fontSize: `${theme.fontSizes[2]}px`, marginBottom: '8px' }}>
          Repository not found
        </p>
        <p style={{ fontSize: `${theme.fontSizes[1]}px` }}>
          {parsedUrl.owner}/{parsedUrl.repo} does not exist or is private
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: theme.colors.error,
        }}
      >
        <p style={{ fontSize: `${theme.fontSizes[2]}px`, marginBottom: '8px' }}>
          Search failed
        </p>
        <p style={{ fontSize: `${theme.fontSizes[1]}px`, color: theme.colors.textMuted }}>
          {error}
        </p>
      </div>
    );
  }

  // Filter GitHub results to exclude user repos (avoid duplicates)
  const filteredResults = results.filter(
    (repo) => !userRepoFullNames.has(repo.full_name.toLowerCase())
  );

  // No results (neither user repos nor GitHub results)
  if (matchingUserRepos.length === 0 && filteredResults.length === 0) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: theme.colors.textMuted,
        }}
      >
        <p style={{ fontSize: `${theme.fontSizes[2]}px`, marginBottom: '8px' }}>
          No repositories found
        </p>
        <p style={{ fontSize: `${theme.fontSizes[1]}px` }}>
          Try a different search term
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* User repos section - shown first */}
      {matchingUserRepos.length > 0 && (
        <>
          <p
            style={{
              fontSize: '14px',
              color: theme.colors.textMuted,
              marginBottom: '12px',
            }}
          >
            Your repositories
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
              width: '100%',
              marginBottom: filteredResults.length > 0 ? '24px' : 0,
            }}
          >
            {matchingUserRepos.slice(0, 6).map((repo) => (
              <RepoCard
                key={repo.id}
                repo={{
                  ...repo,
                  forks_count: 0,
                }}
                theme={theme}
              />
            ))}
          </div>
        </>
      )}

      {/* GitHub search results */}
      {filteredResults.length > 0 && (
        <>
          {matchingUserRepos.length > 0 && (
            <p
              style={{
                fontSize: '14px',
                color: theme.colors.textMuted,
                marginBottom: '12px',
              }}
            >
              GitHub
            </p>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
              width: '100%',
            }}
          >
            {filteredResults.map((repo) => (
              <RepoCard key={repo.id} repo={repo} theme={theme} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const RepoCard: React.FC<{
  repo: GitHubRepo;
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ repo, theme }) => {
  return (
    <Link
      href={`/${repo.full_name}`}
      style={{
        padding: '16px 20px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
      }}
    >
      {/* Header: Avatar and name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={repo.owner.avatar_url}
          alt={repo.owner.login}
          style={{
            width: 36,
            height: 36,
            borderRadius: '8px',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: '16px',
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {repo.full_name}
        </div>
        <ArrowRight size={16} style={{ color: theme.colors.textMuted, flexShrink: 0 }} />
      </div>

      {/* Description */}
      {repo.description && (
        <div
          style={{
            fontSize: '14px',
            color: theme.colors.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.4,
          }}
        >
          {repo.description}
        </div>
      )}

      {/* Footer: Stats */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: theme.colors.textMuted,
        }}
      >
        {repo.language && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: getLanguageColor(repo.language),
              }}
            />
            {repo.language}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Star size={12} />
          {formatCount(repo.stargazers_count)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GitFork size={12} />
          {formatCount(repo.forks_count)}
        </span>
      </div>
    </Link>
  );
};

const SkeletonCard: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ theme }) => {
  return (
    <div
      style={{
        padding: '16px 20px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '6px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: '70%',
            height: 16,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      <div
        style={{
          width: '100%',
          height: 14,
          borderRadius: '4px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: '50%',
          height: 12,
          borderRadius: '4px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}m`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Rust: '#dea584',
    Go: '#00ADD8',
    Java: '#b07219',
    Ruby: '#701516',
    PHP: '#4F5D95',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#178600',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Scala: '#c22d40',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Vue: '#41b883',
    Svelte: '#ff3e00',
  };
  return colors[language] || '#8b949e';
}
