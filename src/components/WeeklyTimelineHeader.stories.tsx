import type { Meta, StoryObj } from '@storybook/react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeProvider, useTheme } from '@principal-ade/industry-theme';
import { AuthProvider } from '@/contexts/AuthContext';
import type { ActivityEvent } from '@/app/api/github/user/[username]/activity/route';
import { mockActivityEvents, getMockPanelProps } from './__mocks__/activityMocks';

// Generate mock data spread across the week
const generateWeeklyActivity = (): ActivityEvent[] => {
  const events: ActivityEvent[] = [];
  const now = new Date();

  // Generate events for each day of the past week
  for (let day = 0; day < 7; day++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() - day);

    // Random number of events per day (0-5)
    const eventCount = Math.floor(Math.random() * 6);

    for (let i = 0; i < eventCount; i++) {
      const hourOffset = Math.floor(Math.random() * 24);
      const eventDate = new Date(dayDate);
      eventDate.setHours(hourOffset, Math.floor(Math.random() * 60), 0, 0);

      const types: ActivityEvent['type'][] = ['commit', 'pr_merged', 'pr_opened', 'issue_opened'];
      const type = types[Math.floor(Math.random() * types.length)];

      events.push({
        id: `event-${day}-${i}`,
        type,
        timestamp: eventDate.toISOString(),
        repository: ['octocat/hello-world', 'github/linguist', 'facebook/react'][Math.floor(Math.random() * 3)],
        ownerType: Math.random() > 0.5 ? 'User' : 'Organization',
        title: type === 'commit' ? undefined : `Sample ${type} event ${i}`,
        metadata: type === 'commit' ? { commitCount: Math.floor(Math.random() * 5) + 1 } : { prNumber: i + 1 },
      });
    }
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Days of the week starting with Sunday
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Get the start of the current week (Sunday)
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
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

interface WeeklyTimelineHeaderProps {
  events: ActivityEvent[];
  scrollProgress: number; // 0-1, where 0 is today and 1 is 7 days ago
  currentDayIndex: number; // 0 = today, 6 = 7 days ago
  totalActivities: number;
  onDayClick?: (dayIndex: number) => void;
}

/**
 * Weekly Timeline Header - Prototype Component
 * Shows 7 days of the week with activity levels and scroll progress
 */
function WeeklyTimelineHeader({
  events,
  scrollProgress,
  currentDayIndex, // 0 = today, 6 = 7 days ago (in scroll order)
  totalActivities,
  onDayClick,
}: WeeklyTimelineHeaderProps) {
  const { theme } = useTheme();

  // Build week data starting from Sunday (for display)
  // currentDayIndex represents scroll position: 0 = today, going backward
  const weekData: DayData[] = [];
  const now = new Date();
  const weekStart = getWeekStart(now);
  const todayDayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

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
      dayName: isToday ? 'Today' : WEEK_DAYS[i],
      events: isFuture ? [] : dayEvents,
      contributionLevel: isFuture ? -1 : getContributionLevel(dayEvents.length),
    });
  }

  // Convert scroll-based currentDayIndex to week-based index
  // currentDayIndex 0 = today, 1 = yesterday, etc.
  // We need to map this to the actual day of week
  const getWeekIndexFromScrollIndex = (scrollIdx: number) => {
    // scrollIdx 0 = today, 1 = yesterday, etc.
    const dayOfWeek = todayDayOfWeek - scrollIdx;
    if (dayOfWeek < 0) return -1; // Before this week
    return dayOfWeek;
  };

  const currentWeekIndex = getWeekIndexFromScrollIndex(currentDayIndex);

  // Contribution level colors (GitHub-style)
  const getContributionColor = (level: number) => {
    if (level === -1) return theme.colors.surface + '50'; // Future day - dimmed
    const colors = [
      theme.colors.surface, // 0 - no activity
      theme.colors.success + '40', // 1 - low
      theme.colors.success + '70', // 2 - medium
      theme.colors.success + 'A0', // 3 - high
      theme.colors.success, // 4 - very high
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
          // Days we've scrolled past (between current scroll position and today)
          const isInScrollRange = index >= currentWeekIndex && index <= todayDayOfWeek;

          // Convert week index to scroll index for click handler
          const scrollIndexForDay = todayDayOfWeek - index;

          return (
            <button
              key={index}
              onClick={() => !isFuture && onDayClick?.(scrollIndexForDay)}
              className="flex-1 flex flex-col items-center justify-center relative transition-all"
              style={{
                background: isCurrentSegment
                  ? theme.colors.primary + '20'
                  : isInScrollRange && !isFuture
                    ? theme.colors.surface
                    : 'transparent',
                borderRight: index < 6 ? `1px solid ${theme.colors.border}` : 'none',
                cursor: isFuture ? 'default' : 'pointer',
                opacity: isFuture ? 0.4 : 1,
              }}
            >
              {/* Activity indicator with count inside */}
              <div
                className="rounded flex items-center justify-center"
                style={{
                  width: '20px',
                  height: '20px',
                  background: getContributionColor(day.contributionLevel),
                  border: `1px solid ${hasActivity ? theme.colors.success + '50' : theme.colors.border}`,
                  boxShadow: isCurrentSegment ? `0 0 0 2px ${theme.colors.primary}40` : 'none',
                  fontSize: '10px',
                  fontWeight: theme.fontWeights.semibold,
                  color: day.contributionLevel >= 2 ? '#fff' : theme.colors.textMuted,
                }}
                title={isFuture ? 'Future' : `${day.dayName}: ${day.events.length} activities`}
              >
                {!isFuture && day.events.length > 0 ? day.events.length : ''}
              </div>

              {/* Current position indicator */}
              {isCurrentSegment && (
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: '3px',
                    background: theme.colors.primary,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Activity summary bar - expands when at bottom */}
      <div
        className="px-3 py-2 flex items-center justify-between transition-all"
        style={{
          background: scrollProgress > 0.9 ? theme.colors.success + '10' : 'transparent',
          borderTop: scrollProgress > 0.9 ? `1px solid ${theme.colors.success}30` : 'none',
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

/**
 * Demo component that simulates the feed with scroll tracking
 * Feed starts at Today and scrolls backward through the week
 */
function WeeklyTimelineDemo() {
  const { theme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentDayIndex, setCurrentDayIndex] = useState(0); // 0 = today, goes up as we scroll back
  const [events] = useState(() => generateWeeklyActivity());

  const now = new Date();
  const todayDayOfWeek = now.getDay(); // 0 = Sunday

  // Group events by scroll index (0 = today, 1 = yesterday, etc.)
  // Only show days up to the start of this week (Sunday)
  const eventsByScrollIndex = new Map<number, ActivityEvent[]>();
  const maxScrollIndex = todayDayOfWeek; // Can only scroll back to Sunday of this week

  events.forEach((event) => {
    const eventDate = new Date(event.timestamp);
    const dayDiff = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff >= 0 && dayDiff <= maxScrollIndex) {
      if (!eventsByScrollIndex.has(dayDiff)) {
        eventsByScrollIndex.set(dayDiff, []);
      }
      eventsByScrollIndex.get(dayDiff)!.push(event);
    }
  });

  // Track section positions for scroll-to-day
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const maxScroll = scrollHeight - clientHeight;
    const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
    setScrollProgress(progress);

    // Determine current day based on scroll position
    const containerTop = scrollRef.current.getBoundingClientRect().top;
    let currentDay = 0;

    sectionRefs.current.forEach((ref, day) => {
      const rect = ref.getBoundingClientRect();
      if (rect.top <= containerTop + 60) {
        currentDay = day;
      }
    });

    setCurrentDayIndex(currentDay);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const scrollToDay = (scrollIndex: number) => {
    const section = sectionRefs.current.get(scrollIndex);
    if (section && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const sectionTop = section.getBoundingClientRect().top;
      const offset = sectionTop - containerTop - 60;
      scrollRef.current.scrollBy({ top: offset, behavior: 'smooth' });
    }
  };

  const getDayLabel = (scrollIndex: number) => {
    if (scrollIndex === 0) return 'Today';
    if (scrollIndex === 1) return 'Yesterday';
    const date = new Date(now);
    date.setDate(date.getDate() - scrollIndex);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Number of day sections to show (from today back to Sunday)
  const numDaysToShow = maxScrollIndex + 1;

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <WeeklyTimelineHeader
        events={events}
        scrollProgress={scrollProgress}
        currentDayIndex={currentDayIndex}
        totalActivities={events.length}
        onDayClick={scrollToDay}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {Array.from({ length: numDaysToShow }, (_, scrollIndex) => {
          const dayEvents = eventsByScrollIndex.get(scrollIndex) || [];

          return (
            <div
              key={scrollIndex}
              ref={(el) => {
                if (el) sectionRefs.current.set(scrollIndex, el);
              }}
            >
              {/* Day section header - skip for Today since it's always at top */}
              {scrollIndex > 0 && (
                <div
                  className="px-3 py-2"
                  style={{
                    background: theme.colors.surface,
                    borderBottom: `1px solid ${theme.colors.border}`,
                    fontSize: `${theme.fontSizes[1]}px`,
                    fontFamily: theme.fonts.body,
                    fontWeight: theme.fontWeights.medium,
                    color: theme.colors.textMuted,
                  }}
                >
                  {getDayLabel(scrollIndex)}
                </div>
              )}

              {/* Events for this day */}
              {dayEvents.length === 0 ? (
                <div
                  className="px-4 py-8 text-center"
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: `${theme.fontSizes[1]}px`,
                    fontFamily: theme.fonts.body,
                  }}
                >
                  No activity
                </div>
              ) : (
                dayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="px-4 py-3 border-b flex items-start gap-3"
                    style={{ borderColor: theme.colors.border }}
                  >
                    <img
                      src={`https://github.com/${event.repository.split('/')[0]}.png?size=64`}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            background:
                              event.type === 'commit'
                                ? theme.colors.info + '20'
                                : event.type === 'pr_merged'
                                  ? '#8957e520'
                                  : theme.colors.success + '20',
                            color:
                              event.type === 'commit'
                                ? theme.colors.info
                                : event.type === 'pr_merged'
                                  ? '#8957e5'
                                  : theme.colors.success,
                          }}
                        >
                          {event.type === 'commit'
                            ? 'Commits'
                            : event.type === 'pr_merged'
                              ? 'Merged PR'
                              : event.type === 'pr_opened'
                                ? 'Opened PR'
                                : 'Issue'}
                        </span>
                        <span
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            color: theme.colors.textMuted,
                          }}
                        >
                          {event.repository.split('/')[1]}
                        </span>
                      </div>
                      {event.title ? (
                        <div
                          className="mt-1 truncate"
                          style={{
                            fontSize: `${theme.fontSizes[1]}px`,
                            color: theme.colors.text,
                          }}
                        >
                          {event.title}
                        </div>
                      ) : event.metadata?.commitCount ? (
                        <div
                          className="mt-1"
                          style={{
                            fontSize: `${theme.fontSizes[1]}px`,
                            color: theme.colors.text,
                          }}
                        >
                          {event.metadata.commitCount} commit
                          {event.metadata.commitCount !== 1 ? 's' : ''}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}

        {/* Activity Summary Box - shows at the very bottom */}
        <div
          className="p-4 m-4 rounded-lg"
          style={{
            background: theme.colors.success + '10',
            border: `1px solid ${theme.colors.success}30`,
          }}
        >
          <div
            className="text-center mb-3"
            style={{
              fontSize: `${theme.fontSizes[2]}px`,
              fontFamily: theme.fonts.body,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            This Week
          </div>

          {/* Mini contribution graph - Sun through Sat */}
          <div className="flex justify-center gap-1 mb-3">
            {WEEK_DAYS.map((dayName, weekDayIndex) => {
              // Convert week day index to scroll index
              const scrollIdx = todayDayOfWeek - weekDayIndex;
              const isFuture = weekDayIndex > todayDayOfWeek;
              const dayEvents = scrollIdx >= 0 ? (eventsByScrollIndex.get(scrollIdx) || []) : [];
              const level = isFuture ? -1 : getContributionLevel(dayEvents.length);
              const colors = [
                theme.colors.surface,
                theme.colors.success + '40',
                theme.colors.success + '70',
                theme.colors.success + 'A0',
                theme.colors.success,
              ];

              return (
                <div key={weekDayIndex} className="flex flex-col items-center gap-1">
                  <div
                    className="w-6 h-6 rounded"
                    style={{
                      background: level === -1 ? theme.colors.surface + '50' : colors[level],
                      border: `1px solid ${theme.colors.border}`,
                      opacity: isFuture ? 0.4 : 1,
                    }}
                    title={isFuture ? 'Future' : `${dayEvents.length} activities`}
                  />
                  <span
                    style={{
                      fontSize: '9px',
                      color: theme.colors.textMuted,
                      opacity: isFuture ? 0.4 : 1,
                    }}
                  >
                    {dayName.charAt(0)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className="text-center"
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              fontFamily: theme.fonts.body,
              color: theme.colors.textMuted,
            }}
          >
            <span style={{ color: theme.colors.success, fontWeight: theme.fontWeights.semibold }}>
              {events.filter(e => {
                const eventDate = new Date(e.timestamp);
                const dayDiff = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
                return dayDiff >= 0 && dayDiff <= todayDayOfWeek;
              }).length}
            </span>{' '}
            activities this week
          </div>
        </div>
      </div>
    </div>
  );
}

// Story wrapper
const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div style={{ height: '600px', width: '400px', border: '1px solid #333' }}>{children}</div>
      </AuthProvider>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: 'Activity/WeeklyTimelineHeader (Prototype)',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

/**
 * Interactive demo showing the weekly timeline header with scroll tracking.
 * - Click on a day to jump to that section
 * - Scroll to see the progress indicator move
 * - Activity boxes show contribution levels
 * - Summary appears when near the bottom
 */
export const Interactive: StoryObj = {
  render: () => (
    <StoryWrapper>
      <WeeklyTimelineDemo />
    </StoryWrapper>
  ),
};

/**
 * Header only - showing different scroll positions
 */
export const HeaderStates: StoryObj = {
  render: () => {
    const events = generateWeeklyActivity();

    return (
      <ThemeProvider>
        <div className="space-y-4 p-4" style={{ width: '400px' }}>
          <div className="border rounded overflow-hidden">
            <p className="p-2 bg-gray-800 text-white text-sm">At Top (Today)</p>
            <WeeklyTimelineHeader
              events={events}
              scrollProgress={0}
              currentDayIndex={0}
              totalActivities={events.length}
            />
          </div>

          <div className="border rounded overflow-hidden">
            <p className="p-2 bg-gray-800 text-white text-sm">Mid-week (3 days ago)</p>
            <WeeklyTimelineHeader
              events={events}
              scrollProgress={0.43}
              currentDayIndex={3}
              totalActivities={events.length}
            />
          </div>

          <div className="border rounded overflow-hidden">
            <p className="p-2 bg-gray-800 text-white text-sm">Near Bottom (showing summary)</p>
            <WeeklyTimelineHeader
              events={events}
              scrollProgress={0.85}
              currentDayIndex={5}
              totalActivities={events.length}
            />
          </div>

          <div className="border rounded overflow-hidden">
            <p className="p-2 bg-gray-800 text-white text-sm">At Bottom (full summary)</p>
            <WeeklyTimelineHeader
              events={events}
              scrollProgress={1}
              currentDayIndex={6}
              totalActivities={events.length}
            />
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

/**
 * With high activity - lots of contributions
 */
export const HighActivity: StoryObj = {
  render: () => {
    // Generate lots of events
    const events: ActivityEvent[] = [];
    const now = new Date();

    for (let day = 0; day < 7; day++) {
      const dayDate = new Date(now);
      dayDate.setDate(dayDate.getDate() - day);

      for (let i = 0; i < 8 + Math.floor(Math.random() * 5); i++) {
        const eventDate = new Date(dayDate);
        eventDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);

        events.push({
          id: `high-${day}-${i}`,
          type: 'commit',
          timestamp: eventDate.toISOString(),
          repository: 'octocat/hello-world',
          ownerType: 'User',
          metadata: { commitCount: Math.floor(Math.random() * 10) + 1 },
        });
      }
    }

    return (
      <StoryWrapper>
        <ThemeProvider>
          <div style={{ height: '100%' }}>
            <WeeklyTimelineHeader
              events={events}
              scrollProgress={0.5}
              currentDayIndex={3}
              totalActivities={events.length}
            />
            <div className="p-4 text-center" style={{ color: '#888' }}>
              High activity week - all boxes should be dark green
            </div>
          </div>
        </ThemeProvider>
      </StoryWrapper>
    );
  },
};

/**
 * With no activity - empty week
 */
export const NoActivity: StoryObj = {
  render: () => (
    <StoryWrapper>
      <ThemeProvider>
        <div style={{ height: '100%' }}>
          <WeeklyTimelineHeader
            events={[]}
            scrollProgress={0}
            currentDayIndex={0}
            totalActivities={0}
          />
          <div className="p-4 text-center" style={{ color: '#888' }}>
            No activity - all boxes should be empty/gray
          </div>
        </div>
      </ThemeProvider>
    </StoryWrapper>
  ),
};
