'use client';

/**
 * MobileRepoCard
 *
 * Full-height vertical card for mobile swipe experience.
 * Features File City image at top, repo info in middle, commits below.
 * Uses pre-rendered images instead of canvas for mobile performance.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { User } from 'lucide-react';
import { Logo } from '@principal-ai/logo-component';
import type { RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';

interface MobileRepoCardProps {
  summary: RepoActivitySummary;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const MobileRepoCard: React.FC<MobileRepoCardProps> = ({ summary }) => {
  const { theme } = useTheme();
  const [avatarLoaded, setAvatarLoaded] = useState(true);
  const [activeCommitIndex, setActiveCommitIndex] = useState(0);
  const commitsContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const initialScrollLeft = useRef<number>(0);
  const lastTouchX = useRef<number>(0);
  const lastTouchTime = useRef<number>(0);
  const velocity = useRef<number>(0);

  // File City image state - track loaded images by commit SHA
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Commit stats (additions, deletions, file count)
  const [commitStats, setCommitStats] = useState<Map<string, { additions: number; deletions: number; filesChanged: number }>>(new Map());

  // File City image URL based on active commit
  const activeCommit = summary.commits[activeCommitIndex];
  const baseImageUrl = `/api/file-city/${summary.owner}/${summary.repo}?width=800&height=800`;

  // Prefetch next commit's image
  const nextCommit = summary.commits[activeCommitIndex + 1];
  useEffect(() => {
    if (nextCommit && !loadedImages.has(nextCommit.sha) && !imageErrors.has(nextCommit.sha)) {
      const img = new Image();
      img.src = `${baseImageUrl}&commit=${nextCommit.sha}`;
      img.onload = () => {
        setLoadedImages(prev => new Set(prev).add(nextCommit.sha));
      };
    }
  }, [nextCommit, baseImageUrl, loadedImages, imageErrors]);

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // Handle scroll to update active commit indicator
  const handleCommitScroll = () => {
    if (!commitsContainerRef.current) return;
    const container = commitsContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.offsetWidth;
    const index = Math.round(scrollLeft / cardWidth);
    setActiveCommitIndex(Math.min(index, summary.commits.length - 1));
  };

  // Handle swipe on File City image to navigate commits
  const handleFileCityTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch && commitsContainerRef.current) {
      touchStartX.current = touch.clientX;
      lastTouchX.current = touch.clientX;
      lastTouchTime.current = Date.now();
      velocity.current = 0;
      initialScrollLeft.current = commitsContainerRef.current.scrollLeft;
    }
  };

  const handleFileCityTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !commitsContainerRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const now = Date.now();
    const dt = now - lastTouchTime.current;
    if (dt > 0) {
      velocity.current = (lastTouchX.current - touch.clientX) / dt;
    }
    lastTouchX.current = touch.clientX;
    lastTouchTime.current = now;

    const diff = touchStartX.current - touch.clientX;
    // Move carousel as user drags (1:1 mapping)
    commitsContainerRef.current.scrollLeft = initialScrollLeft.current + diff;
  };

  const handleFileCityTouchEnd = () => {
    if (!commitsContainerRef.current) return;

    const cardWidth = commitsContainerRef.current.offsetWidth;
    const currentScroll = commitsContainerRef.current.scrollLeft;

    // Apply momentum: velocity * multiplier gives projected final position
    const momentum = velocity.current * 150;
    const projectedScroll = currentScroll + momentum;

    // Snap to nearest commit based on projected position
    const nearestIndex = Math.round(projectedScroll / cardWidth);
    const clampedIndex = Math.max(0, Math.min(nearestIndex, summary.commits.length - 1));

    commitsContainerRef.current.scrollTo({
      left: clampedIndex * cardWidth,
      behavior: 'smooth',
    });

    touchStartX.current = null;
    velocity.current = 0;
  };

  // Batch fetch stats for all commits
  useEffect(() => {
    let cancelled = false;

    const fetchAllStats = async () => {
      const statsMap = new Map<string, { additions: number; deletions: number; filesChanged: number }>();

      await Promise.all(
        summary.commits.map(async (commit) => {
          try {
            const response = await fetch(
              `/api/github/repo/${summary.owner}/${summary.repo}/commits/${commit.sha}`
            );

            if (!response.ok || cancelled) return;

            const data = await response.json();
            if (data.stats || data.files) {
              statsMap.set(commit.sha, {
                additions: data.stats?.additions || 0,
                deletions: data.stats?.deletions || 0,
                filesChanged: data.files?.length || 0,
              });
            }
          } catch (err) {
            console.warn(`[MobileRepoCard] Failed to fetch stats for ${commit.sha}:`, err);
          }
        })
      );

      if (!cancelled) {
        setCommitStats(statsMap);
      }
    };

    fetchAllStats();

    return () => {
      cancelled = true;
    };
  }, [summary.commits, summary.owner, summary.repo]);


  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background,
        overflow: 'hidden',
      }}
    >
      {/* Hide scrollbar for webkit */}
      <style>{`
        .mobile-commits-carousel::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Header with avatar and repo name - Above File City */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          flexShrink: 0,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {avatarLoaded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://github.com/${summary.owner}.png?size=128`}
              alt={summary.owner}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={() => setAvatarLoaded(false)}
            />
          ) : (
            <User size={24} color={theme.colors.textMuted} />
          )}
        </div>

        {/* Name and commit count */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: theme.fontSizes[3],
              fontWeight: 700,
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary.repo}
          </h2>
          <div
            style={{
              fontSize: theme.fontSizes[1],
              color: theme.colors.textMuted,
              marginTop: spacing.xs,
            }}
          >
            {summary.owner} &middot; {summary.commitCount} commit{summary.commitCount !== 1 ? 's' : ''} in last {(() => {
              const oldestCommit = summary.commits[summary.commits.length - 1];
              if (!oldestCommit) return '';
              const now = new Date();
              const commitDate = new Date(oldestCommit.date);
              const diffMs = now.getTime() - commitDate.getTime();
              const diffMins = Math.floor(diffMs / (1000 * 60));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
              return `${diffHours} hr${diffHours !== 1 ? 's' : ''}`;
            })()}
          </div>
        </div>
      </div>

      {/* Commit Timeline - Author avatars with connecting lines */}
      {summary.commits.length > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: `12px ${spacing.md}px`,
            backgroundColor: theme.colors.surface,
            flexShrink: 0,
          }}
        >
          {summary.commits.map((commit, index) => (
            <React.Fragment key={commit.sha}>
              {/* Connecting line before avatar (except first) */}
              {index > 0 && (
                <div
                  style={{
                    width: 24,
                    height: 2,
                    backgroundColor: theme.colors.border,
                    marginLeft: 4,
                    marginRight: 4,
                  }}
                />
              )}
              {/* Author avatar */}
              <button
                onClick={() => {
                  if (commitsContainerRef.current) {
                    const cardWidth = commitsContainerRef.current.offsetWidth;
                    commitsContainerRef.current.scrollTo({
                      left: index * cardWidth,
                      behavior: 'smooth',
                    });
                  }
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: index === activeCommitIndex
                    ? `2px solid ${theme.colors.primary}`
                    : 'none',
                  opacity: index === activeCommitIndex ? 1 : 0.5,
                  cursor: 'pointer',
                  padding: 0,
                  background: 'none',
                  flexShrink: 0,
                }}
              >
                {commit.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={commit.authorAvatarUrl}
                    alt={commit.author}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: theme.colors.border,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.colors.textMuted,
                    }}
                  >
                    {commit.author.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* File City Section - Uses pre-rendered image for mobile performance */}
      {/* Swipe gestures here control the commit carousel below */}
      <div
        onTouchStart={handleFileCityTouchStart}
        onTouchMove={handleFileCityTouchMove}
        onTouchEnd={handleFileCityTouchEnd}
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          flexShrink: 0,
          backgroundColor: theme.colors.background,
          borderTop: `1px solid ${theme.colors.border}`,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none', // Capture all touch events for swipe handling
        }}
      >
        {/* Loading state - show logo when no images loaded yet */}
        {loadedImages.size === 0 && !imageErrors.has(activeCommit?.sha || '') && (
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: spacing.sm,
              color: theme.colors.textMuted,
              zIndex: 1,
            }}
          >
            <Logo width={120} height={120} color={theme.colors.textMuted} opacity={0.6} />
          </div>
        )}
        {/* Error state */}
        {activeCommit && imageErrors.has(activeCommit.sha) ? (
          <Logo width={80} height={80} color={theme.colors.textMuted} opacity={0.4} />
        ) : (
          <>
            {/* Render all commit images, stacked - only show active one */}
            {summary.commits.map((commit) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={commit.sha}
                src={`${baseImageUrl}&commit=${commit.sha}`}
                alt={`${summary.fullName} file structure`}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  opacity: commit.sha === activeCommit?.sha && loadedImages.has(commit.sha) ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                  pointerEvents: 'none',
                }}
                onLoad={() => {
                  setLoadedImages(prev => new Set(prev).add(commit.sha));
                }}
                onError={() => {
                  setImageErrors(prev => new Set(prev).add(commit.sha));
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Content Section - Commits */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Horizontal swipeable commits carousel */}
        <div
          ref={commitsContainerRef}
          className="mobile-commits-carousel"
          onScroll={handleCommitScroll}
          style={{
            flex: 1,
            display: 'flex',
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: spacing.md,
          }}
        >
          {summary.commits.map((commit) => (
            <div
              key={commit.sha}
              style={{
                flexShrink: 0,
                width: '100%',
                padding: spacing.md,
                backgroundColor: theme.colors.surface,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Commit author and time */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginBottom: spacing.sm,
                }}
              >
                {commit.authorAvatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={commit.authorAvatarUrl}
                    alt={commit.author}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.text,
                    fontWeight: 500,
                  }}
                >
                  {commit.author}
                </span>
                <span
                  style={{
                    fontSize: theme.fontSizes[0],
                    color: theme.colors.textMuted,
                    marginLeft: 'auto',
                  }}
                >
                  {formatRelativeTime(new Date(commit.date))}
                </span>
              </div>

              {/* Commit message */}
              <div
                style={{
                  flex: 1,
                  fontSize: theme.fontSizes[2],
                  color: theme.colors.text,
                  lineHeight: 1.5,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {commit.message}
              </div>

              {/* Commit stats and SHA */}
              <div
                style={{
                  marginTop: spacing.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  flexWrap: 'wrap',
                }}
              >
                <code
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: 'monospace',
                    color: theme.colors.textMuted,
                  }}
                >
                  {commit.sha.slice(0, 7)}
                </code>
                {(() => {
                  const stats = commitStats.get(commit.sha);
                  if (!stats) return null;
                  if (stats.additions === 0 && stats.deletions === 0 && stats.filesChanged === 0) return null;
                  return (
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                      }}
                    >
                      {stats.additions > 0 && (
                        <span style={{ color: theme.colors.success }}>
                          added {stats.additions} line{stats.additions !== 1 ? 's' : ''}
                        </span>
                      )}
                      {stats.additions > 0 && stats.deletions > 0 && ' '}
                      {stats.deletions > 0 && (
                        <span style={{ color: theme.colors.error }}>
                          removed {stats.deletions} line{stats.deletions !== 1 ? 's' : ''}
                        </span>
                      )}
                      {(stats.additions > 0 || stats.deletions > 0) && stats.filesChanged > 0 && ' '}
                      {stats.filesChanged > 0 && (
                        <span style={{ color: theme.colors.primary }}>
                          in {stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
};

export default MobileRepoCard;
