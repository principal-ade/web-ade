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

// Simple placeholder shown while CardBackCodeCity loads
const CardPlaceholder = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}
  />
);

const CardBackCodeCity = dynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.CardBackCodeCity
    ),
  { ssr: false, loading: () => <CardPlaceholder /> }
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
  forkOwner?: string;
  forkName?: string;
}

/**
 * Extended entry type with fork navigation info
 */
interface FeaturedEntry extends AlexandriaEntryWithMetrics {
  forkOwner?: string;
  forkName?: string;
}

/**
 * Transform GitHub API repo data to AlexandriaEntryWithMetrics format
 * Uses forkOwner/forkName for navigation when available (to navigate to X-File-City forks)
 * Preserves parent owner info for display (avatar, etc.)
 */
function toAlexandriaEntry(repo: FeaturedRepo, fileCount?: number): FeaturedEntry {
  const navigationOwner = repo.forkOwner || repo.owner.login;
  const navigationName = repo.forkName || repo.name;
  return {
    name: repo.name, // Display name (parent repo name)
    path: `/${navigationOwner}/${navigationName}` as AlexandriaEntryWithMetrics['path'],
    registeredAt: new Date().toISOString(),
    hasViews: false,
    viewCount: 0,
    views: [],
    // Fork info for navigation
    forkOwner: repo.forkOwner,
    forkName: repo.forkName,
    github: {
      id: repo.full_name,
      owner: repo.owner.login, // Keep parent owner for display (avatar)
      name: repo.name, // Keep parent name for display
      description: repo.description || undefined,
      stars: repo.stargazers_count,
      license: repo.license?.spdx_id,
      primaryLanguage: repo.language || undefined,
      topics: repo.topics,
      createdAt: repo.created_at,
      lastUpdated: new Date().toISOString(),
    },
    metrics: fileCount !== undefined ? { fileCount } : undefined,
  };
}

// Card dimensions
const CARD_MIN_WIDTH = 180;
const CARD_MAX_WIDTH = 280;
const CARD_ASPECT_RATIO = 6 / 10; // width / height (matches CardBackCodeCity 6 cols / 10 rows)
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
  const [revealedCount, setRevealedCount] = useState(0);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
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

  // Fetch file counts for repos (uses shared cache with file-city renderer)
  useEffect(() => {
    if (featuredRepos.length === 0) return;

    let mounted = true;

    async function fetchFileCounts() {
      const newCounts: Record<string, number> = {};

      // Fetch in parallel with a concurrency limit
      const BATCH_SIZE = 5;
      for (let i = 0; i < featuredRepos.length; i += BATCH_SIZE) {
        const batch = featuredRepos.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (repo) => {
            const owner = repo.forkOwner || repo.owner.login;
            const name = repo.forkName || repo.name;
            const key = repo.full_name;

            try {
              const tree = await trpc.github.getTree.query({
                owner,
                repo: name,
              });
              if (mounted) {
                // Count only files (blobs), not directories (trees)
                const fileCount = tree.tree.filter((item) => item.type === 'blob').length;
                newCounts[key] = fileCount;
              }
            } catch (error) {
              console.warn(`Failed to fetch tree for ${owner}/${name}:`, error);
            }
          })
        );

        // Update state after each batch for progressive loading
        if (mounted && Object.keys(newCounts).length > 0) {
          setFileCounts((prev) => ({ ...prev, ...newCounts }));
        }
      }
    }

    fetchFileCounts();

    return () => {
      mounted = false;
    };
  }, [featuredRepos]);

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

  // Transform to Alexandria entries (with file counts when available)
  const entries = useMemo(() => {
    if (!filteredAndSortedRepos) return [];
    return filteredAndSortedRepos.map((repo) =>
      toAlexandriaEntry(repo, fileCounts[repo.full_name])
    );
  }, [filteredAndSortedRepos, fileCounts]);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(10);
  }, [searchFilter, languageFilter, sortOption]);

  // Staggered card flip reveal animation after loading completes
  useEffect(() => {
    if (isLoading) {
      setRevealedCount(0);
      return;
    }

    // Start revealing cards one by one
    const totalCards = Math.min(visibleCount, entries.length);
    if (revealedCount >= totalCards) return;

    const timer = setTimeout(() => {
      setRevealedCount((prev) => prev + 1);
    }, 80); // 80ms between each card flip

    return () => clearTimeout(timer);
  }, [isLoading, revealedCount, visibleCount, entries.length]);

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

  // Only hide if there are no featured repos at all and not loading
  if (!isLoading && featuredRepos.length === 0) {
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
            opacity: isLoading ? 0.5 : 1,
            pointerEvents: isLoading ? 'none' : 'auto',
            transition: 'opacity 0.2s ease',
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
      {!isLoading && entries.length === 0 && (searchFilter.trim() || languageFilter !== 'all') && (
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

      {/* Grid with flip animation */}
      <style>
        {`
          .card-flip-container {
            perspective: 1000px;
          }
          .card-flip-inner {
            position: relative;
            width: 100%;
            height: 100%;
            transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            transform-style: preserve-3d;
          }
          .card-flip-inner.flipped {
            transform: rotateY(180deg);
          }
          .card-flip-front,
          .card-flip-back {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
          }
          .card-flip-back {
            transform: rotateY(180deg);
          }
        `}
      </style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_MIN_WIDTH}px, ${CARD_MAX_WIDTH}px))`,
          gap: `${CARD_GAP}px`,
          justifyContent: 'center',
          flex: 1,
        }}
      >
        {isLoading ? (
          // Loading state - show card backs
          loadingAnimations.map((_, i) => (
            <div
              key={`loading-${i}`}
              className="card-flip-container"
              style={{ aspectRatio: `${CARD_ASPECT_RATIO}` }}
            >
              <div className="card-flip-inner">
                <div className="card-flip-front">
                  <CardBackCodeCity width={CARD_MAX_WIDTH} />
                </div>
              </div>
            </div>
          ))
        ) : (
          // Loaded state - flip cards to reveal content
          visibleEntries.map((entry, index) => {
            const isRevealed = index < revealedCount;
            return (
              <div
                key={entry.name}
                className="card-flip-container"
                style={{ aspectRatio: `${CARD_ASPECT_RATIO}` }}
              >
                <div className={`card-flip-inner ${isRevealed ? 'flipped' : ''}`}>
                  {/* Front - Card back (shown initially) */}
                  <div className="card-flip-front">
                    <CardBackCodeCity width={CARD_MAX_WIDTH} />
                  </div>
                  {/* Back - Real card (shown after flip) */}
                  <div className="card-flip-back">
                    <Link
                      href={`/${entry.forkOwner || entry.github?.owner}/${entry.forkName || entry.name}?config=tour`}
                      style={{ textDecoration: 'none', display: 'block', width: '100%', height: '100%' }}
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
                          customImage={`/api/file-city/${entry.forkOwner || entry.github?.owner}/${entry.forkName || entry.github?.name}?nocache=1`}
                        />
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load More button - show after all visible cards are revealed */}
      {!isLoading && hasMore && revealedCount >= visibleEntries.length && (
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
