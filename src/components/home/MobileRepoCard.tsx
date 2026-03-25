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
import { User, FolderGit2 } from 'lucide-react';
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

  // File City image state - track loaded images by commit SHA
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Commit stats (additions, deletions, file count)
  const [commitStats, setCommitStats] = useState<Map<string, { additions: number; deletions: number; filesChanged: number }>>(new Map());

  // File City image URL based on active commit
  const activeCommit = summary.commits[activeCommitIndex];
  const baseImageUrl = `/api/file-city/${summary.owner}/${summary.repo}?width=800&height=800`;
  const fileCityImageUrl = activeCommit
    ? `${baseImageUrl}&commit=${activeCommit.sha}`
    : baseImageUrl;

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

      {/* File City Section - Uses pre-rendered image for mobile performance */}
      <div
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
        }}
      >
        {activeCommit && !loadedImages.has(activeCommit.sha) && !imageErrors.has(activeCommit.sha) && (
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
            <FolderGit2 size={32} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: theme.fontSizes[0] }}>Loading...</span>
          </div>
        )}
        {activeCommit && imageErrors.has(activeCommit.sha) ? (
          <FolderGit2 size={64} color={theme.colors.textMuted} style={{ opacity: 0.3 }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={activeCommit?.sha || 'no-commit'}
            src={fileCityImageUrl}
            alt={`${summary.fullName} file structure`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: activeCommit && loadedImages.has(activeCommit.sha) ? 1 : 0,
              transition: 'opacity 0.2s ease',
            }}
            onLoad={() => {
              if (activeCommit) {
                setLoadedImages(prev => new Set(prev).add(activeCommit.sha));
              }
            }}
            onError={() => {
              if (activeCommit) {
                setImageErrors(prev => new Set(prev).add(activeCommit.sha));
              }
            }}
          />
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
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            gap: spacing.md,
            paddingBottom: spacing.md,
          }}
        >
          {summary.commits.map((commit) => (
            <div
              key={commit.sha}
              style={{
                flexShrink: 0,
                width: '100%',
                scrollSnapAlign: 'start',
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

        {/* Carousel dots indicator */}
        {summary.commits.length > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: spacing.xs,
              paddingBottom: spacing.md,
            }}
          >
            {summary.commits.map((commit, index) => (
              <div
                key={commit.sha}
                style={{
                  width: index === activeCommitIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index === activeCommitIndex
                    ? theme.colors.primary
                    : theme.colors.border,
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default MobileRepoCard;
