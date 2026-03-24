'use client';

/**
 * MobileRepoCard
 *
 * Full-height vertical card for mobile swipe experience.
 * Features File City at top, repo info in middle, commits below.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { User, ExternalLink, ChevronDown, ChevronUp, FolderGit2 } from 'lucide-react';
import type { RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import Link from 'next/link';
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
  const [showAllCommits, setShowAllCommits] = useState(false);
  const [commitStats, setCommitStats] = useState<Map<string, { additions: number; deletions: number }>>(new Map());

  // File City state
  const [cityData, setCityData] = useState<CityData | null>(null);
  const [cityLoading, setCityLoading] = useState(true);
  const [changedFiles, setChangedFiles] = useState<Map<string, 'added' | 'modified' | 'removed'>>(new Map());

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // Total aggregate stats
  const totalStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;

    for (const commit of summary.commits) {
      const stats = commitStats.get(commit.sha);
      if (stats) {
        additions += stats.additions;
        deletions += stats.deletions;
      }
    }

    return { additions, deletions };
  }, [commitStats, summary.commits]);

  // Batch fetch stats for all commits
  useEffect(() => {
    let cancelled = false;

    const fetchAllStats = async () => {
      const statsMap = new Map<string, { additions: number; deletions: number }>();

      await Promise.all(
        summary.commits.map(async (commit) => {
          try {
            const response = await fetch(
              `/api/github/repo/${summary.owner}/${summary.repo}/commits/${commit.sha}`
            );

            if (!response.ok || cancelled) return;

            const data = await response.json();
            if (data.stats) {
              statsMap.set(commit.sha, {
                additions: data.stats.additions || 0,
                deletions: data.stats.deletions || 0,
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

  // Fetch changed files for the latest commit
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
  const displayedCommits = showAllCommits ? summary.commits : summary.commits.slice(0, 3);
  const hasMoreCommits = summary.commits.length > 3;

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
      {/* File City Section - Top (square based on width) */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          flexShrink: 0,
          backgroundColor: theme.colors.background,
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

      {/* Content Section - Scrollable */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: spacing.md,
        }}
      >
        {/* Header with avatar and repo name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.md,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
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
              <User size={32} color={theme.colors.textMuted} />
            )}
          </div>

          {/* Name and stats */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: theme.fontSizes[4],
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
              {summary.owner} &middot; {summary.commitCount} commit{summary.commitCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Line stats bar */}
        {(totalStats.additions > 0 || totalStats.deletions > 0) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
              marginBottom: spacing.md,
              padding: spacing.sm,
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flex: 1 }}>
              {totalStats.additions > 0 && (
                <div
                  style={{
                    height: 8,
                    backgroundColor: theme.colors.success,
                    borderRadius: 4,
                    minWidth: 8,
                    width: `${Math.min(100, (totalStats.additions / (totalStats.additions + totalStats.deletions)) * 100)}%`,
                  }}
                />
              )}
              {totalStats.deletions > 0 && (
                <div
                  style={{
                    height: 8,
                    backgroundColor: theme.colors.error,
                    borderRadius: 4,
                    minWidth: 8,
                    width: `${Math.min(100, (totalStats.deletions / (totalStats.additions + totalStats.deletions)) * 100)}%`,
                  }}
                />
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                fontSize: theme.fontSizes[1],
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              {totalStats.additions > 0 && (
                <span style={{ color: theme.colors.success }}>
                  +{totalStats.additions.toLocaleString()}
                </span>
              )}
              {totalStats.deletions > 0 && (
                <span style={{ color: theme.colors.error }}>
                  -{totalStats.deletions.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Latest commit highlight */}
        {latestCommit && (
          <div
            style={{
              padding: spacing.md,
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              marginBottom: spacing.md,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              {latestCommit.authorAvatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={latestCommit.authorAvatarUrl}
                  alt={latestCommit.author}
                  style={{
                    width: 24,
                    height: 24,
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
                {latestCommit.author}
              </span>
              <span
                style={{
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textMuted,
                  marginLeft: 'auto',
                }}
              >
                {formatRelativeTime(new Date(latestCommit.date))}
              </span>
            </div>
            <div
              style={{
                fontSize: theme.fontSizes[2],
                color: theme.colors.text,
                lineHeight: 1.4,
              }}
            >
              {latestCommit.message}
            </div>
            <code
              style={{
                display: 'block',
                marginTop: spacing.sm,
                fontSize: theme.fontSizes[0],
                fontFamily: 'monospace',
                color: theme.colors.textMuted,
              }}
            >
              {latestCommit.sha.slice(0, 7)}
            </code>
          </div>
        )}

        {/* Other commits */}
        {displayedCommits.length > 1 && (
          <div
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              border: `1px solid ${theme.colors.border}`,
              overflow: 'hidden',
            }}
          >
            {displayedCommits.slice(1).map((commit, index) => {
              const stats = commitStats.get(commit.sha);
              return (
                <div
                  key={commit.sha}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    padding: spacing.sm,
                    borderTop: index > 0 ? `1px solid ${theme.colors.border}` : 'none',
                  }}
                >
                  {commit.authorAvatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={commit.authorAvatarUrl}
                      alt={commit.author}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: theme.fontSizes[1],
                      color: theme.colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {commit.message}
                  </span>
                  {stats && (stats.additions > 0 || stats.deletions > 0) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        fontSize: theme.fontSizes[0],
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {stats.additions > 0 && (
                        <span style={{ color: theme.colors.success }}>+{stats.additions}</span>
                      )}
                      {stats.deletions > 0 && (
                        <span style={{ color: theme.colors.error }}>-{stats.deletions}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show more/less button */}
            {hasMoreCommits && (
              <button
                onClick={() => setShowAllCommits(!showAllCommits)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.xs,
                  width: '100%',
                  padding: spacing.sm,
                  backgroundColor: theme.colors.background,
                  border: 'none',
                  borderTop: `1px solid ${theme.colors.border}`,
                  color: theme.colors.primary,
                  fontSize: theme.fontSizes[1],
                  cursor: 'pointer',
                }}
              >
                {showAllCommits ? (
                  <>
                    <ChevronUp size={16} />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    Show {summary.commits.length - 3} more
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom action bar */}
      <div
        style={{
          flexShrink: 0,
          padding: spacing.md,
          paddingBottom: `calc(${spacing.md}px + env(safe-area-inset-bottom, 0px))`,
          backgroundColor: theme.colors.surface,
          borderTop: `1px solid ${theme.colors.border}`,
        }}
      >
        <Link
          href={`/${summary.owner}/${summary.repo}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            width: '100%',
            padding: `${spacing.md}px`,
            backgroundColor: theme.colors.primary,
            color: theme.colors.textOnPrimary,
            borderRadius: 8,
            fontSize: theme.fontSizes[2],
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={20} />
          Open Repository
        </Link>
      </div>
    </div>
  );
};

export default MobileRepoCard;
