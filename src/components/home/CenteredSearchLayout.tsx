'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useHomepageState } from '@/hooks/useHomepageState';
import { GitHubSearchResults } from './GitHubSearchResults';

/**
 * Parse a GitHub URL and extract owner/repo
 * Supports formats:
 * - https://github.com/owner/repo
 * - http://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo (if it looks like a repo path)
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

const RECENT_REPOSITORIES_KEY = 'recent-repositories';

interface RecentRepository {
  owner: string;
  repo: string;
  visitedAt: string;
}

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

export function CenteredSearchLayout() {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const {
    searchQuery,
    setSearchQuery,
  } = useHomepageState();

  // Handle Enter key to navigate to GitHub URLs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const parsed = parseGitHubUrl(searchQuery);
      if (parsed && parsed.repo) {
        router.push(`/${parsed.owner}/${parsed.repo}`);
      }
    }
  };

  // Recent repositories
  const [recentRepos, setRecentRepos] = useState<RecentRepository[]>([]);

  // User's GitHub repos (for prioritizing in search)
  const [userRepos, setUserRepos] = useState<UserGitHubRepo[]>([]);

  // Load recent repos from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_REPOSITORIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate and filter to ensure correct format
        const validated = Array.isArray(parsed)
          ? parsed.filter(
              (item): item is RecentRepository =>
                item &&
                typeof item === 'object' &&
                typeof item.owner === 'string' &&
                typeof item.repo === 'string' &&
                item.owner.length > 0 &&
                item.repo.length > 0
            )
          : [];
        setRecentRepos(validated);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Fetch user repos when authenticated (for prioritizing in search)
  useEffect(() => {
    if (!isAuthenticated) return;

    fetch('/api/github/user/repos')
      .then((res) => res.json())
      .then((data) => {
        const allRepos: UserGitHubRepo[] = [
          ...(data.owned || []),
          ...(data.organizations?.flatMap((org: { repositories: UserGitHubRepo[] }) => org.repositories) || []),
        ];
        setUserRepos(allRepos);
      })
      .catch((err) => {
        console.error('Failed to fetch user repos:', err);
      });
  }, [isAuthenticated]);

  // Remove a repo from the recent list
  const removeRecentRepo = (owner: string, repo: string) => {
    const updated = recentRepos.filter(
      (r) => !(r.owner === owner && r.repo === repo)
    );
    setRecentRepos(updated);
    try {
      localStorage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  };

  const [hoveredRepo, setHoveredRepo] = useState<string | null>(null);

  const showRecents = !searchQuery.trim() && recentRepos.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Fixed Header Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '32px 24px 0',
          paddingTop: 'min(20vh, 160px)',
        }}
      >
        {/* Title */}
        <h1
          style={{
            margin: 0,
            marginBottom: '24px',
            fontSize: '42px',
            fontWeight: theme.fontWeights.bold,
            fontFamily: theme.fonts.body,
          }}
        >
          <span style={{ color: theme.colors.text }}>Principal</span>
          {' '}
          <span style={{ color: theme.colors.primary }}>AI</span>
        </h1>

        {/* Large Centered Search Bar */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '600px',
            marginTop: '12px',
          }}
        >
          <Search
            size={20}
            style={{
              position: 'absolute',
              left: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.colors.textMuted,
            }}
          />
          <input
            type="text"
            placeholder="Search GitHub or paste a link"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '16px 20px 16px 52px',
              fontSize: '18px',
              fontFamily: theme.fonts.body,
              borderRadius: '24px',
              border: `2px solid ${theme.colors.border}`,
              background: theme.colors.surface,
              color: theme.colors.text,
              outline: 'none',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
              e.currentTarget.style.boxShadow = `0 0 0 4px ${theme.colors.primary}20`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 24px 32px',
        }}
      >
        <div
          style={{
            maxWidth: '800px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {/* Recent Repositories - show when no search query */}
          {showRecents && (
            <div
              style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
                marginTop: '32px',
              }}
            >
              {recentRepos.slice(0, 6).map((repo) => {
                const repoKey = `${repo.owner}/${repo.repo}`;
                const isHovered = hoveredRepo === repoKey;
                return (
                  <div
                    key={repoKey}
                    style={{
                      position: 'relative',
                      width: '100px',
                    }}
                    onMouseEnter={() => setHoveredRepo(repoKey)}
                    onMouseLeave={() => setHoveredRepo(null)}
                  >
                    <Link
                      href={`/${repo.owner}/${repo.repo}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '12px',
                        borderRadius: '12px',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                        width: '100%',
                        backgroundColor: isHovered ? theme.colors.surface : 'transparent',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://github.com/${repo.owner}.png?size=64`}
                        alt={repo.owner}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '14px',
                          color: theme.colors.text,
                          fontFamily: theme.fonts.body,
                          textAlign: 'center',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          width: '100%',
                        }}
                      >
                        {repo.repo}
                      </span>
                    </Link>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeRecentRepo(repo.owner, repo.repo);
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '50%',
                        background: theme.colors.surface,
                        color: theme.colors.textMuted,
                        cursor: 'pointer',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.15s ease, color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = theme.colors.text;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = theme.colors.textMuted;
                      }}
                      title="Remove from recent"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search Results */}
          {searchQuery.trim() && (
            <div style={{ marginTop: '32px' }}>
              <GitHubSearchResults
                searchQuery={searchQuery}
                userRepos={userRepos}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
