'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
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

// Batch size for progressive sprite rendering
const RENDER_BATCH_SIZE = 10;

export function FeaturedReposCarousel() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [featuredRepos, setFeaturedRepos] = useState<FeaturedRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [renderedCount, setRenderedCount] = useState(RENDER_BATCH_SIZE);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; scrollPos: number } | null>(null);
  const hasDraggedRef = useRef(false);

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

  // Duplicate entries for seamless looping
  const duplicatedEntries = useMemo(() => {
    if (entries.length === 0) return [];
    // Triple the entries for smooth infinite scroll
    return [...entries, ...entries, ...entries];
  }, [entries]);

  // Progressive rendering: load more sprites as we scroll
  useEffect(() => {
    if (duplicatedEntries.length === 0) return;

    const cardWidth = 368;
    // Calculate which cards are visible based on scroll position
    const visibleStart = Math.floor(scrollPosition / cardWidth);
    const visibleEnd = visibleStart + 10; // Assume ~10 cards visible at once

    // If we're approaching unrendered cards, render more
    if (visibleEnd + 5 >= renderedCount && renderedCount < duplicatedEntries.length) {
      setRenderedCount((prev) =>
        Math.min(prev + RENDER_BATCH_SIZE, duplicatedEntries.length)
      );
    }
  }, [scrollPosition, renderedCount, duplicatedEntries.length]);

  // Auto-scroll animation
  useEffect(() => {
    if (entries.length === 0 || isDragging) return;

    const cardWidth = 368; // Card width + gap
    const totalWidth = entries.length * cardWidth;

    const interval = setInterval(() => {
      setScrollPosition((prev) => {
        const newPos = prev + 0.5; // Slow scroll speed
        // Reset when we've scrolled through one full set
        if (newPos >= totalWidth) {
          return 0;
        }
        return newPos;
      });
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [entries.length, isDragging]);

  // Handle drag start
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = { x: clientX, scrollPos: scrollPosition };
  };

  // Handle drag move
  const handleDragMove = (clientX: number) => {
    if (!isDragging || !dragStartRef.current) return;

    const delta = dragStartRef.current.x - clientX;
    if (Math.abs(delta) > 5) {
      hasDraggedRef.current = true;
    }

    const cardWidth = 368;
    // Use 5 as fallback count during loading state (15 cards / 3 for looping)
    const cardCount = entries.length > 0 ? entries.length : 5;
    const totalWidth = cardCount * cardWidth;
    let newPos = dragStartRef.current.scrollPos + delta;

    // Wrap around for infinite scroll
    while (newPos < 0) newPos += totalWidth;
    while (newPos >= totalWidth) newPos -= totalWidth;

    setScrollPosition(newPos);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      handleDragEnd();
    }
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      handleDragStart(touch.clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      handleDragMove(touch.clientX);
    }
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Prevent link navigation if we just dragged
  const handleLinkClick = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.preventDefault();
      hasDraggedRef.current = false;
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          width: '100%',
          overflow: 'hidden',
          padding: '16px 0',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            display: 'flex',
            gap: '48px',
            transform: `translateX(-${scrollPosition}px)`,
            transition: 'none',
          }}
        >
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
              }}
            >
              <CardBack width={320} height={450} />
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
        width: '100%',
        overflow: 'hidden',
        padding: '16px 0',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Carousel container */}
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          gap: '48px',
          transform: `translateX(-${scrollPosition}px)`,
          transition: 'none',
        }}
      >
        {duplicatedEntries.map((entry, index) => {
          const shouldRender = index < renderedCount;

          return (
            <Link
              key={`${entry.name}-${index}`}
              href={`/${entry.github?.owner}/${entry.name}`}
              onClick={handleLinkClick}
              draggable={false}
              style={{
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '320px',
                  height: '450px',
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
                {shouldRender ? (
                  <RepoCardStatic
                    repository={entry}
                    cardTheme="dark"
                    width={320}
                    height={450}
                    spriteSize={280}
                  />
                ) : (
                  <CardBack width={320} height={450} />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Label */}
      <div
        style={{
          textAlign: 'center',
          marginTop: '16px',
        }}
      >
        <span
          style={{
            fontSize: '14px',
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}
        >
          Featured Projects
        </span>
      </div>

      {/* Fade edges */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '80px',
          height: '100%',
          background: `linear-gradient(to right, ${theme.colors.background}, transparent)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '80px',
          height: '100%',
          background: `linear-gradient(to left, ${theme.colors.background}, transparent)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
