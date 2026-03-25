'use client';

/**
 * HourlyActivityHeatmap
 *
 * Displays a granular activity heat map showing commit frequency
 * at 10-minute intervals. Each row represents an hour, with 6 blocks
 * per row (one per 10-minute window). Most recent at top, scrolling
 * down goes back in time.
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

export interface CommitTimestamp {
  timestamp: Date | string;
  repoId?: string;
}

export interface HourlyActivityHeatmapProps {
  commits: CommitTimestamp[];
  loading?: boolean;
  onBlockClick?: (startTime: Date, endTime: Date, count: number) => void;
  selectedBlock?: string | null;
  /** Hour key (YYYY-M-D-H format) of the currently visible hour in the feed */
  activeHourKey?: string | null;
}

const HOUR_LABEL_WIDTH = 48;
const MIN_CELL_SIZE = 12;
const CELL_GAP = 2;
const BLOCKS_PER_HOUR = 6; // 10-minute blocks

const formatHour = (hour: number): string => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour} ${period}`;
};

type DayQuarter = 'Night' | 'Morning' | 'Afternoon' | 'Evening';

const getQuarter = (hour: number): DayQuarter => {
  if (hour >= 0 && hour < 6) return 'Night';
  if (hour >= 6 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  return 'Evening';
};

const getGreeting = (quarter: DayQuarter): string => {
  switch (quarter) {
    case 'Night': return 'Welcome Night Owls';
    case 'Morning': return 'Good Morning';
    case 'Afternoon': return 'Good Afternoon';
    case 'Evening': return 'Good Evening';
  }
};

const getQuarterLabel = (quarter: DayQuarter): string => {
  switch (quarter) {
    case 'Night': return 'Night Shift';
    default: return quarter;
  }
};

const getHourKey = (date: Date): string => {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
};

const getBlockKey = (date: Date): string => {
  const blockIndex = Math.floor(date.getMinutes() / 10);
  return `${getHourKey(date)}-${blockIndex}`;
};

export const HourlyActivityHeatmap: React.FC<HourlyActivityHeatmapProps> = ({
  commits,
  loading: _loading = false,
  onBlockClick,
  selectedBlock = null,
  activeHourKey = null,
}) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const elapsedMinutes = currentTime.getMinutes() % 10;
  const currentBlockKey = `${currentTime.getFullYear()}-${currentTime.getMonth()}-${currentTime.getDate()}-${currentTime.getHours()}-${Math.floor(currentTime.getMinutes() / 10)}`;

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const cellSize = useMemo(() => {
    if (dimensions.width === 0) return MIN_CELL_SIZE;
    const availableWidth = dimensions.width - HOUR_LABEL_WIDTH - (BLOCKS_PER_HOUR - 1) * CELL_GAP;
    const calculatedSize = availableWidth / BLOCKS_PER_HOUR;
    return Math.max(MIN_CELL_SIZE, Math.floor(calculatedSize));
  }, [dimensions.width]);

  const maxRows = useMemo(() => {
    if (dimensions.height === 0) return 24;
    const headerHeight = 32;
    const legendHeight = 32;
    const availableHeight = dimensions.height - headerHeight - legendHeight;
    const rowHeight = cellSize + CELL_GAP;
    return Math.max(1, Math.floor(availableHeight / rowHeight));
  }, [dimensions.height, cellSize]);

  const { blockMap, maxCount, quarterCounts } = useMemo(() => {
    const map = new Map<string, number>();
    const quarters = new Map<string, number>();
    let max = 0;

    commits.forEach(({ timestamp }) => {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      const key = getBlockKey(date);
      const count = (map.get(key) || 0) + 1;
      map.set(key, count);
      max = Math.max(max, count);

      // Count commits per quarter (date + quarter)
      const quarterKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${getQuarter(date.getHours())}`;
      quarters.set(quarterKey, (quarters.get(quarterKey) || 0) + 1);
    });

    return { blockMap: map, maxCount: max, quarterCounts: quarters };
  }, [commits]);

  const hourRows = useMemo(() => {
    const now = new Date();
    const rows: Array<{
      hourKey: string;
      hourLabel: string;
      date: Date;
      blocks: Array<{
        blockKey: string;
        blockIndex: number;
        startTime: Date;
        endTime: Date;
        count: number;
        isFuture: boolean;
        isCurrent: boolean;
      }>;
    }> = [];

    for (let i = 0; i < maxRows; i++) {
      const hourDate = new Date(now);
      hourDate.setHours(now.getHours() - i, 0, 0, 0);

      const hourKey = getHourKey(hourDate);
      const blocks = [];

      for (let blockIndex = 0; blockIndex < BLOCKS_PER_HOUR; blockIndex++) {
        const startTime = new Date(hourDate);
        startTime.setMinutes(blockIndex * 10, 0, 0);

        const endTime = new Date(startTime);
        endTime.setMinutes(startTime.getMinutes() + 10);

        const blockKey = `${hourKey}-${blockIndex}`;
        const count = blockMap.get(blockKey) || 0;
        const isFuture = startTime > now;
        const isCurrent = now >= startTime && now < endTime;

        blocks.push({
          blockKey,
          blockIndex,
          startTime,
          endTime,
          count,
          isFuture,
          isCurrent,
        });
      }

      rows.push({
        hourKey,
        hourLabel: formatHour(hourDate.getHours()),
        date: hourDate,
        blocks,
      });
    }

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRows, blockMap, currentBlockKey]);

  const getColor = (count: number, isFuture: boolean): string => {
    if (isFuture) {
      return theme.colors.surface;
    }

    if (count === 0) {
      return theme.colors.border;
    }

    const primaryColor = theme.colors.primary;
    const intensity = maxCount > 0
      ? Math.min(4, Math.ceil((count / maxCount) * 4))
      : 0;

    const opacities = [0.2, 0.4, 0.6, 0.8, 1.0];
    const opacity = opacities[intensity];

    if (primaryColor.startsWith('#')) {
      const r = parseInt(primaryColor.slice(1, 3), 16);
      const g = parseInt(primaryColor.slice(3, 5), 16);
      const b = parseInt(primaryColor.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    return primaryColor;
  };

  const formatTimeRange = (start: Date, end: Date): string => {
    const formatTime = (d: Date) => {
      const hour = d.getHours();
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const m = d.getMinutes().toString().padStart(2, '0');
      return `${displayHour}:${m} ${period}`;
    };
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  const formatDate = (date: Date): string | null => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return null; // No label for today
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  const getSeparator = (
    currentRow: typeof hourRows[0],
    prevRow: typeof hourRows[0] | null,
    isFirst: boolean
  ): { label: string; commitCount: number; dateLabel?: string } | null => {
    const currentQuarter = getQuarter(currentRow.date.getHours());
    const prevQuarter = prevRow ? getQuarter(prevRow.date.getHours()) : null;
    const isNewDay = !prevRow || currentRow.date.toDateString() !== prevRow.date.toDateString();
    const isNewQuarter = !prevRow || currentQuarter !== prevQuarter;

    if (!isNewDay && !isNewQuarter) return null;

    const quarterKey = `${currentRow.date.getFullYear()}-${currentRow.date.getMonth()}-${currentRow.date.getDate()}-${currentQuarter}`;
    const commitCount = quarterCounts.get(quarterKey) || 0;

    // Only the first separator gets "Good Morning" style, rest just show quarter name
    const label = isFirst ? getGreeting(currentQuarter) : getQuarterLabel(currentQuarter);

    const dateLabel = formatDate(currentRow.date);
    if (isNewDay && dateLabel) {
      return { label, commitCount, dateLabel };
    }
    return { label, commitCount };
  };

  const spacing = {
    xs: 4,
    sm: 8,
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Grid */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: CELL_GAP,
        }}
      >
        {hourRows.map((row, rowIndex) => {
          const prevRow = rowIndex > 0 ? hourRows[rowIndex - 1] ?? null : null;
          const separator = getSeparator(row, prevRow, rowIndex === 0);

          return (
            <React.Fragment key={row.hourKey}>
              {/* Day or quarter separator */}
              {separator && (
                <div
                  style={{
                    paddingTop: rowIndex > 0 ? spacing.sm : 0,
                    paddingBottom: spacing.xs,
                    borderTop: rowIndex > 0 ? `1px solid ${theme.colors.border}` : undefined,
                    marginTop: rowIndex > 0 ? spacing.sm : 0,
                  }}
                >
                  {separator.dateLabel && (
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                        marginBottom: spacing.xs,
                      }}
                    >
                      {separator.dateLabel}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <div
                      style={{
                        fontSize: theme.fontSizes[2],
                        fontWeight: 600,
                        color: theme.colors.text,
                      }}
                    >
                      {separator.label}
                    </div>
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                      }}
                    >
                      {separator.commitCount} commit{separator.commitCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )}

              {/* Hour row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: CELL_GAP,
                }}
              >
                {/* Hour label */}
                <div
                  style={{
                    width: HOUR_LABEL_WIDTH,
                    fontSize: theme.fontSizes[0],
                    color: activeHourKey === row.hourKey ? theme.colors.primary : theme.colors.textMuted,
                    fontWeight: activeHourKey === row.hourKey ? 600 : 400,
                    textAlign: 'right',
                    paddingRight: spacing.xs,
                    flexShrink: 0,
                    transition: 'color 0.2s ease, font-weight 0.2s ease',
                  }}
                >
                  {row.hourLabel}
                </div>

                {/* Blocks */}
                {row.blocks.map((block) => {
                  const isSelected = selectedBlock === block.startTime.toISOString();

                  // Current block: render 3x3 mini-grid
                  if (block.isCurrent) {
                    const miniGap = 1;
                    const miniCellSize = (cellSize - miniGap * 2) / 3;

                    const commitMinutes = new Set<number>();
                    commits.forEach(({ timestamp }) => {
                      const commitDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
                      if (commitDate >= block.startTime && commitDate < block.endTime) {
                        const minuteInBlock = commitDate.getMinutes() % 10;
                        commitMinutes.add(minuteInBlock);
                      }
                    });

                    return (
                      <div
                        key={block.blockKey}
                        title={`${formatTimeRange(block.startTime, block.endTime)}: ${block.count} commit${block.count !== 1 ? 's' : ''} (now)`}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: 2,
                          backgroundColor: theme.colors.border,
                          cursor: onBlockClick ? 'pointer' : 'default',
                          position: 'relative',
                          zIndex: isSelected ? 1 : 0,
                          boxShadow: isSelected
                            ? `0 0 0 2px ${theme.colors.background}, 0 0 0 4px ${theme.colors.primary}`
                            : 'none',
                          display: 'grid',
                          gridTemplateColumns: `repeat(3, ${miniCellSize}px)`,
                          gridTemplateRows: `repeat(3, ${miniCellSize}px)`,
                          gap: miniGap,
                          overflow: 'hidden',
                        }}
                        onClick={() => {
                          if (onBlockClick) {
                            onBlockClick(block.startTime, block.endTime, block.count);
                          }
                        }}
                      >
                        {Array.from({ length: 9 }).map((_, i) => {
                          const row = Math.floor(i / 3);
                          const col = i % 3;
                          const minute = (2 - row) * 3 + col;

                          const hasCommit = commitMinutes.has(minute) || (minute === 8 && commitMinutes.has(9));
                          const isElapsed = minute < elapsedMinutes;

                          return (
                            <div
                              key={i}
                              style={{
                                width: miniCellSize,
                                height: miniCellSize,
                                borderRadius: 1,
                                backgroundColor: hasCommit
                                  ? theme.colors.primary
                                  : isElapsed
                                    ? theme.colors.textMuted
                                    : theme.colors.border,
                                opacity: hasCommit ? 1 : isElapsed ? 0.5 : 1,
                                transition: 'opacity 0.3s ease, background-color 0.3s ease',
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={block.blockKey}
                      title={
                        block.isFuture
                          ? 'Future'
                          : `${formatTimeRange(block.startTime, block.endTime)}: ${block.count} commit${block.count !== 1 ? 's' : ''}`
                      }
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: 2,
                        backgroundColor: getColor(block.count, block.isFuture),
                        cursor: block.isFuture || !onBlockClick ? 'default' : 'pointer',
                        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                        boxShadow: isSelected
                          ? `0 0 0 2px ${theme.colors.background}, 0 0 0 4px ${theme.colors.primary}`
                          : 'none',
                        position: 'relative',
                        zIndex: isSelected ? 1 : 0,
                        opacity: block.isFuture ? 0.3 : 1,
                      }}
                      onClick={() => {
                        if (!block.isFuture && onBlockClick) {
                          onBlockClick(block.startTime, block.endTime, block.count);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          marginTop: spacing.sm,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: theme.fontSizes[0],
            color: theme.colors.textMuted,
          }}
        >
          Less
        </span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            style={{
              width: Math.min(cellSize, 10),
              height: Math.min(cellSize, 10),
              borderRadius: 2,
              backgroundColor: getColor(level === 0 ? 0 : (level / 4) * (maxCount || 1), false),
            }}
          />
        ))}
        <span
          style={{
            fontSize: theme.fontSizes[0],
            color: theme.colors.textMuted,
          }}
        >
          More
        </span>
      </div>
    </div>
  );
};

export default HourlyActivityHeatmap;
