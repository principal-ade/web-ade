import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import {
  RepoAboutCard,
  type RepoAboutInfo,
  type RepoAboutContributor,
} from './RepoAboutCard';

// The card is presentational — it takes its data as props — so stories drive it
// with typed fixtures rather than mocking the network. (In real pages a thin
// connected wrapper feeds it from the tRPC github hooks.)

const mockInfo: RepoAboutInfo = {
  description:
    'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
  stargazers_count: 224_318,
  created_at: '2013-05-24T16:15:54Z',
  license: { spdx_id: 'MIT' },
};

const mockContributors: RepoAboutContributor[] = [
  {
    id: 1,
    login: 'gaearon',
    avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4',
    html_url: 'https://github.com/gaearon',
    contributions: 1843,
  },
  {
    id: 2,
    login: 'sophiebits',
    avatar_url: 'https://avatars.githubusercontent.com/u/6820?v=4',
    html_url: 'https://github.com/sophiebits',
    contributions: 1502,
  },
  {
    id: 3,
    login: 'acdlite',
    avatar_url: 'https://avatars.githubusercontent.com/u/3624098?v=4',
    html_url: 'https://github.com/acdlite',
    contributions: 1211,
  },
  {
    id: 4,
    login: 'bvaughn',
    avatar_url: 'https://avatars.githubusercontent.com/u/29597?v=4',
    html_url: 'https://github.com/bvaughn',
    contributions: 987,
  },
];

// Rail-width wrapper so the card renders at roughly its real size in the pane.
const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div style={{ width: 340 }}>{children}</div>
  </ThemeProvider>
);

const meta: Meta<typeof RepoAboutCard> = {
  title: 'Home/RepoAboutCard',
  component: RepoAboutCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RepoAboutCard>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="facebook"
        repo="react"
        info={mockInfo}
        contributors={mockContributors}
        fileCount={2438}
      />
    </StoryWrapper>
  ),
};

export const WithLineCount: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="facebook"
        repo="react"
        info={mockInfo}
        contributors={mockContributors}
        totalLines={512_904}
      />
    </StoryWrapper>
  ),
};

export const ClickableContributors: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="facebook"
        repo="react"
        info={mockInfo}
        contributors={mockContributors}
        fileCount={2438}
        onSelectContributor={(c) => alert(`Open profile: ${c.login}`)}
      />
    </StoryWrapper>
  ),
};

export const WithReadme: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="facebook"
        repo="react"
        info={mockInfo}
        contributors={mockContributors}
        fileCount={2438}
        readmePath="README.md"
        onOpenReadme={() => alert('Open README')}
        readmeActive={false}
      />
    </StoryWrapper>
  ),
};

export const NoDescription: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="octocat"
        repo="hello-world"
        info={{
          description: null,
          stargazers_count: 12,
          created_at: '2022-11-02T09:00:00Z',
          license: null,
        }}
        contributors={mockContributors.slice(0, 2)}
        fileCount={7}
      />
    </StoryWrapper>
  ),
};

export const CopyleftLicense: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="torvalds"
        repo="linux"
        info={{
          description: 'Linux kernel source tree.',
          stargazers_count: 178_902,
          created_at: '2011-09-04T22:48:11Z',
          license: { spdx_id: 'GPL-2.0' },
        }}
        contributors={mockContributors}
        fileCount={84_231}
      />
    </StoryWrapper>
  ),
};

export const ForkedRepo: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="someone"
        repo="react"
        info={{
          ...mockInfo,
          fork: true,
          parent: { full_name: 'facebook/react' },
        }}
        contributors={mockContributors.slice(0, 3)}
        fileCount={2438}
      />
    </StoryWrapper>
  ),
};

export const NoContributorsYet: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard
        owner="facebook"
        repo="react"
        info={mockInfo}
        contributors={null}
        fileCount={2438}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <RepoAboutCard owner="facebook" repo="react" info={null} loading />
    </StoryWrapper>
  ),
};
