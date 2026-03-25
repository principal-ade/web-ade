'use client';

/**
 * MobileRepoCard
 *
 * Full-height vertical card for mobile swipe experience.
 * Features File City at top, repo info in middle, commits below.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { User, FolderGit2 } from 'lucide-react';
import type { RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { trpc } from '@/lib/trpc/client';
import {
  ArchitectureMapHighlightLayers,
  MultiVersionCityBuilder,
  type CityData,
  type HighlightLayer,
  type FileTree,
} from '@principal-ai/file-city-react';

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

/**
 * Build FileTree from GitHub tree API response
 */
function buildFileTreeFromGitHub(
  tree: Array<{ path: string; type: string; size?: number }>,
  owner: string,
  repo: string,
  sha: string
): FileTree {
  const allFiles = tree
    .filter((item) => item.type === 'blob')
    .map((item) => {
      const pathParts = item.path.split('/');
      const fileName = pathParts[pathParts.length - 1] ?? item.path;
      const extension = fileName.includes('.') ? (fileName.split('.').pop() ?? '') : '';

      return {
        path: item.path,
        name: fileName,
        extension,
        size: item.size || 0,
        lastModified: new Date(),
        isDirectory: false,
        relativePath: item.path,
      };
    });

  const dirMap = new Map<string, {
    path: string;
    name: string;
    children: unknown[];
    fileCount: number;
    totalSize: number;
    depth: number;
    relativePath: string;
  }>();

  tree
    .filter((item) => item.type === 'tree')
    .forEach((item) => {
      const pathParts = item.path.split('/');
      const dirName = pathParts[pathParts.length - 1] ?? item.path;

      dirMap.set(item.path, {
        path: item.path,
        name: dirName,
        children: [],
        fileCount: 0,
        totalSize: 0,
        depth: pathParts.length,
        relativePath: item.path,
      });
    });

  allFiles.forEach((file) => {
    const pathParts = file.relativePath.split('/');
    let currentPath = '';

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!dirMap.has(currentPath)) {
        dirMap.set(currentPath, {
          path: currentPath,
          name: part,
          children: [],
          fileCount: 0,
          totalSize: 0,
          depth: i + 1,
          relativePath: currentPath,
        });
      }
    }
  });

  const allDirectories = Array.from(dirMap.values());
  let maxDepth = 0;
  let totalSize = 0;

  allFiles.forEach((file) => {
    totalSize += file.size;
  });

  allDirectories.forEach((dir) => {
    maxDepth = Math.max(maxDepth, dir.depth);
  });

  const rootDir = {
    path: '',
    name: repo,
    children: [],
    fileCount: allFiles.length,
    totalSize,
    depth: 0,
    relativePath: '',
  };

  return {
    sha,
    root: rootDir,
    allFiles,
    allDirectories,
    stats: {
      totalFiles: allFiles.length,
      totalDirectories: allDirectories.length,
      totalSize,
      maxDepth,
    },
    metadata: {
      id: `github:${owner}/${repo}:${sha}`,
      timestamp: new Date(),
      sourceType: 'github',
      sourceSha: sha,
      sourceInfo: {
        owner,
        name: repo,
        provider: 'github',
      },
    },
  } as FileTree;
}

