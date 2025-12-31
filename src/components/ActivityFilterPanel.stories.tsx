import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { ActivityFilterPanel } from './ActivityFilterPanel';
import {
  getMockPanelProps,
  mockActivityEvents,
  mockUserInfo,
} from './__mocks__/activityMocks';
import type { ActivityEvent } from '@/app/api/github/user/[username]/activity/route';

// Story wrapper that mocks fetch and provides theme
const StoryWrapper: React.FC<{
  children: React.ReactNode;
  activityData?: ActivityEvent[];
  loading?: boolean;
  error?: string | null;
}> = ({ children, activityData = mockActivityEvents, loading = false, error = null }) => {
  React.useEffect(() => {
    const originalFetch = global.fetch;

    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (loading) {
        await new Promise(() => {});
      }

      if (url.includes('/activity')) {
        if (error) {
          return new Response(JSON.stringify({ error }), { status: 500 });
        }
        return new Response(
          JSON.stringify({ user: mockUserInfo, activity: activityData }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetch(input);
    };

    return () => {
      global.fetch = originalFetch;
    };
  }, [activityData, loading, error]);

  return (
    <ThemeProvider>
      <div style={{ height: '600px', width: '300px' }}>
        {children}
      </div>
    </ThemeProvider>
  );
};

const meta: Meta<typeof ActivityFilterPanel> = {
  title: 'Activity/ActivityFilterPanel',
  component: ActivityFilterPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ActivityFilterPanel>;

const mockProps = getMockPanelProps();

/**
 * Default state showing all filter options with counts
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <ActivityFilterPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Loading state
 */
export const Loading: Story = {
  render: () => (
    <StoryWrapper loading>
      <ActivityFilterPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Empty state with no activity to filter
 */
export const Empty: Story = {
  render: () => (
    <StoryWrapper activityData={[]}>
      <ActivityFilterPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * No username provided
 */
export const NoUsername: Story = {
  render: () => (
    <StoryWrapper>
      <ActivityFilterPanel {...mockProps} />
    </StoryWrapper>
  ),
};

/**
 * With many repositories
 */
export const ManyRepositories: Story = {
  render: () => {
    const repos = ['octocat/repo-1', 'octocat/repo-2', 'octocat/repo-3', 'octocat/repo-4', 'octocat/repo-5'];
    const manyRepoEvents: ActivityEvent[] = repos.flatMap((repo, i) => [
      {
        id: `commit-${repo}-${i}`,
        type: 'commit' as const,
        timestamp: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
        repository: repo,
        metadata: { commitCount: i + 1 },
      },
      {
        id: `pr-${repo}-${i}`,
        type: 'pr_merged' as const,
        timestamp: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString(),
        repository: repo,
        title: `PR for ${repo}`,
        metadata: { prNumber: i + 1 },
      },
    ]);

    return (
      <StoryWrapper activityData={manyRepoEvents}>
        <ActivityFilterPanel {...mockProps} username="octocat" />
      </StoryWrapper>
    );
  },
};
