import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { AuthProvider } from '@/contexts/AuthContext';
import { ResponsiveConfigurablePanelLayout } from '@principal-ade/panel-layouts';
import { UserActivityPanel } from './UserActivityPanel';
import {
  getMockPanelProps,
  mockActivityEvents,
  mockUserInfo,
  mockCommitDetails,
} from './__mocks__/activityMocks';
import type { ActivityEvent } from '@/app/api/github/user/[username]/activity/route';

// Generate mock contributions
const generateContributions = () => {
  const contributions = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    contributions.push({
      date: date.toISOString().split('T')[0],
      count: Math.floor(Math.random() * 10),
    });
  }
  return contributions;
};

// Generate activity spread across the week (for testing WeeklyTimelineHeader)
const generateWeeklyActivity = (): ActivityEvent[] => {
  const events: ActivityEvent[] = [];
  const now = new Date();
  const todayDayOfWeek = now.getDay(); // 0 = Sunday

  // Generate events for each day from Sunday to today
  for (let dayOffset = 0; dayOffset <= todayDayOfWeek; dayOffset++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() - (todayDayOfWeek - dayOffset));

    // Random number of events per day (1-5)
    const eventCount = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < eventCount; i++) {
      const hourOffset = Math.floor(Math.random() * 24);
      const eventDate = new Date(dayDate);
      eventDate.setHours(hourOffset, Math.floor(Math.random() * 60), 0, 0);

      const types: ActivityEvent['type'][] = ['commit', 'pr_merged', 'pr_opened', 'issue_opened'];
      const type = types[Math.floor(Math.random() * types.length)]!;
      const repos = ['octocat/hello-world', 'github/linguist', 'facebook/react'];
      const repo = repos[Math.floor(Math.random() * repos.length)]!;

      events.push({
        id: `weekly-${dayOffset}-${i}-${Date.now()}`,
        type,
        timestamp: eventDate.toISOString(),
        repository: repo,
        ownerType: repo.includes('octocat') ? 'User' : 'Organization',
        title: type === 'commit' ? undefined : `Sample ${type.replace('_', ' ')} #${i + 1}`,
        url: type === 'commit' ? undefined : `https://github.com/${repo}/issues/${i + 1}`,
        metadata: type === 'commit'
          ? { commitCount: Math.floor(Math.random() * 5) + 1 }
          : { prNumber: i + 1, issueNumber: i + 1 },
      });
    }
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Story wrapper that mocks fetch and provides all contexts
const StoryWrapper: React.FC<{
  children: React.ReactNode;
  activityData?: ActivityEvent[];
  loading?: boolean;
  error?: string | null;
}> = ({ children, activityData = mockActivityEvents, loading = false, error = null }) => {
  const [ready, setReady] = React.useState(false);
  const originalFetchRef = React.useRef<typeof global.fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = global.fetch;

    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Simulate loading
      if (loading) {
        await new Promise(() => {}); // Never resolves
      }

      if (url.includes('/activity')) {
        if (error) {
          return new Response(JSON.stringify({ error }), { status: 500 });
        }
        return new Response(
          JSON.stringify({
            user: mockUserInfo,
            activity: activityData,
            contributions: generateContributions(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/commits/')) {
        return new Response(
          JSON.stringify({ commits: mockCommitDetails }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock issue details endpoint
      if (url.match(/\/api\/github\/repo\/[\w-]+\/[\w-]+\/issues\/\d+$/)) {
        return new Response(
          JSON.stringify({
            number: 101,
            title: 'Bug: Button not clickable on mobile',
            body: '## Description\n\nThe submit button is not responding to clicks on iOS Safari. This appears to be a CSS issue with the z-index.\n\n## Steps to Reproduce\n\n1. Open the app on iOS Safari\n2. Navigate to the form page\n3. Try to click the submit button\n\n## Expected Behavior\n\nButton should be clickable and submit the form.\n\n## Actual Behavior\n\nButton does not respond to clicks.\n\n## Configuration\n\nHere\'s the current button config:\n\n```json\n{\n  "button": {\n    "type": "submit",\n    "className": "btn-primary btn-large btn-submit-form btn-with-icon btn-shadow btn-rounded",\n    "zIndex": 10,\n    "position": "relative",\n    "ariaLabel": "Submit the user registration form and proceed to the email verification step",\n    "description": "This button component handles form submission with built-in validation, error handling, and loading states. It supports multiple themes and can be customized with various CSS classes.",\n    "errorMessage": "Unable to submit the form due to validation errors. Please check all required fields and ensure your email address is valid before trying again.",\n    "styles": {\n      "backgroundColor": "#0969da",\n      "color": "#ffffff",\n      "padding": "12px 24px",\n      "borderRadius": "6px",\n      "boxShadow": "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)"\n    }\n  }\n}\n```',
            state: 'open',
            html_url: 'https://github.com/octocat/hello-world/issues/101',
            user: {
              login: 'octocat',
              avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
            },
            labels: [],
            comments: 5,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock PR details endpoint
      if (url.match(/\/api\/github\/repo\/[\w-]+\/[\w-]+\/pull-requests\/\d+$/)) {
        return new Response(
          JSON.stringify({
            number: 42,
            title: 'feat: add dark mode toggle',
            body: '## Summary\n\nThis PR adds a dark mode toggle to the application settings.\n\n## Changes\n\n- Added theme context provider\n- Implemented dark mode CSS variables\n- Added toggle button in settings panel\n- Updated all components to respect theme preference\n\n## Testing\n\n- [x] Tested on Chrome, Firefox, Safari\n- [x] Verified localStorage persistence\n- [x] Checked accessibility contrast ratios\n\n## Screenshots\n\n_Dark mode enabled showing improved visibility in low-light conditions_',
            state: 'merged',
            html_url: 'https://github.com/octocat/spoon-knife/pull/42',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetchRef.current!(input);
    };

    setReady(true);

    return () => {
      if (originalFetchRef.current) {
        global.fetch = originalFetchRef.current;
      }
    };
  }, [activityData, loading, error]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <div style={{ height: '100%', width: '100%' }}>
          {children}
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
};

const meta: Meta<typeof UserActivityPanel> = {
  title: 'Activity/UserActivityPanel',
  component: UserActivityPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof UserActivityPanel>;

const mockProps = getMockPanelProps();

/**
 * Default state with mock activity data showing commits, PRs, and issues
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Loading state while fetching activity data
 */
export const Loading: Story = {
  render: () => (
    <StoryWrapper loading>
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Empty state when user has no recent activity
 */
export const Empty: Story = {
  render: () => (
    <StoryWrapper activityData={[]}>
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Error state when activity fetch fails
 */
export const Error: Story = {
  render: () => (
    <StoryWrapper error="Failed to fetch activity data. Please try again.">
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Activity with only commits
 */
export const CommitsOnly: Story = {
  render: () => (
    <StoryWrapper activityData={mockActivityEvents.filter((e) => e.type === 'commit')}>
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Activity with only pull requests
 */
export const PullRequestsOnly: Story = {
  render: () => (
    <StoryWrapper
      activityData={mockActivityEvents.filter(
        (e) => e.type === 'pr_merged' || e.type === 'pr_opened'
      )}
    >
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Activity with only issues
 */
export const IssuesOnly: Story = {
  render: () => (
    <StoryWrapper
      activityData={mockActivityEvents.filter(
        (e) => e.type === 'issue_opened' || e.type === 'issue_closed'
      )}
    >
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Many activity items to test scrolling
 */
export const ManyItems: Story = {
  render: () => (
    <StoryWrapper
      activityData={[
        ...mockActivityEvents,
        ...mockActivityEvents.map((e, i) => ({ ...e, id: `${e.id}-copy-${i}` })),
        ...mockActivityEvents.map((e, i) => ({ ...e, id: `${e.id}-copy2-${i}` })),
      ]}
    >
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Weekly activity spread across multiple days to test WeeklyTimelineHeader
 * - Shows contribution boxes for Sun-Sat
 * - Click boxes to jump to that day
 * - Scroll to see day indicator move
 */
export const WeeklyTimeline: Story = {
  render: () => {
    // Generate fresh data on each render
    const weeklyData = generateWeeklyActivity();
    return (
      <StoryWrapper activityData={weeklyData}>
        <UserActivityPanel {...mockProps} username="octocat" />
      </StoryWrapper>
    );
  },
};

// Mock data with very long titles to test text overflow/truncation
const longTitleEvents: ActivityEvent[] = [
  {
    id: 'pr-merged-long-1',
    type: 'pr_merged',
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    repository: 'octocat/hello-world',
    ownerType: 'User',
    title: 'feat: implement comprehensive user authentication system with OAuth2, SAML, and OpenID Connect support including multi-factor authentication and session management',
    url: 'https://github.com/octocat/hello-world/pull/100',
    metadata: { prNumber: 100, additions: 500, deletions: 50 },
  },
  {
    id: 'pr-opened-long-2',
    type: 'pr_opened',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    repository: 'facebook/react',
    ownerType: 'Organization',
    title: 'refactor(core): migrate entire codebase from class components to functional components with hooks while maintaining backwards compatibility and adding comprehensive TypeScript types',
    url: 'https://github.com/facebook/react/pull/200',
    metadata: { prNumber: 200 },
  },
  {
    id: 'issue-opened-long-3',
    type: 'issue_opened',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    repository: 'octocat/spoon-knife',
    ownerType: 'User',
    title: 'Bug: Application crashes when user attempts to upload files larger than 2GB with special characters in filename on Windows systems running in dark mode',
    url: 'https://github.com/octocat/spoon-knife/issues/300',
    metadata: { issueNumber: 300 },
  },
  {
    id: 'pr-merged-long-4',
    type: 'pr_merged',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    repository: 'github/linguist',
    ownerType: 'Organization',
    title: 'fix: resolve critical memory leak in background worker process that causes server to become unresponsive after processing approximately 10,000 concurrent requests',
    url: 'https://github.com/github/linguist/pull/400',
    metadata: { prNumber: 400, additions: 25, deletions: 100 },
  },
  {
    id: 'issue-opened-long-5',
    type: 'issue_opened',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    repository: 'octocat/hello-world',
    ownerType: 'User',
    title: 'Feature request: add support for real-time collaborative editing with conflict resolution, presence indicators, cursor tracking, and undo/redo history synchronization',
    url: 'https://github.com/octocat/hello-world/issues/500',
    metadata: { issueNumber: 500, isClosed: true, closedBy: 'octocat' },
  },
];

/**
 * Tests long PR/issue titles to verify they truncate properly
 * - Titles should not overflow the panel width
 * - Text should be truncated with ellipsis
 * - Full title visible on hover (via title attribute)
 */
export const LongTitles: Story = {
  render: () => (
    <StoryWrapper activityData={longTitleEvents}>
      <UserActivityPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Long titles in a narrow container to stress-test overflow handling
 */
export const LongTitlesNarrow: Story = {
  render: () => (
    <StoryWrapper activityData={longTitleEvents}>
      <div style={{ width: '320px' }}>
        <UserActivityPanel {...mockProps} username="octocat" />
      </div>
    </StoryWrapper>
  ),
};

/**
 * Timeline panel in a responsive layout with the panel in the middle
 * Tests the panel in a three-column responsive layout setup
 */
export const ResponsiveLayoutMiddle: Story = {
  render: () => {
    const weeklyData = generateWeeklyActivity();

    return (
      <StoryWrapper activityData={weeklyData}>
        <div style={{ height: '600px', width: '100%' }}>
          <ResponsiveConfigurablePanelLayout
            theme={{
              colors: {
                background: '#ffffff',
                surface: '#f6f8fa',
                border: '#d0d7de',
                text: '#24292f',
                textMuted: '#57606a',
                primary: '#0969da',
                textOnPrimary: '#ffffff',
              },
              fonts: {
                body: 'system-ui, -apple-system, sans-serif',
                monospace: 'ui-monospace, monospace',
              },
              fontSizes: [11, 12, 14, 16, 20, 24, 32, 48],
              fontWeights: {
                normal: 400,
                medium: 500,
                semibold: 600,
                bold: 700,
              },
            }}
            panels={[
              {
                id: 'left-panel',
                label: 'Left',
                content: (
                  <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
                    <h3 style={{ marginBottom: '8px' }}>Left Panel</h3>
                    <p style={{ color: '#57606a', fontSize: '14px' }}>
                      This is a placeholder for the left panel content.
                    </p>
                  </div>
                ),
              },
              {
                id: 'activity-timeline',
                label: 'Timeline',
                content: (
                  <div className="h-full w-full overflow-hidden">
                    <UserActivityPanel {...mockProps} username="octocat" />
                  </div>
                ),
              },
              {
                id: 'right-panel',
                label: 'Right',
                content: (
                  <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
                    <h3 style={{ marginBottom: '8px' }}>Right Panel</h3>
                    <p style={{ color: '#57606a', fontSize: '14px' }}>
                      This is a placeholder for the right panel content.
                    </p>
                  </div>
                ),
              },
            ]}
            layout={{
              left: 'left-panel',
              middle: 'activity-timeline',
              right: 'right-panel',
            }}
            defaultSizes={{
              left: 25,
              middle: 50,
              right: 25,
            }}
            collapsiblePanels={{
              left: true,
              right: true,
            }}
            collapsed={{
              left: false,
              right: false,
            }}
            showCollapseButtons={true}
            mobileBreakpoint="(max-width: 768px)"
          />
        </div>
      </StoryWrapper>
    );
  },
};
