import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { HomeRightPaneEmptyState } from './HomeRightPaneEmptyState';
import type { ContributedRepo, ActivityEvent } from './HomeRightPaneEmptyState';

// Generate sample activity data for the heatmap
function generateActivityData(pattern: 'sparse' | 'moderate' | 'active'): Map<string, number> {
  const data = new Map<string, number>();
  const today = new Date();
  
  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0]!;
    
    let count = 0;
    if (pattern === 'sparse') {
      // Only some activity, random sparse pattern
      if (Math.random() > 0.7) {
        count = Math.floor(Math.random() * 5) + 1;
      }
    } else if (pattern === 'moderate') {
      // Moderate activity, weekday bias
      const dayOfWeek = date.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && Math.random() > 0.3) {
        count = Math.floor(Math.random() * 15) + 1;
      } else if (Math.random() > 0.6) {
        count = Math.floor(Math.random() * 5) + 1;
      }
    } else {
      // Active pattern with streaks
      const weekNumber = Math.floor(i / 7);
      if (weekNumber % 3 !== 0) { // 2 weeks on, 1 week off pattern
        count = Math.floor(Math.random() * 25) + 1;
      } else if (Math.random() > 0.5) {
        count = Math.floor(Math.random() * 10) + 1;
      }
    }
    
    if (count > 0) {
      data.set(dateStr, count);
    }
  }
  
  return data;
}

// Sample contributed repos
const sampleRepos: ContributedRepo[] = [
  {
    nameWithOwner: 'facebook/react',
    owner: 'facebook',
    name: 'react',
    url: 'https://github.com/facebook/react',
    commitCount: 127,
    lastContributedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    isPrivate: false,
    ownerType: 'Organization',
    ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/69631?v=4',
  },
  {
    nameWithOwner: 'vercel/next.js',
    owner: 'vercel',
    name: 'next.js',
    url: 'https://github.com/vercel/next.js',
    commitCount: 43,
    lastContributedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    isPrivate: false,
    ownerType: 'Organization',
    ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/14985020?v=4',
  },
  {
    nameWithOwner: 'octocat/my-private-repo',
    owner: 'octocat',
    name: 'my-private-repo',
    url: 'https://github.com/octocat/my-private-repo',
    commitCount: 89,
    lastContributedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    isPrivate: true,
    ownerType: 'User',
    ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
  },
  {
    nameWithOwner: 'microsoft/vscode',
    owner: 'microsoft',
    name: 'vscode',
    url: 'https://github.com/microsoft/vscode',
    commitCount: 12,
    lastContributedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
    isPrivate: false,
    ownerType: 'Organization',
    ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/6154722?v=4',
  },
  {
    nameWithOwner: 'tailwindlabs/tailwindcss',
    owner: 'tailwindlabs',
    name: 'tailwindcss',
    url: 'https://github.com/tailwindlabs/tailwindcss',
    commitCount: 8,
    lastContributedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(), // 3 weeks ago
    isPrivate: false,
    ownerType: 'Organization',
    ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/67109815?v=4',
  },
  {
    nameWithOwner: 'principal-ai/file-city',
    owner: 'principal-ai',
    name: 'file-city',
    url: 'https://github.com/principal-ai/file-city',
    commitCount: 1,
    lastContributedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 5 weeks ago
    isPrivate: false,
    ownerType: 'Organization',
    ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/180898423?v=4',
  },
];

