'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ChevronLeft, ChevronRight, Star, GitFork, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Repository {
  id: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
}

interface CuratedCollection {
  id: string;
  name: string;
  description: string;
  repositories: Repository[];
}

interface GalleryCarouselViewProps {
  collections: CuratedCollection[];
  initialCollectionIndex?: number;
}

export function GalleryCarouselView({
  collections,
  initialCollectionIndex = 0,
}: GalleryCarouselViewProps) {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(initialCollectionIndex);

  const currentCollection = collections[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < collections.length - 1;

  const goToPrevious = () => {
    if (hasPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, hasPrevious, hasNext]);

  if (!currentCollection || collections.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: theme.colors.textMuted,
        }}
      >
        <p>No collections available</p>
      </div>
    );
  }

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
          paddingTop: 'min(10vh, 80px)',
        }}
      >
        {/* Gallery Title */}
        <h1
          style={{
            margin: 0,
            marginBottom: '8px',
            fontSize: '42px',
            fontWeight: theme.fontWeights.bold,
            fontFamily: theme.fonts.body,
          }}
        >
          <span style={{ color: theme.colors.text }}>Principal</span>
          {' '}
          <span style={{ color: theme.colors.primary }}>AI</span>
          {' '}
          <span style={{ color: theme.colors.text }}>Gallery</span>
        </h1>

        {/* Collection Name */}
        <h2
          style={{
            margin: 0,
            marginTop: '24px',
            fontSize: '28px',
            fontWeight: theme.fontWeights.semibold,
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textAlign: 'center',
          }}
        >
          {currentCollection.name}
        </h2>

        {/* Collection Description */}
        {currentCollection.description && (
          <p
            style={{
              margin: 0,
              marginTop: '12px',
              fontSize: '16px',
              color: theme.colors.textMuted,
              textAlign: 'center',
              maxWidth: '600px',
              lineHeight: 1.5,
            }}
          >
            {currentCollection.description}
          </p>
        )}

        {/* Navigation Dots */}
        {collections.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginTop: '24px',
            }}
          >
            {collections.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                style={{
                  width: index === currentIndex ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: index === currentIndex ? theme.colors.primary : theme.colors.border,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                aria-label={`Go to collection ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '900px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {/* Repository Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
              width: '100%',
            }}
          >
            {currentCollection.repositories.map((repo) => (
              <RepoCard key={repo.id} repo={repo} theme={theme} />
            ))}
          </div>

          {currentCollection.repositories.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                color: theme.colors.textMuted,
              }}
            >
              <p>No repositories in this collection</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Arrows */}
      {collections.length > 1 && (
        <>
          {hasPrevious && (
            <button
              onClick={goToPrevious}
              style={{
                position: 'fixed',
                left: '24px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: `1px solid ${theme.colors.border}`,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.colors.primary;
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = theme.colors.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.colors.surface;
                e.currentTarget.style.color = theme.colors.text;
                e.currentTarget.style.borderColor = theme.colors.border;
              }}
              aria-label="Previous collection"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {hasNext && (
            <button
              onClick={goToNext}
              style={{
                position: 'fixed',
                right: '24px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: `1px solid ${theme.colors.border}`,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.colors.primary;
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = theme.colors.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.colors.surface;
                e.currentTarget.style.color = theme.colors.text;
                e.currentTarget.style.borderColor = theme.colors.border;
              }}
              aria-label="Next collection"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

const RepoCard: React.FC<{
  repo: Repository;
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
          src={repo.owner.avatar_url || `https://github.com/${repo.owner.login}.png?size=64`}
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

      {/* Footer: Stats - only show if we have data */}
      {(repo.language || repo.stargazers_count > 0 || repo.forks_count > 0) && (
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
          {repo.stargazers_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Star size={12} />
              {formatCount(repo.stargazers_count)}
            </span>
          )}
          {repo.forks_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <GitFork size={12} />
              {formatCount(repo.forks_count)}
            </span>
          )}
        </div>
      )}
    </Link>
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
