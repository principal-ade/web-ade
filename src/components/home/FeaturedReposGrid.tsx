'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { AlexandriaEntryWithMetrics } from '@industry-theme/repository-composition-panels';
import { trpc } from '@/lib/trpc/client';

// Dynamic import to avoid SSR issues with PixiJS (requires document)
const RepoCardStatic = dynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.RepoCardStatic
    ),
  { ssr: false }
);

const CardBack = dynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.CardBack
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

  // Transform to Alexandria entries
  const entries = useMemo(() => {
    if (!featuredRepos) return [];
    return featuredRepos.map(toAlexandriaEntry);
  }, [featuredRepos]);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

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
              <CardBack width={CARD_MAX_WIDTH} height={CARD_MAX_WIDTH / CARD_ASPECT_RATIO} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
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

      {/* Grid */}
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
              />
            </div>
          </Link>
        ))}
      </div>

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
