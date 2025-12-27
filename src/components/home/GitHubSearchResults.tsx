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

interface GitHubSearchResultsProps {
  searchQuery: string;
}

export function GitHubSearchResults({ searchQuery }: GitHubSearchResultsProps) {
  const { theme } = useTheme();
  const [results, setResults] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchGitHub(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchGitHub]);

  // No search query - show nothing
  if (!searchQuery.trim()) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          width: '100%',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i} theme={theme} />
        ))}
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

  // No results
  if (results.length === 0) {
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
      {/* Results grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          width: '100%',
        }}
      >
        {results.map((repo) => (
          <RepoCard key={repo.id} repo={repo} theme={theme} />
        ))}
      </div>
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
