'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

// GitHub-style contribution graph: 365 days of activity as a grid of colored
// squares (one column per week, 7 rows). Month initials are stamped on the
// first-of-month square. Theme-aware — square opacity scales with that day's
// count relative to the busiest day. Auto-scrolls to the present on data load.
//
// Extracted from OwnerProfilePage so the repo-page contributor modal can reuse
// the exact same visualization. Input is a date-string (`YYYY-MM-DD`) → count map.
export const ActivityHeatmap: React.FC<{
  activityData: Map<string, number>;
  bannerHeight?: number;
}> = ({ activityData, bannerHeight = 170 }) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const squareSize = useMemo(() => {
    const gap = 3;
    return Math.floor((bannerHeight - 8 - 6 * gap) / 7);
  }, [bannerHeight]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
  }, [activityData]);

  const weeks = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: string; count: number; dayOfWeek: number; monthLabel?: string }> = [];

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0]!;
      days.push({
        date: key,
        count: activityData.get(key) ?? 0,
        dayOfWeek: d.getDay(),
        monthLabel: d.getDate() === 1
          ? ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][d.getMonth()]
          : undefined,
      });
    }

    const groups: (typeof days)[] = [];
    let week: typeof days = [];
    for (const day of days) {
      if (day.dayOfWeek === 0 && week.length > 0) { groups.push(week); week = []; }
      week.push(day);
    }
    if (week.length > 0) groups.push(week);
    return groups;
  }, [activityData]);

  const maxCount = useMemo(() => {
    let max = 0;
    activityData.forEach(v => { if (v > max) max = v; });
    return max || 1;
  }, [activityData]);

  const getColor = (count: number) => {
    if (count === 0) return `${theme.colors.border}30`;
    const alpha = Math.floor(20 + Math.min(count / maxCount, 1) * 80).toString(16).padStart(2, '0');
    return `${theme.colors.primary}${alpha}`;
  };

  const gap = 3;
  const br = Math.max(2, Math.floor(squareSize * 0.2));

  return (
    <div
      ref={containerRef}
      className="owner-heatmap"
      style={{
        display: 'flex', gap, padding: '0 16px 8px', width: '100%', height: '100%',
        overflowX: 'auto', overflowY: 'hidden', alignItems: 'center',
        scrollbarWidth: 'none',
      }}
    >
      {weeks.map((week, wi) => (
        <div key={week[0]?.date ?? wi} style={{ display: 'flex', flexDirection: 'column', gap, flexShrink: 0 }}>
          {week.map(day => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} commits`}
              style={{
                width: squareSize, height: squareSize, borderRadius: br,
                backgroundColor: getColor(day.count), flexShrink: 0,
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {day.monthLabel && (
                <span style={{
                  fontSize: Math.max(8, Math.floor(squareSize * 0.6)), fontWeight: 700,
                  color: theme.colors.background, textShadow: `0 0 2px ${theme.colors.text}`,
                  pointerEvents: 'none', userSelect: 'none',
                }}>
                  {day.monthLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
