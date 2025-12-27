'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useHomepageState } from '@/hooks/useHomepageState';
import { SearchToggleButtons } from './SearchToggleButtons';
import { UserReposGrid } from './UserReposGrid';
import { GitHubSearchResults } from './GitHubSearchResults';

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

  const {
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
  } = useHomepageState();

  // Recent repositories
  const [recentRepos, setRecentRepos] = useState<RecentRepository[]>([]);

  // User's GitHub repos
  const [userRepos, setUserRepos] = useState<UserGitHubRepo[]>([]);
  const [userReposLoading, setUserReposLoading] = useState(false);

  // Load recent repos from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_REPOSITORIES_KEY);
      if (saved) {
        setRecentRepos(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Fetch user repos when authenticated and "Your Repos" is selected
  useEffect(() => {
    if (!isAuthenticated || activeView !== 'your-repos') return;

    setUserReposLoading(true);
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
      })
      .finally(() => {
        setUserReposLoading(false);
      });
  }, [isAuthenticated, activeView]);

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
          paddingTop: 'min(15vh, 120px)',
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

        {/* Toggle Buttons - above search bar */}
        <SearchToggleButtons
          activeView={activeView}
          onViewChange={setActiveView}
          isAuthenticated={isAuthenticated}
        />

        {/* Large Centered Search Bar */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '600px',
            marginTop: '24px',
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
            placeholder={
              activeView === 'github-search'
                ? 'Search GitHub repositories...'
                : 'Filter your repositories...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
          {showRecents && activeView === 'github-search' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                justifyContent: 'center',
                marginTop: '32px',
                maxWidth: '700px',
                margin: '32px auto 0',
              }}
            >
              {recentRepos.slice(0, 6).map((repo) => (
                <Link
                  key={`${repo.owner}/${repo.repo}`}
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
                    width: '200px',
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
              ))}
            </div>
          )}

          {/* Your Repos View */}
          {activeView === 'your-repos' && (
            <div style={{ marginTop: '32px' }}>
              <UserReposGrid
                repos={userRepos}
                loading={userReposLoading}
                isAuthenticated={isAuthenticated}
                searchQuery={searchQuery}
              />
            </div>
          )}

          {/* GitHub Search View */}
          {activeView === 'github-search' && searchQuery.trim() && (
            <div style={{ marginTop: '32px' }}>
              <GitHubSearchResults searchQuery={searchQuery} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
