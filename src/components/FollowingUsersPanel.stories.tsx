import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { FollowingUsersPanel } from './FollowingUsersPanel';
import {
  getMockPanelProps,
  mockFollowingUsers,
} from './__mocks__/activityMocks';

interface FollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
}

// Story wrapper that mocks fetch and provides theme
const StoryWrapper: React.FC<{
  children: React.ReactNode;
  followingData?: FollowingUser[];
  loading?: boolean;
  error?: string | null;
}> = ({ children, followingData = mockFollowingUsers, loading = false, error = null }) => {
  React.useEffect(() => {
    const originalFetch = global.fetch;

    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (loading) {
        await new Promise(() => {});
      }

      if (url.includes('/following')) {
        if (error) {
          return new Response(JSON.stringify({ error }), { status: 500 });
        }
        return new Response(
          JSON.stringify({ following: followingData }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetch(input);
    };

    return () => {
      global.fetch = originalFetch;
    };
  }, [followingData, loading, error]);

  return (
    <ThemeProvider>
      <div style={{ height: '600px', width: '300px' }}>
        {children}
      </div>
    </ThemeProvider>
  );
};

const meta: Meta<typeof FollowingUsersPanel> = {
  title: 'Activity/FollowingUsersPanel',
  component: FollowingUsersPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FollowingUsersPanel>;

const mockProps = getMockPanelProps();

/**
 * Default state showing users the current user follows
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <FollowingUsersPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Loading state
 */
export const Loading: Story = {
  render: () => (
    <StoryWrapper loading>
      <FollowingUsersPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Empty state when user doesn't follow anyone
 */
export const Empty: Story = {
  render: () => (
    <StoryWrapper followingData={[]}>
      <FollowingUsersPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * Error state
 */
export const Error: Story = {
  render: () => (
    <StoryWrapper error="Failed to fetch following users">
      <FollowingUsersPanel {...mockProps} username="octocat" />
    </StoryWrapper>
  ),
};

/**
 * No username provided
 */
export const NoUsername: Story = {
  render: () => (
    <StoryWrapper>
      <FollowingUsersPanel {...mockProps} />
    </StoryWrapper>
  ),
};

/**
 * Many users following
 */
export const ManyUsers: Story = {
  render: () => {
    const manyUsers: FollowingUser[] = Array.from({ length: 20 }, (_, i) => ({
      login: `user-${i + 1}`,
      name: `User Number ${i + 1}`,
      avatarUrl: `https://avatars.githubusercontent.com/u/${i + 100}?v=4`,
      bio: i % 2 === 0 ? `This is user ${i + 1}'s bio` : null,
    }));

    return (
      <StoryWrapper followingData={manyUsers}>
        <FollowingUsersPanel {...mockProps} username="octocat" />
      </StoryWrapper>
    );
  },
};
