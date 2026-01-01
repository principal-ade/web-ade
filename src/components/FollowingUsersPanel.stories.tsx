import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { FollowingUsersPanel } from './FollowingUsersPanel';
import {
  getMockPanelProps,
  mockFollowingUsers,
} from './__mocks__/activityMocks';

interface DailyContribution {
  date: string;
  count: number;
}

interface FollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  contributions?: DailyContribution[];
  followersCount?: number;
}

// Generate mock contributions for stories
const generateContributions = (baseActivity: number): DailyContribution[] => {
  const contributions = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    contributions.push({
      date: date.toISOString().split('T')[0],
      count: Math.floor(Math.random() * baseActivity * 2),
    });
  }
  return contributions;
};

// Story wrapper that mocks fetch and provides theme
const StoryWrapper: React.FC<{
  children: React.ReactNode;
  followingData?: FollowingUser[];
  loading?: boolean;
  error?: string | null;
  username?: string;
}> = ({ children, followingData = mockFollowingUsers, loading = false, error = null, username = 'octocat' }) => {
  const [ready, setReady] = React.useState(false);
  const originalFetchRef = React.useRef<typeof global.fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = global.fetch;

    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (loading) {
        await new Promise(() => {});
      }

      // Mock the user activity endpoint (for selfInfo)
      if (url.includes('/activity') && url.includes(`/user/${username}`)) {
        return new Response(
          JSON.stringify({
            user: {
              login: username,
              name: username === 'octocat' ? 'The Octocat' : username,
              avatarUrl: `https://github.com/${username}.png?size=64`,
              followersCount: 12500,
            },
            contributions: generateContributions(5),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock contributions for followed users
      if (url.includes('/activity')) {
        const loginMatch = url.match(/\/user\/([^/]+)\/activity/);
        const login = loginMatch?.[1];
        return new Response(
          JSON.stringify({
            user: { login, name: null, avatarUrl: `https://github.com/${login}.png?size=64` },
            contributions: generateContributions(3),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
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

      return originalFetchRef.current!(input);
    };

    setReady(true);

    return () => {
      if (originalFetchRef.current) {
        global.fetch = originalFetchRef.current;
      }
    };
  }, [followingData, loading, error, username]);

  if (!ready) return null;

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
      contributions: generateContributions(i + 1),
      followersCount: Math.floor(Math.random() * 50000) + 100,
    }));

    return (
      <StoryWrapper followingData={manyUsers}>
        <FollowingUsersPanel {...mockProps} username="octocat" />
      </StoryWrapper>
    );
  },
};
