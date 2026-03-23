'use client';

/**
 * RepoActivityCard
 *
 * Individual repository activity card with commit visualization,
 * animations, and File City integration.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  FolderGit2,
  ChevronDown,
  ChevronRight,
  User,
  Play,
  Square,
  ExternalLink,
} from 'lucide-react';
import type { RepoActivitySummary } from '@/hooks/useGitHubActivityFeed';
import { trpc } from '@/lib/trpc/client';
import {
  ArchitectureMapHighlightLayers,
  MultiVersionCityBuilder,
  type CityData,
  type HighlightLayer,
  type FileTree,
} from '@principal-ai/file-city-react';

interface RepoActivityCardProps {
  summary: RepoActivitySummary;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
  dimmed?: boolean;
}

/**
 * Format relative time from date
 */
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
        path: item.path,  // No leading /
        name: fileName,
        extension,
        size: item.size || 0,
        lastModified: new Date(),
        isDirectory: false,
        relativePath: item.path,
      };
    });

  // Build directory structure
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
        path: item.path,  // No leading /
        name: dirName,
        children: [],
        fileCount: 0,
        totalSize: 0,
        depth: pathParts.length,
        relativePath: item.path,
      });
    });

  // Create implicit parent directories
  allFiles.forEach((file) => {
    const pathParts = file.relativePath.split('/');
    let currentPath = '';

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!dirMap.has(currentPath)) {
        dirMap.set(currentPath, {
          path: currentPath,  // No leading /
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
    path: '',  // Root has empty path
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

export const RepoActivityCard: React.FC<RepoActivityCardProps> = ({
  summary,
  isExpanded,
  onToggleExpand,
  onOpen,
  dimmed = false,
}) => {
  const { theme } = useTheme();
  const hasMoreCommits = summary.commits.length > 1;

  const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  };

  // Hover state for commit dots
  const [hoveredCommitIndex, setHoveredCommitIndex] = useState<number | null>(null);

  // Avatar load state
  const [avatarLoaded, setAvatarLoaded] = useState(true);

  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationCommitIndex, setAnimationCommitIndex] = useState<number | null>(null);
  const [typewriterText, setTypewriterText] = useState<string>('');
  const animationRef = useRef<{ cancel: boolean }>({ cancel: false });

  // File City state
  const [cityData, setCityData] = useState<CityData | null>(null);
  const [cityLoading, setCityLoading] = useState(true);

  // Changed files for highlight layers
  const [changedFiles, setChangedFiles] = useState<Map<string, 'added' | 'modified' | 'removed'>>(new Map());

  // Get the commit to display (animation > hovered > most recent)
  const displayedCommitIndex = animationCommitIndex ?? hoveredCommitIndex ?? 0;
  const displayedCommit = summary.commits[displayedCommitIndex];
  const displayedTime = new Date(displayedCommit?.date ?? summary.latestCommitAt);
  const displayedMessage = isAnimating && typewriterText !== null
    ? typewriterText
    : displayedCommit?.message ?? '';

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

        // Build FileTree from the response
        const fileTree = buildFileTreeFromGitHub(
          treeData.tree,
          summary.owner,
          summary.repo,
          treeData.sha
        );

        // Build city data
        const versionMap = new Map([['main', fileTree]]);
        const { unionCity } = MultiVersionCityBuilder.build(versionMap);
        setCityData(unionCity);
      } catch (err) {
        console.warn(`[RepoActivityCard] Failed to fetch tree for ${summary.fullName}:`, err);
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

  // Fetch changed files for the displayed commit
  useEffect(() => {
    if (!displayedCommit) {
      setChangedFiles(new Map());
      return;
    }

    let cancelled = false;

    const fetchCommitDetails = async () => {
      try {
        const response = await fetch(
          `/api/github/repo/${summary.owner}/${summary.repo}/commits/${displayedCommit.sha}`
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
            fileMap.set(file.filename, status);  // No leading /
          }
          setChangedFiles(fileMap);
        }
      } catch (err) {
        console.warn(`[RepoActivityCard] Failed to fetch commit details:`, err);
      }
    };

    fetchCommitDetails();

    return () => {
      cancelled = true;
    };
  }, [displayedCommit, summary.owner, summary.repo]);

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
        color: '#22c55e', // green
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
        color: '#f59e0b', // amber
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
        color: '#ef4444', // red
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

  // Animation logic
  const startAnimation = useCallback(async () => {
    if (isAnimating) {
      // Stop animation
      animationRef.current.cancel = true;
      setIsAnimating(false);
      setAnimationCommitIndex(null);
      setTypewriterText('');
      return;
    }

    setIsAnimating(true);
    animationRef.current.cancel = false;

    // Start from oldest commit (highest index) to newest (index 0)
    const commits = summary.commits;

    for (let i = commits.length - 1; i >= 0; i--) {
      if (animationRef.current.cancel) break;

      const commit = commits[i];
      if (!commit) continue;

      setAnimationCommitIndex(i);
      setTypewriterText('');

      // Typewriter effect for commit message
      const message = commit.message;
      for (let j = 0; j <= message.length; j++) {
        if (animationRef.current.cancel) break;
        setTypewriterText(message.slice(0, j));
        await new Promise((resolve) => setTimeout(resolve, 30)); // 30ms per character
      }

      if (animationRef.current.cancel) break;

      // Pause at each commit
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Animation complete
    if (!animationRef.current.cancel) {
      setIsAnimating(false);
      setAnimationCommitIndex(null);
      setTypewriterText('');
    }
  }, [isAnimating, summary.commits]);

  // Cleanup animation on unmount
  useEffect(() => {
    const ref = animationRef.current;
    return () => {
      ref.cancel = true;
    };
  }, []);

  return (
    <div
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        border: `1px solid ${theme.colors.border}`,
        overflow: 'hidden',
        opacity: dimmed ? 0.7 : 1,
        transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Horizontal layout: content left, image right */}
      <div
        style={{
          display: 'flex',
          minHeight: 300,
        }}
      >
        {/* Summary info - left half */}
        <div
          style={{
            flex: 1,
            padding: spacing.md,
            display: 'flex',
            flexDirection: 'column',
            cursor: 'pointer',
          }}
          onClick={onToggleExpand}
        >
          {/* Header with avatar, name, and time */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: theme.colors.background,
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
                  src={`https://github.com/${summary.owner}.png?size=80`}
                  alt={summary.owner}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  onError={() => setAvatarLoaded(false)}
                />
              ) : (
                <User size={28} color={theme.colors.textMuted} />
              )}
            </div>

            {/* Name and time */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4
                style={{
                  margin: 0,
                  marginBottom: spacing.xs,
                  fontSize: theme.fontSizes[3],
                  fontWeight: 600,
                  color: theme.colors.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {summary.owner}/{summary.repo}
              </h4>
              <span
                style={{
                  fontSize: theme.fontSizes[1],
                  color: hoveredCommitIndex !== null ? theme.colors.primary : theme.colors.textMuted,
                  transition: 'color 0.15s ease',
                }}
              >
                {formatRelativeTime(displayedTime)}
              </span>
            </div>
          </div>

          {/* Commit dots - grouped in rows of 10 with connecting line */}
          <div style={{ marginBottom: spacing.md }}>
            {Array.from({ length: Math.ceil(summary.commits.length / 10) }).map((_, rowIndex) => {
              const rowCommits = summary.commits.slice(rowIndex * 10, (rowIndex + 1) * 10);
              return (
                <div
                  key={rowIndex}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    marginBottom: rowIndex < Math.ceil(summary.commits.length / 10) - 1 ? spacing.xs : 0,
                    height: 24,
                  }}
                >
                  {/* Connecting line */}
                  {rowCommits.length > 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        height: 2,
                        backgroundColor: theme.colors.border,
                        transform: 'translateY(-50%)',
                        zIndex: 0,
                      }}
                    />
                  )}
                  {/* Dots with expanded hover targets */}
                  {rowCommits.map((commit, index) => {
                    const globalIndex = rowIndex * 10 + index;
                    const activeIndex = isAnimating ? animationCommitIndex : (hoveredCommitIndex ?? 0);
                    const isDisplayed = globalIndex === activeIndex;
                    const isFilled = activeIndex !== null && globalIndex <= activeIndex;

                    return (
                      <div
                        key={commit.sha}
                        onMouseEnter={() => !isAnimating && setHoveredCommitIndex(globalIndex)}
                        onMouseLeave={() => !isAnimating && setHoveredCommitIndex(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: 1,
                          height: '100%',
                          cursor: 'pointer',
                          zIndex: 1,
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            backgroundColor: isDisplayed ? theme.colors.primary : theme.colors.textMuted,
                            opacity: isFilled ? 1 : 0.3,
                            border: `2px solid ${theme.colors.surface}`,
                            transition: 'opacity 0.15s ease, background-color 0.15s ease',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Commit hash + author avatar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              marginBottom: spacing.xs,
            }}
          >
            {/* Author avatar */}
            {displayedCommit?.authorAvatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayedCommit.authorAvatarUrl}
                alt={displayedCommit.author}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <code
              style={{
                fontSize: theme.fontSizes[0],
                fontFamily: 'monospace',
                color: theme.colors.textMuted,
              }}
            >
              {displayedCommit?.sha.slice(0, 7)}
            </code>
          </div>

          {/* Commit message */}
          <div
            style={{
              fontSize: theme.fontSizes[1],
              color: (isAnimating || hoveredCommitIndex !== null) ? theme.colors.primary : theme.colors.text,
              marginBottom: spacing.sm,
              transition: 'color 0.15s ease',
              minHeight: '1.5em',
            }}
          >
            {displayedMessage || (isAnimating ? '' : 'No commits')}
            {isAnimating && <span style={{ opacity: 0.5 }}>|</span>}
          </div>

          {/* Spacer to push controls to bottom */}
          <div style={{ flex: 1 }} />

          {/* Controls row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            {/* Animate button */}
            {hasMoreCommits && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startAnimation();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: theme.fontSizes[1],
                  color: isAnimating ? theme.colors.error : theme.colors.primary,
                  backgroundColor: 'transparent',
                  border: `1px solid ${isAnimating ? theme.colors.error : theme.colors.primary}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {isAnimating ? <Square size={12} /> : <Play size={12} />}
                <span>{isAnimating ? 'Stop' : 'Animate'}</span>
              </button>
            )}

            {/* Open button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: theme.fontSizes[1],
                color: theme.colors.primary,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.primary}`,
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <ExternalLink size={12} />
              <span>Open</span>
            </button>

            {/* Show details button */}
            {hasMoreCommits && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: theme.fontSizes[1],
                  color: theme.colors.textMuted,
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{isExpanded ? 'Hide' : 'Details'}</span>
              </button>
            )}
          </div>
        </div>

        {/* File City image - right half */}
        <div
          style={{
            width: 300,
            height: 300,
            backgroundColor: theme.colors.background,
            borderLeft: `1px solid ${theme.colors.border}`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
          }}
          onDoubleClick={onOpen}
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
      </div>

      {/* Expanded commits list */}
      {isExpanded && summary.commits.length > 1 && (
        <div
          style={{
            borderTop: `1px solid ${theme.colors.border}`,
            padding: spacing.md,
            backgroundColor: theme.colors.background,
          }}
        >
          {summary.commits.slice(1).map((commit, index) => (
            <div
              key={commit.sha}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.sm,
                padding: `${spacing.xs}px 0`,
                borderTop: index > 0 ? `1px solid ${theme.colors.border}` : 'none',
              }}
            >
              <code
                style={{
                  fontSize: theme.fontSizes[0],
                  fontFamily: 'monospace',
                  color: theme.colors.textMuted,
                  flexShrink: 0,
                }}
              >
                {commit.sha.slice(0, 7)}
              </code>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
