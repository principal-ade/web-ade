'use client';

import { useTheme } from '@principal-ade/industry-theme';
import type { ActivityEvent } from '@/app/api/github/user/[username]/activity/route';

// Days of the week starting with Sunday
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Get the start of the current week (Sunday)
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get contribution level (0-4) based on activity count
const getContributionLevel = (count: number): number => {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
};

interface DayData {
  date: Date;
  dayName: string;
  events: ActivityEvent[];
  contributionLevel: number;
}

export interface WeeklyTimelineHeaderProps {
  events: ActivityEvent[];
  scrollProgress: number;
  currentDayIndex: number; // 0 = today, goes up as we scroll back
  totalActivities: number;
  onDayClick?: (dayIndex: number) => void;
}

export function WeeklyTimelineHeader({
  events,
  scrollProgress,
  currentDayIndex,
  totalActivities,
  onDayClick,
}: WeeklyTimelineHeaderProps) {
  const { theme } = useTheme();

  // Build week data starting from Sunday (for display)
  const weekData: DayData[] = [];
  const now = new Date();
  const weekStart = getWeekStart(now);
  const todayDayOfWeek = now.getDay();

  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayEvents = events.filter((e) => {
      const eventDate = new Date(e.timestamp);
      return eventDate >= date && eventDate < nextDate;
    });

    const isToday = i === todayDayOfWeek;
    const isFuture = i > todayDayOfWeek;

    weekData.push({
      date,
      dayName: isToday ? 'Today' : WEEK_DAYS[i]!,
      events: isFuture ? [] : dayEvents,
      contributionLevel: isFuture ? -1 : getContributionLevel(dayEvents.length),
    });
  }

  // Convert scroll-based currentDayIndex to week-based index
  const getWeekIndexFromScrollIndex = (scrollIdx: number) => {
    const dayOfWeek = todayDayOfWeek - scrollIdx;
    if (dayOfWeek < 0) return -1;
    return dayOfWeek;
  };

  const currentWeekIndex = getWeekIndexFromScrollIndex(currentDayIndex);

  // Contribution level colors (GitHub-style)
  const getContributionColor = (level: number) => {
    if (level === -1) return theme.colors.surface + '50';
    const colors = [
      theme.colors.surface,
      theme.colors.success + '40',
      theme.colors.success + '70',
      theme.colors.success + 'A0',
      theme.colors.success,
    ];
    return colors[level];
  };

  return (
    <div
      className="sticky top-0 z-10"
      style={{
        background: theme.colors.background,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {/* Week bar with 7 segments - Sun through Sat */}
      <div className="flex items-stretch" style={{ height: '48px' }}>
        {weekData.map((day, index) => {
          const isCurrentSegment = index === currentWeekIndex;
          const isFuture = day.contributionLevel === -1;
          const hasActivity = day.events.length > 0;
          const isInScrollRange = index >= currentWeekIndex && index <= todayDayOfWeek;
          const scrollIndexForDay = todayDayOfWeek - index;

          return (
            <button
              key={index}
              onClick={() => !isFuture && onDayClick?.(scrollIndexForDay)}
              className="flex-1 flex flex-col items-center justify-center relative transition-all"
              style={{
                background: isInScrollRange && !isFuture ? theme.colors.surface : 'transparent',
                borderRight: index < 6 ? `1px solid ${theme.colors.border}` : 'none',
                cursor: isFuture ? 'default' : 'pointer',
                opacity: isFuture ? 0.4 : 1,
              }}
            >
              {/* Activity indicator with count inside - grows when current */}
              <div
                className="rounded flex items-center justify-center transition-all duration-200"
                style={{
                  width: isCurrentSegment ? '28px' : '20px',
                  height: isCurrentSegment ? '28px' : '20px',
                  background: getContributionColor(day.contributionLevel),
                  border: `1px solid ${theme.colors.border}`,
                  fontSize: isCurrentSegment ? '12px' : '10px',
                  fontWeight: theme.fontWeights.semibold,
                  color: day.contributionLevel >= 2 ? '#fff' : theme.colors.textMuted,
                }}
                title={isFuture ? 'Future' : `${day.dayName}: ${day.events.length} activities`}
              >
                {!isFuture && day.events.length > 0 ? day.events.length : ''}
              </div>
            </button>
          );
        })}
      </div>

      {/* Activity summary bar */}
      <div
        className="px-3 py-2 flex items-center justify-between transition-all"
        style={{
          background: scrollProgress > 0.9 ? theme.colors.success + '10' : 'transparent',
          borderTop: `1px solid ${scrollProgress > 0.9 ? theme.colors.success + '30' : theme.colors.border}`,
        }}
      >
        <span
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            fontFamily: theme.fonts.body,
            color: theme.colors.textMuted,
          }}
        >
          {currentWeekIndex >= 0 && weekData[currentWeekIndex]
            ? currentWeekIndex === todayDayOfWeek
              ? 'Today'
              : weekData[currentWeekIndex].date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })
            : 'Earlier this week'}
        </span>

        {/* Week summary (shows when near bottom) */}
        {scrollProgress > 0.7 && (
          <div
            className="flex items-center gap-1"
            style={{
              opacity: Math.min(1, (scrollProgress - 0.7) * 3.33),
            }}
          >
            <span
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                fontFamily: theme.fonts.body,
                color: theme.colors.textMuted,
              }}
            >
              Week total:
            </span>
            <span
              style={{
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.success,
              }}
            >
              {totalActivities}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
