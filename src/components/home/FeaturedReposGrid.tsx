'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronDown, Search, X } from 'lucide-react';
import type { AlexandriaEntryWithMetrics } from '@industry-theme/repository-composition-panels';
import { trpc } from '@/lib/trpc/client';

type SortOption = 'stars' | 'name-asc' | 'name-desc' | 'newest' | 'oldest';

// Dynamic import to avoid SSR issues with PixiJS (requires document)
const RepoCardStatic = dynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.RepoCardStatic
    ),
  { ssr: false }
);

const CardBackCodeCity = dynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.CardBackCodeCity
    ),
  { ssr: false }
);

interface FeaturedRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
  stargazers_count: number;
  language: string | null;
  license?: {
    spdx_id: string;
  } | null;
  topics?: string[];
  html_url: string;
  created_at?: string;
}

/**
 * Transform GitHub API repo data to AlexandriaEntryWithMetrics format
 */
function toAlexandriaEntry(repo: FeaturedRepo): AlexandriaEntryWithMetrics {
  return {
    name: repo.name,
    path: `/${repo.full_name}` as AlexandriaEntryWithMetrics['path'],
    registeredAt: new Date().toISOString(),
    hasViews: false,
    viewCount: 0,
    views: [],
    github: {
      id: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      description: repo.description || undefined,
      stars: repo.stargazers_count,
      license: repo.license?.spdx_id,
      primaryLanguage: repo.language || undefined,
      topics: repo.topics,
      createdAt: repo.created_at,
      lastUpdated: new Date().toISOString(),
    },
  };
}

// Card dimensions
const CARD_MIN_WIDTH = 180;
const CARD_MAX_WIDTH = 280;
const CARD_ASPECT_RATIO = 7 / 10; // width / height
const CARD_GAP = 32;

