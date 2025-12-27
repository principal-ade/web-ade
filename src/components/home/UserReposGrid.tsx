'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';

interface UserGitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
  private: boolean;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
}

interface UserReposGridProps {
  repos: UserGitHubRepo[];
  loading?: boolean;
  isAuthenticated: boolean;
  searchQuery?: string;
}

export function UserReposGrid({
  repos,
  loading = false,
  isAuthenticated,
  searchQuery = '',
}: UserReposGridProps) {
  const { theme } = useTheme();

  if (!isAuthenticated) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: theme.colors.textMuted,
        }}
      >
        <Lock size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <p style={{ fontSize: `${theme.fontSizes[2]}px`, marginBottom: '8px' }}>
          Sign in to view your repositories
        </p>
        <p style={{ fontSize: `${theme.fontSizes[1]}px` }}>
          Connect your GitHub account to see your personal and organization repos
        </p>
      </div>
    );
  }

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

  if (repos.length === 0) {
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
          Create a new repository on GitHub to get started
        </p>
      </div>
    );
  }

  // Filter by search query
  const filteredRepos = searchQuery.trim()
    ? repos.filter((repo) => {
        const query = searchQuery.toLowerCase();
        return (
          repo.name.toLowerCase().includes(query) ||
          repo.full_name.toLowerCase().includes(query) ||
          repo.owner.login.toLowerCase().includes(query) ||
          (repo.description?.toLowerCase().includes(query) ?? false)
        );
      })
    : repos;

  // Sort by most recently updated
  const sortedRepos = [...filteredRepos].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  // No matching results for search
  if (sortedRepos.length === 0 && searchQuery.trim()) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: theme.colors.textMuted,
        }}
      >
        <p style={{ fontSize: `${theme.fontSizes[2]}px`, marginBottom: '8px' }}>
          No repositories matching &quot;{searchQuery}&quot;
        </p>
        <p style={{ fontSize: `${theme.fontSizes[1]}px` }}>
          Try a different search term
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px',
        width: '100%',
      }}
    >
      {sortedRepos.slice(0, 12).map((repo) => (
        <RepoCard key={repo.id} repo={repo} theme={theme} />
      ))}
    </div>
  );
}

const RepoCard: React.FC<{
  repo: UserGitHubRepo;
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ repo, theme }) => {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays < 1) return 'Updated today';
    if (diffDays === 1) return 'Updated yesterday';
    if (diffDays < 7) return `Updated ${diffDays} days ago`;
    if (diffDays < 30) return `Updated ${Math.floor(diffDays / 7)} weeks ago`;
    return `Updated ${Math.floor(diffDays / 30)} months ago`;
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={repo.owner.avatar_url}
          alt={repo.owner.login}
          style={{
            width: 24,
            height: 24,
            borderRadius: '6px',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
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
        {repo.private && (
          <Lock size={12} style={{ color: theme.colors.textMuted, flexShrink: 0 }} />
        )}
        <ArrowRight size={14} style={{ color: theme.colors.textMuted, flexShrink: 0 }} />
      </div>

      {/* Description */}
      {repo.description && (
        <div
          style={{
            fontSize: `${theme.fontSizes[0]}px`,
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

      {/* Footer: Language and updated time */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: `${theme.fontSizes[0]}px`,
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
        <span>{formatTimeAgo(repo.updated_at)}</span>
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
          width: '40%',
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

// Language colors (subset of GitHub's language colors)
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