// Sample activity events
const sampleActivityEvents: ActivityEvent[] = [
  {
    id: 'commit-1',
    type: 'commit',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    repository: 'facebook/react',
    repositoryUrl: 'https://github.com/facebook/react',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      commitCount: 3,
    },
  },
  {
    id: 'pr-merged-1',
    type: 'pr_merged',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    repository: 'vercel/next.js',
    repositoryUrl: 'https://github.com/vercel/next.js',
    title: 'Fix: Resolve hydration mismatch in app router',
    url: 'https://github.com/vercel/next.js/pull/12345',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      prNumber: 12345,
      additions: 127,
      deletions: 43,
    },
  },
  {
    id: 'commit-2',
    type: 'commit',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    repository: 'octocat/my-private-repo',
    repositoryUrl: 'https://github.com/octocat/my-private-repo',
    isPrivate: true,
    ownerType: 'User',
    metadata: {
      commitCount: 5,
    },
  },
  {
    id: 'pr-opened-1',
    type: 'pr_opened',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    repository: 'microsoft/vscode',
    repositoryUrl: 'https://github.com/microsoft/vscode',
    title: 'Add support for custom theme overrides',
    url: 'https://github.com/microsoft/vscode/pull/67890',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      prNumber: 67890,
      additions: 234,
      deletions: 12,
    },
  },
  {
    id: 'issue-1',
    type: 'issue_opened',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    repository: 'tailwindlabs/tailwindcss',
    repositoryUrl: 'https://github.com/tailwindlabs/tailwindcss',
    title: 'Feature request: Add support for container queries',
    url: 'https://github.com/tailwindlabs/tailwindcss/issues/5432',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      issueNumber: 5432,
    },
  },
  {
    id: 'commit-3',
    type: 'commit',
    timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
    repository: 'principal-ai/file-city',
    repositoryUrl: 'https://github.com/principal-ai/file-city',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      commitCount: 1,
    },
  },
  {
    id: 'pr-merged-2',
    type: 'pr_merged',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    repository: 'facebook/react',
    repositoryUrl: 'https://github.com/facebook/react',
    title: 'Improve TypeScript types for useEffect',
    url: 'https://github.com/facebook/react/pull/98765',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      prNumber: 98765,
      additions: 45,
      deletions: 23,
    },
  },
  {
    id: 'commit-4',
    type: 'commit',
    timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
    repository: 'vercel/next.js',
    repositoryUrl: 'https://github.com/vercel/next.js',
    isPrivate: false,
    ownerType: 'Organization',
    metadata: {
      commitCount: 2,
    },
  },
];

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div className="flex flex-col" style={{ width: '100vw', height: '100vh' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeRightPaneEmptyState> = {
  title: 'Home/HomeRightPaneEmptyState',
  component: HomeRightPaneEmptyState,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeRightPaneEmptyState>;

/**
 * Default state with moderate activity and several activity events
 */
export const Default: Story = {
  render: (args) => (
    <StoryWrapper>
      <HomeRightPaneEmptyState {...args} />
    </StoryWrapper>
  ),
  args: {
    activityData: generateActivityData('moderate'),
    contributedRepos: sampleRepos,
    activityEvents: sampleActivityEvents,
  },
};

/**
 * Active contributor with lots of recent activity
 */
export const ActiveContributor: Story = {
  render: (args) => (
    <StoryWrapper>
      <HomeRightPaneEmptyState {...args} />
    </StoryWrapper>
  ),
  args: {
    activityData: generateActivityData('active'),
    contributedRepos: sampleRepos.slice(0, 3),
    activityEvents: sampleActivityEvents,
  },
};

/**
 * Sparse activity pattern with fewer contributions
 */
export const SparseActivity: Story = {
  render: (args) => (
    <StoryWrapper>
      <HomeRightPaneEmptyState {...args} />
    </StoryWrapper>
  ),
  args: {
    activityData: generateActivityData('sparse'),
    contributedRepos: sampleRepos.slice(0, 2),
    activityEvents: sampleActivityEvents.slice(0, 3),
  },
};

/**
 * Empty state with no activity or contributions
 */
export const Empty: Story = {
  render: (args) => (
    <StoryWrapper>
      <HomeRightPaneEmptyState {...args} />
    </StoryWrapper>
  ),
  args: {
    activityData: new Map(),
    contributedRepos: [],
    activityEvents: [],
  },
};

/**
 * Only commits activity
 */
export const OnlyCommits: Story = {
  render: (args) => (
    <StoryWrapper>
      <HomeRightPaneEmptyState {...args} />
    </StoryWrapper>
  ),
  args: {
    activityData: generateActivityData('moderate'),
    contributedRepos: sampleRepos,
    activityEvents: sampleActivityEvents.filter(e => e.type === 'commit'),
  },
};

/**
 * Only PRs and issues
 */
export const OnlyPRsAndIssues: Story = {
  render: (args) => (
    <StoryWrapper>
      <HomeRightPaneEmptyState {...args} />
    </StoryWrapper>
  ),
  args: {
    activityData: generateActivityData('moderate'),
    contributedRepos: sampleRepos,
    activityEvents: sampleActivityEvents.filter(e => e.type !== 'commit'),
  },
};