export function FeaturedReposGrid() {
  const { theme } = useTheme();
  const [featuredRepos, setFeaturedRepos] = useState<FeaturedRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);
  const [searchFilter, setSearchFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SortOption>('stars');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + 10, featuredRepos.length));
  };

  // Fetch featured repos on mount
  useEffect(() => {
    let mounted = true;

    async function fetchRepos() {
      try {
        const data = await trpc.github.getFeaturedRepos.query();
        if (mounted) {
          setFeaturedRepos(data);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch featured repos:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchRepos();

    return () => {
      mounted = false;
    };
  }, []);

  // Extract unique languages for filter dropdown
  const availableLanguages = useMemo(() => {
    const languages = featuredRepos
      .map((repo) => repo.language)
      .filter((lang): lang is string => lang !== null);
    return [...new Set(languages)].sort();
  }, [featuredRepos]);

  // Filter and sort repos
  const filteredAndSortedRepos = useMemo(() => {
    let repos = [...featuredRepos];

    // Apply text search filter
    if (searchFilter.trim()) {
      const searchLower = searchFilter.toLowerCase().trim();
      repos = repos.filter((repo) => {
        const nameMatch = repo.full_name.toLowerCase().includes(searchLower);
        const descMatch = repo.description?.toLowerCase().includes(searchLower);
        const topicsMatch = repo.topics?.some((t) => t.toLowerCase().includes(searchLower));
        return nameMatch || descMatch || topicsMatch;
      });
    }

    // Apply language filter
    if (languageFilter !== 'all') {
      repos = repos.filter((repo) => repo.language === languageFilter);
    }

    // Apply sorting
    switch (sortOption) {
      case 'stars':
        repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
        break;
      case 'name-asc':
        repos.sort((a, b) => a.full_name.toLowerCase().localeCompare(b.full_name.toLowerCase()));
        break;
      case 'name-desc':
        repos.sort((a, b) => b.full_name.toLowerCase().localeCompare(a.full_name.toLowerCase()));
        break;
      case 'newest':
        repos.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case 'oldest':
        repos.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });
        break;
    }

    return repos;
  }, [featuredRepos, searchFilter, languageFilter, sortOption]);

  // Transform to Alexandria entries
  const entries = useMemo(() => {
    if (!filteredAndSortedRepos) return [];
    return filteredAndSortedRepos.map(toAlexandriaEntry);
  }, [filteredAndSortedRepos]);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(10);
  }, [searchFilter, languageFilter, sortOption]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(e.target as Node)
      ) {
        setShowLanguageDropdown(false);
      }
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(e.target as Node)
      ) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate stable random values for loading animation
  const loadingAnimations = useMemo(() =>
    Array.from({ length: 10 }).map(() => ({
      duration: 1.5 + Math.random() * 1,
      delay: Math.random() * 2,
    })),
  []);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '32px',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <h2
          style={{
            margin: '0 0 24px 0',
            fontSize: '24px',
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
            textAlign: 'center',
          }}
        >
          Featured Projects
        </h2>

        {/* Loading grid */}
        <style>
          {`
            @keyframes cardBounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-12px); }
            }
          `}
        </style>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_MIN_WIDTH}px, ${CARD_MAX_WIDTH}px))`,
            gap: `${CARD_GAP}px`,
            justifyContent: 'center',
          }}
        >
          {loadingAnimations.map((anim, i) => (
            <div
              key={i}
              style={{
                aspectRatio: `${CARD_ASPECT_RATIO}`,
                width: '100%',
                animation: `cardBounce ${anim.duration}s ease-in-out infinite`,
                animationDelay: `${anim.delay}s`,
              }}
            >
              <CardBackCodeCity width={CARD_MAX_WIDTH} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Only hide if there are no featured repos at all (not when filters yield no results)
  if (featuredRepos.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '32px',
        overflow: 'auto',
      }}
    >
      {/* Header with Filter and Sort Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
          }}
        >
          Featured Projects
        </h2>

        {/* Filter and Sort Controls */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.colors.textMuted,
              pointerEvents: 'none',
            }}
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Filter projects..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              width: '200px',
              padding: '8px 32px 8px 36px',
              fontSize: '14px',
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
            }}
          />
          {searchFilter && (
            <button
              onClick={() => {
                setSearchFilter('');
                searchInputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                background: theme.colors.border,
                color: theme.colors.textMuted,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.colors.primary;
                e.currentTarget.style.color = theme.colors.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = theme.colors.border;
                e.currentTarget.style.color = theme.colors.textMuted;
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Language Filter */}
        <div ref={languageDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowLanguageDropdown(!showLanguageDropdown);
              setShowSortDropdown(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              fontFamily: theme.fonts.body,
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.text,
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
            }}
          >
            Language: {languageFilter === 'all' ? 'All' : languageFilter}
            <ChevronDown size={16} />
          </button>
          {showLanguageDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                minWidth: '150px',
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 100,
                maxHeight: '300px',
                overflow: 'auto',
              }}
            >
              <div
                onClick={() => {
                  setLanguageFilter('all');
                  setShowLanguageDropdown(false);
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontFamily: theme.fonts.body,
                  color: languageFilter === 'all' ? theme.colors.primary : theme.colors.text,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${theme.colors.border}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                All Languages
              </div>
              {availableLanguages.map((lang) => (
                <div
                  key={lang}
                  onClick={() => {
                    setLanguageFilter(lang);
                    setShowLanguageDropdown(false);
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontFamily: theme.fonts.body,
                    color: languageFilter === lang ? theme.colors.primary : theme.colors.text,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${theme.colors.border}40`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {lang}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <div ref={sortDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowLanguageDropdown(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              fontFamily: theme.fonts.body,
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.text,
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
            }}
          >
            Sort: {sortOption === 'stars' ? 'Stars' : sortOption === 'name-asc' ? 'Name (A-Z)' : sortOption === 'name-desc' ? 'Name (Z-A)' : sortOption === 'newest' ? 'Newest' : 'Oldest'}
            <ChevronDown size={16} />
          </button>
          {showSortDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                minWidth: '150px',
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 100,
              }}
            >
              {[
                { value: 'stars' as const, label: 'Stars' },
                { value: 'name-asc' as const, label: 'Name (A-Z)' },
                { value: 'name-desc' as const, label: 'Name (Z-A)' },
                { value: 'newest' as const, label: 'Newest' },
                { value: 'oldest' as const, label: 'Oldest' },
              ].map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    setSortOption(option.value);
                    setShowSortDropdown(false);
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontFamily: theme.fonts.body,
                    color: sortOption === option.value ? theme.colors.primary : theme.colors.text,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${theme.colors.border}40`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {option.label}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* No results message */}
      {entries.length === 0 && (searchFilter.trim() || languageFilter !== 'all') && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: '16px',
          }}
        >
          No projects found
          {searchFilter.trim() && ` matching "${searchFilter.trim()}"`}
          {languageFilter !== 'all' && ` for ${languageFilter}`}
          .{' '}
          <button
            onClick={() => {
              setSearchFilter('');
              setLanguageFilter('all');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.primary,
              cursor: 'pointer',
              fontFamily: theme.fonts.body,
              fontSize: '16px',
              textDecoration: 'underline',
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Grid */}
      {entries.length > 0 && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_MIN_WIDTH}px, ${CARD_MAX_WIDTH}px))`,
          gap: `${CARD_GAP}px`,
          justifyContent: 'center',
          flex: 1,
        }}
      >
        {visibleEntries.map((entry) => (
          <Link
            key={entry.name}
            href={`/${entry.github?.owner}/${entry.name}`}
            style={{
              textDecoration: 'none',
              aspectRatio: `${CARD_ASPECT_RATIO}`,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <RepoCardStatic
                repository={entry}
                cardTheme="dark"
                width={CARD_MAX_WIDTH}
                height={Math.round(CARD_MAX_WIDTH / CARD_ASPECT_RATIO)}
                spriteSize={200}
                customImage={`/api/file-city/${entry.github?.owner}/${entry.name}?nocache=1`}
              />
            </div>
          </Link>
        ))}
      </div>
      )}

      {/* Load More button */}
      {hasMore && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '32px',
          }}
        >
          <button
            onClick={handleLoadMore}
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: theme.fontWeights.medium,
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
              background: theme.colors.surface,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
              e.currentTarget.style.background = theme.colors.secondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
              e.currentTarget.style.background = theme.colors.surface;
            }}
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