export const MobileRepoCard: React.FC<MobileRepoCardProps> = ({ summary }) => {
  const { theme } = useTheme();
  const [avatarLoaded, setAvatarLoaded] = useState(true);
  const [activeCommitIndex, setActiveCommitIndex] = useState(0);
  const commitsContainerRef = useRef<HTMLDivElement>(null);

  // File City state
  const [cityData, setCityData] = useState<CityData | null>(null);
  const [cityLoading, setCityLoading] = useState(true);
  const [changedFiles, setChangedFiles] = useState<Map<string, 'added' | 'modified' | 'removed'>>(new Map());

  // Commit stats (additions, deletions, file count)
  const [commitStats, setCommitStats] = useState<Map<string, { additions: number; deletions: number; filesChanged: number }>>(new Map());

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

  // Fetch tree data for File City
  useEffect(() => {
    let cancelled = false;

    const fetchTree = async () => {
      setCityLoading(true);
      try {
        const treeData = await trpc.github.getTree.query({
          owner: summary.owner,
          repo: summary.repo,
        });

        if (cancelled) return;

        const fileTree = buildFileTreeFromGitHub(
          treeData.tree,
          summary.owner,
          summary.repo,
          treeData.sha
        );

        const versionMap = new Map([['main', fileTree]]);
        const { unionCity } = MultiVersionCityBuilder.build(versionMap);
        setCityData(unionCity);
      } catch (err) {
        console.warn(`[MobileRepoCard] Failed to fetch tree for ${summary.fullName}:`, err);
      } finally {
        if (!cancelled) {
          setCityLoading(false);
        }
      }
    };

    fetchTree();

    return () => {
      cancelled = true;
    };
  }, [summary.owner, summary.repo, summary.fullName]);

  // Fetch changed files for the latest commit (for File City highlights)
  const latestCommit = summary.commits[0];

  useEffect(() => {
    if (!latestCommit) {
      setChangedFiles(new Map());
      return;
    }

    let cancelled = false;

    const fetchCommitDetails = async () => {
      try {
        const response = await fetch(
          `/api/github/repo/${summary.owner}/${summary.repo}/commits/${latestCommit.sha}`
        );

        if (!response.ok || cancelled) return;

        const data = await response.json();
        const files = data.files as Array<{ filename: string; status: string }> | undefined;

        if (files && !cancelled) {
          const fileMap = new Map<string, 'added' | 'modified' | 'removed'>();
          for (const file of files) {
            const status = file.status === 'added' ? 'added'
              : file.status === 'removed' ? 'removed'
              : 'modified';
            fileMap.set(file.filename, status);
          }
          setChangedFiles(fileMap);
        }
      } catch (err) {
        console.warn(`[MobileRepoCard] Failed to fetch commit details:`, err);
      }
    };

    fetchCommitDetails();

    return () => {
      cancelled = true;
    };
  }, [latestCommit, summary.owner, summary.repo]);

  // Create highlight layers for changed files
  const highlightLayers = useMemo<HighlightLayer[]>(() => {
    if (changedFiles.size === 0) return [];

    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const removedFiles: string[] = [];

    changedFiles.forEach((status, path) => {
      if (status === 'added') addedFiles.push(path);
      else if (status === 'modified') modifiedFiles.push(path);
      else if (status === 'removed') removedFiles.push(path);
    });

    const layers: HighlightLayer[] = [];

    if (addedFiles.length > 0) {
      layers.push({
        id: 'added',
        name: 'Added',
        enabled: true,
        color: '#22c55e',
        priority: 10,
        items: addedFiles.map((path) => ({
          path,
          type: 'file' as const,
          renderStrategy: 'glow' as const,
        })),
      });
    }

    if (modifiedFiles.length > 0) {
      layers.push({
        id: 'modified',
        name: 'Modified',
        enabled: true,
        color: '#f59e0b',
        priority: 9,
        items: modifiedFiles.map((path) => ({
          path,
          type: 'file' as const,
          renderStrategy: 'glow' as const,
        })),
      });
    }

    if (removedFiles.length > 0) {
      layers.push({
        id: 'removed',
        name: 'Removed',
        enabled: true,
        color: '#ef4444',
        priority: 8,
        items: removedFiles.map((path) => ({
          path,
          type: 'file' as const,
          renderStrategy: 'border' as const,
        })),
      });
    }

    return layers;
  }, [changedFiles]);

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

      {/* File City Section */}
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
        }}
      >
        {cityLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: spacing.sm,
              color: theme.colors.textMuted,
            }}
          >
            <FolderGit2 size={32} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: theme.fontSizes[0] }}>Loading...</span>
          </div>
        ) : cityData ? (
          <ArchitectureMapHighlightLayers
            cityData={cityData}
            highlightLayers={highlightLayers}
            fullSize
            showFileNames={false}
            canvasBackgroundColor={theme.colors.background}
          />
        ) : (
          <FolderGit2 size={64} color={theme.colors.textMuted} style={{ opacity: 0.3 }} />
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
