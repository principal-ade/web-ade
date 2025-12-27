'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHomepageState } from '@/hooks/useHomepageState';
import { SearchToggleButtons } from './SearchToggleButtons';
import { UserReposGrid } from './UserReposGrid';
import { GitHubSearchResults } from './GitHubSearchResults';

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

  // User's GitHub repos
  const [userRepos, setUserRepos] = useState<UserGitHubRepo[]>([]);
  const [userReposLoading, setUserReposLoading] = useState(false);

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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
        padding: '32px 24px',
      }}
    >
      {/* Centered Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '800px',
          width: '100%',
          margin: '0 auto',
          paddingTop: '15vh',
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

        {/* Content Area */}
        <div
          style={{
            width: '100%',
            marginTop: '32px',
          }}
        >
          {/* Your Repos View */}
          {activeView === 'your-repos' && (
            <UserReposGrid
              repos={userRepos}
              loading={userReposLoading}
              isAuthenticated={isAuthenticated}
            />
          )}

          {/* GitHub Search View */}
          {activeView === 'github-search' && (
            <GitHubSearchResults searchQuery={searchQuery} />
          )}
        </div>
      </div>
    </div>
  );
}
