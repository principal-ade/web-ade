'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Search, X, Clock } from 'lucide-react';
import Link from 'next/link';
import { FeaturedReposCarousel } from './FeaturedReposCarousel';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useHomepageState } from '@/hooks/useHomepageState';
import { GitHubSearchResults } from './GitHubSearchResults';
import type { GitHubRepository } from '@industry-theme/github-panels';

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
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    searchQuery,
    setSearchQuery,
  } = useHomepageState();

  // Dropdown visibility state
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number>(-1);

  // Handle Enter key to navigate to GitHub URLs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // If dropdown is showing and an item is hovered, navigate to it
      const hoveredRepo = recentRepos[hoveredIndex];
      if (showDropdown && hoveredIndex >= 0 && hoveredRepo) {
        router.push(`/${hoveredRepo.full_name}`);
        setShowDropdown(false);
        return;
      }
      const parsed = parseGitHubUrl(searchQuery);
      if (parsed && parsed.repo) {
        router.push(`/${parsed.owner}/${parsed.repo}`);
        setShowDropdown(false);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showDropdown && recentRepos.length > 0) {
        setHoveredIndex((prev) => Math.min(prev + 1, recentRepos.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showDropdown) {
        setHoveredIndex((prev) => Math.max(prev - 1, -1));
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHoveredIndex(-1);
    }
  };

  // Recent repositories (stored as GitHubRepository objects)
  const [recentRepos, setRecentRepos] = useState<GitHubRepository[]>([]);

  // User's GitHub repos (for prioritizing in search)
  const [userRepos, setUserRepos] = useState<UserGitHubRepo[]>([]);

  // Load recent repos from localStorage
  useEffect(() => {
    const loadRecent = () => {
      try {
        const saved = localStorage.getItem(RECENT_REPOSITORIES_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // GitHubRepository has: full_name, owner.login, name, etc.
          const validated = Array.isArray(parsed)
            ? parsed.filter(
                (item): item is GitHubRepository =>
                  item &&
                  typeof item === 'object' &&
                  typeof item.full_name === 'string' &&
                  item.full_name.includes('/')
              )
            : [];
          setRecentRepos(validated);
        }
      } catch {
        // Ignore parse errors
      }
    };

    loadRecent();

    // Listen for updates
    window.addEventListener('recent-items-updated', loadRecent);
    return () => window.removeEventListener('recent-items-updated', loadRecent);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setHoveredIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Remove a repo from the recent list
  const removeRecentRepo = (e: React.MouseEvent, fullName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = recentRepos.filter((r) => r.full_name !== fullName);
    setRecentRepos(updated);
    try {
      localStorage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  };

  const shouldShowDropdown = showDropdown && !searchQuery.trim() && recentRepos.length > 0;

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
          flexShrink: 0,
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

        {/* Large Centered Search Bar with Dropdown */}
        <div
          ref={searchContainerRef}
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
              zIndex: 1,
            }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search GitHub or paste a link"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
              setShowDropdown(true);
              e.currentTarget.style.borderColor = theme.colors.primary;
              e.currentTarget.style.boxShadow = `0 0 0 4px ${theme.colors.primary}20`;
              if (shouldShowDropdown || (!searchQuery.trim() && recentRepos.length > 0)) {
                e.currentTarget.style.borderRadius = '24px 24px 0 0';
              }
            }}
            onBlur={(e) => {
              // Delay to allow click events on dropdown items
              setTimeout(() => {
                e.target.style.borderColor = theme.colors.border;
                e.target.style.boxShadow = 'none';
                e.target.style.borderRadius = '24px';
              }, 150);
            }}
            style={{
              width: '100%',
              padding: '16px 20px 16px 52px',
              fontSize: '18px',
              fontFamily: theme.fonts.body,
              borderRadius: shouldShowDropdown ? '24px 24px 0 0' : '24px',
              border: `2px solid ${theme.colors.border}`,
              background: theme.colors.surface,
              color: theme.colors.text,
              outline: 'none',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
          />

          {/* Recent Repositories Dropdown */}
          {shouldShowDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: theme.colors.surface,
                border: `2px solid ${theme.colors.primary}`,
                borderTop: 'none',
                borderRadius: '0 0 24px 24px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100,
                maxHeight: '400px',
                overflow: 'auto',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 20px 8px',
                  color: theme.colors.textMuted,
                  fontSize: '12px',
                  fontWeight: theme.fontWeights.medium,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <Clock size={14} />
                Recent
              </div>

              {/* Recent Items */}
              {recentRepos.slice(0, 8).map((repo, index) => {
                const isHovered = hoveredIndex === index;
                return (
                  <Link
                    key={repo.full_name}
                    href={`/${repo.full_name}`}
                    onClick={() => setShowDropdown(false)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(-1)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 20px',
                      textDecoration: 'none',
                      backgroundColor: isHovered ? `${theme.colors.border}40` : 'transparent',
                      transition: 'background-color 0.1s ease',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={repo.owner.avatar_url || `https://github.com/${repo.owner.login}.png?size=32`}
                      alt={repo.owner.login}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '14px',
                          color: theme.colors.text,
                          fontFamily: theme.fonts.body,
                        }}
                      >
                        {repo.owner.login}
                        <span style={{ color: theme.colors.textMuted }}>/</span>
                        <span style={{ fontWeight: theme.fontWeights.medium }}>{repo.name}</span>
                      </span>
                    </div>
                    <button
                      onClick={(e) => removeRecentRepo(e, repo.full_name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '50%',
                        background: 'transparent',
                        color: theme.colors.textMuted,
                        cursor: 'pointer',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.15s ease, background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = theme.colors.border;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title="Remove from recent"
                    >
                      <X size={14} />
                    </button>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Featured Repos Carousel - shown when not searching */}
      {!searchQuery.trim() && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <FeaturedReposCarousel />
        </div>
      )}

      {/* Scrollable Content Area - only shown when searching */}
      {searchQuery.trim() && (
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
            <div style={{ marginTop: '32px' }}>
              <GitHubSearchResults
                searchQuery={searchQuery}
                userRepos={userRepos}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
