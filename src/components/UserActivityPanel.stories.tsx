import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { AuthProvider } from '@/contexts/AuthContext';
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
        <div style={{ height: '600px', width: '100%' }}>
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
