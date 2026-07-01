import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { UserAboutCard, type UserAboutInfo } from './UserAboutCard';

// Presentational card — stories drive it with typed fixtures rather than mocking
// the network. In real pages a connected wrapper merges the auth session with a
// GitHub user fetch and feeds this in.

const fullUser: UserAboutInfo = {
  login: 'gaearon',
  name: 'Dan Abramov',
  avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4',
  html_url: 'https://github.com/gaearon',
  bio: 'Working on @bluesky. Formerly React at Meta. I build tools for building tools.',
  company: '@bluesky',
  location: 'London, UK',
  followers: 84_213,
  following: 171,
  public_repos: 258,
  created_at: '2011-05-25T20:56:07Z',
};

// Rail-width wrapper so the card renders at roughly its real size in the pane.
const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div style={{ width: 340 }}>{children}</div>
  </ThemeProvider>
);

const meta: Meta<typeof UserAboutCard> = {
  title: 'Home/UserAboutCard',
  component: UserAboutCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof UserAboutCard>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <UserAboutCard info={fullUser} />
    </StoryWrapper>
  ),
};

// Identity known from auth, but the GitHub enrichment hasn't landed (or the user
// has no bio / stats filled in).
export const IdentityOnly: Story = {
  render: () => (
    <StoryWrapper>
      <UserAboutCard
        info={{
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
        }}
      />
    </StoryWrapper>
  ),
};

export const NoBio: Story = {
  render: () => (
    <StoryWrapper>
      <UserAboutCard
        info={{
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
          html_url: 'https://github.com/octocat',
          bio: null,
          followers: 12_009,
          following: 9,
          public_repos: 8,
          created_at: '2011-01-25T18:44:36Z',
        }}
      />
    </StoryWrapper>
  ),
};

export const NoAvatar: Story = {
  render: () => (
    <StoryWrapper>
      <UserAboutCard
        info={{
          login: 'ada',
          name: 'Ada Lovelace',
          bio: 'The first programmer.',
          followers: 42,
          following: 3,
          public_repos: 1,
          created_at: '2018-07-02T12:00:00Z',
        }}
      />
    </StoryWrapper>
  ),
};

export const LongBio: Story = {
  render: () => (
    <StoryWrapper>
      <UserAboutCard
        info={{
          ...fullUser,
          bio: 'Staff engineer building developer tools and 3D code visualizations. Interested in program comprehension, editor tooling, graphics, and making large codebases legible to the humans who work in them.',
        }}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <UserAboutCard info={null} loading />
    </StoryWrapper>
  ),
};
