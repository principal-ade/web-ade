'use client';

import { useState, useRef, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  ChevronLeft,
  ChevronRight,
  Star,
  Users,
  Code2,
  GitCommit,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CarouselContributor {
  name: string;
  email?: string;
  commits: number;
  lines?: number;
  login?: string;
}

export interface CarouselRepo {
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  visitorCount: number;
  lastVisitedAt: string;
  topContributors: CarouselContributor[];
  totalLines?: number;
}

export interface CarouselCache {
  version: number;
  builtAt: string;
  sourceFeedUpdatedAt: string;
  repoCount: number;
  repos: CarouselRepo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function repoInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#000080',
};

function languageColor(language: string | null): string | undefined {
  if (!language) return undefined;
  return LANGUAGE_COLORS[language] ?? '#6b7280';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommunityCarouselProps {
  data?: CarouselCache | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommunityCarousel({
  data,
  loading = false,
  error = null,
  onRetry,
}: CommunityCarouselProps) {
  const { theme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const repos = data?.repos ?? [];

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const cardWidth = 340;
    const gap = 16;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -(cardWidth + gap) : cardWidth + gap,
      behavior: 'smooth',
    });
  }, []);

  if (loading) {
    return (
      <div className="flex gap-4 px-1" style={{ padding: '8px 4px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} theme={theme} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '48px 32px',
          textAlign: 'center',
          color: theme.colors.textMuted,
        }}
      >
        <div style={{ fontSize: theme.fontSizes[2], marginBottom: 12 }}>
          Failed to load community repos
        </div>
        <div style={{ fontSize: theme.fontSizes[1], marginBottom: 16 }}>
          {error}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.surface,
              color: theme.colors.text,
              cursor: 'pointer',
              fontSize: theme.fontSizes[1],
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div
        style={{
          padding: '48px 32px',
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes[1],
        }}
      >
        <div style={{ marginBottom: 8, fontSize: theme.fontSizes[3] }}>
          <Users size={32} />
        </div>
        No repos visited yet
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Left Arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          style={{
            position: 'absolute',
            left: -18,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            zIndex: 10,
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Right Arrow */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          style={{
            position: 'absolute',
            right: -18,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            zIndex: 10,
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Carousel track */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="carousel-track"
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          padding: '8px 4px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {repos.map((repo) => (
          <RepoCard key={repo.fullName} repo={repo} theme={theme} />
        ))}
      </div>

      <style>{`
        .carousel-track::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepoCard
// ---------------------------------------------------------------------------

const RepoCard: React.FC<{
  repo: CarouselRepo;
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ repo, theme }) => {
  const color = languageColor(repo.language);

  return (
    <Link
      href={`/${repo.owner}/${repo.repo}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        minWidth: 320,
        maxWidth: 320,
        borderRadius: 12,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        scrollSnapAlign: 'start',
        flexShrink: 0,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header: initials badge + name */}
      <div
        style={{
          padding: '16px 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${color ?? '#6b7280'}, ${color ?? '#6b7280'}88)`,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: theme.fontWeights.bold,
            fontSize: theme.fontSizes[1],
            flexShrink: 0,
          }}
        >
          {repoInitials(repo.repo)}
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {repo.repo}
          </div>
          <div
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
              marginTop: 2,
            }}
          >
            {repo.owner}
          </div>
        </div>
      </div>

      {/* Description */}
      {repo.description && (
        <div
          style={{
            padding: '12px 16px 0',
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {repo.description}
        </div>
      )}

      {/* Stats row */}
      <div
        style={{
          padding: '12px 16px 0',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Star size={14} style={{ color: theme.colors.textMuted }} />
          <span
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
            }}
          >
            {formatNumber(repo.stargazersCount)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={14} style={{ color: theme.colors.textMuted }} />
          <span
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
            }}
          >
            {repo.visitorCount} visits
          </span>
        </div>
        {repo.totalLines !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Code2 size={14} style={{ color: theme.colors.textMuted }} />
            <span
              style={{
                fontSize: theme.fontSizes[0],
                color: theme.colors.textMuted,
              }}
            >
              {formatNumber(repo.totalLines)} lines
            </span>
          </div>
        )}
      </div>

      {/* Top committer and top line contributor */}
      {repo.topContributors.length > 0 && (() => {
        const topCommits = repo.topContributors.reduce((best, c) =>
          c.commits > best.commits ? c : best
        );
        const topLines = repo.topContributors.reduce((best, c) =>
          (c.lines ?? 0) > (best.lines ?? 0) ? c : best
        );

        return (
          <div
            style={{
              padding: '12px 16px 16px',
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <ContributorCard
              label="Most commits"
              contributor={topCommits}
              theme={theme}
            />
            <ContributorCard
              label="Most lines"
              contributor={topLines}
              theme={theme}
            />
          </div>
        );
      })()}

      {/* Footer: last visited + open */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: `1px solid ${theme.colors.border}`,
          fontSize: theme.fontSizes[0],
          color: theme.colors.textMuted,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Active {relativeTime(repo.lastVisitedAt)}</span>
        <ExternalLink
          size={14}
          style={{ color: theme.colors.textMuted, opacity: 0.5 }}
        />
      </div>
    </Link>
  );
};

// ---------------------------------------------------------------------------
// ContributorCard
// ---------------------------------------------------------------------------

const ContributorCard: React.FC<{
  label: string;
  contributor: CarouselContributor;
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ label, contributor: c, theme }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 10,
      backgroundColor: `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`,
      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primary}88)`,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: theme.fontWeights.bold,
        fontSize: theme.fontSizes[1],
        flexShrink: 0,
      }}
    >
      {c.name.charAt(0).toUpperCase()}
    </div>
    <div className="min-w-0 flex-1">
      <div
        style={{
          fontSize: theme.fontSizes[0],
          color: theme.colors.textMuted,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: theme.fontSizes[1],
          fontWeight: theme.fontWeights.semibold,
          color: theme.colors.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {c.name}
      </div>
    </div>
    <div style={{ flexShrink: 0 }}>
      {label === 'Most commits' && (
        <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
          <GitCommit
            size={13}
            style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }}
          />
          {c.commits}
        </span>
      )}
      {label === 'Most lines' && c.lines !== undefined && (
        <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
          <Code2
            size={13}
            style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }}
          />
          {formatNumber(c.lines)}
        </span>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// SkeletonCard
// ---------------------------------------------------------------------------

const SkeletonCard: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ theme }) => {
  return (
    <div
      style={{
        minWidth: 320,
        maxWidth: 320,
        borderRadius: 12,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: theme.colors.border,
          }}
        />
        <div className="flex-1 space-y-2">
          <div
            style={{
              width: '70%',
              height: 14,
              borderRadius: 4,
              backgroundColor: theme.colors.border,
            }}
          />
          <div
            style={{
              width: '40%',
              height: 10,
              borderRadius: 4,
              backgroundColor: theme.colors.border,
            }}
          />
        </div>
      </div>
      <div
        style={{
          width: '100%',
          height: 12,
          borderRadius: 4,
          backgroundColor: theme.colors.border,
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: 12,
        }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 60,
              height: 12,
              borderRadius: 4,
              backgroundColor: theme.colors.border,
            }}
          />
        ))}
      </div>
      <div
        style={{
          width: '100%',
          height: 1,
          backgroundColor: theme.colors.border,
          margin: '4px 0',
        }}
      />
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2"
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: theme.colors.border,
              }}
            />
            <div
              style={{
                width: '50%',
                height: 10,
                borderRadius: 4,
                backgroundColor: theme.colors.border,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
