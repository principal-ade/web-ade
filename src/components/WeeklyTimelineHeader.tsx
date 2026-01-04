'use client';

import { useTheme } from '@principal-ade/industry-theme';
import type { ActivityEvent } from '@/app/api/github/user/[username]/activity/route';

// Days of the week starting with Sunday
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

  // Build last 7 days data (0=today, 6=7 days ago)
  const weekData: DayData[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayEvents = events.filter((e) => {
      const eventDate = new Date(e.timestamp);
      return eventDate >= date && eventDate < nextDate;
    });

    const isToday = i === 0;
    const dayOfWeek = date.getDay();

    weekData.push({
      date,
      dayName: isToday ? 'Today' : WEEK_DAYS[dayOfWeek]!,
      events: dayEvents,
      contributionLevel: getContributionLevel(dayEvents.length),
    });
  }

  // Current day index maps directly to weekData array (0=today at end, 6=7 days ago at start)
  // weekData is in chronological order (oldest first), so invert the index
  const currentWeekIndex = 6 - currentDayIndex;

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
      {/* Week bar with 7 segments - last 7 days */}
      <div className="flex items-stretch" style={{ height: '48px' }}>
        {weekData.map((day, index) => {
          const isCurrentSegment = index === currentWeekIndex;
          const isInScrollRange = index >= currentWeekIndex;
          const scrollIndexForDay = 6 - index; // Convert array index to scroll index

          return (
            <button
              key={index}
              onClick={() => onDayClick?.(scrollIndexForDay)}
              className="flex-1 flex flex-col items-center justify-center relative transition-all"
              style={{
                background: isInScrollRange ? theme.colors.surface : 'transparent',
                borderRight: index < 6 ? `1px solid ${theme.colors.border}` : 'none',
                cursor: 'pointer',
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
                title={`${day.dayName}: ${day.events.length} activities`}
              >
                {WEEK_DAYS[day.date.getDay()]!.charAt(0)}
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
          {currentWeekIndex >= 0 && currentWeekIndex < weekData.length && weekData[currentWeekIndex]
            ? currentWeekIndex === 6
              ? 'Today'
              : weekData[currentWeekIndex].date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })
            : 'Last 7 days'}
        </span>

        {/* 7-day summary (shows when near bottom) */}
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
              7-day total:
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
