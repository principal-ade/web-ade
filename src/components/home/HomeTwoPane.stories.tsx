import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { HomeTwoPane } from './HomeTwoPane';
import type { UserAboutInfo } from './UserAboutCard';
import type { ProjectSection } from './HomeProjectsView';

const user: UserAboutInfo = {
  login: 'gaearon',
  name: 'Dan Abramov',
  avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4',
  html_url: 'https://github.com/gaearon',
  bio: 'Working on @bluesky. Formerly React at Meta.',
  company: '@bluesky',
  location: 'London, UK',
  followers: 84_213,
  following: 171,
  public_repos: 258,
  created_at: '2011-05-25T20:56:07Z',
};

const projects: ProjectSection[] = [
  {
    key: 'you',
    label: 'Your repositories',
    repos: [
      {
        id: 1,
        name: 'web-ade',
        full_name: 'gaearon/web-ade',
        owner: { login: 'gaearon', avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4' },
        description: 'The web app.',
        language: 'TypeScript',
        stargazers_count: 128,
      },
      {
        id: 2,
        name: 'dotfiles',
        full_name: 'gaearon/dotfiles',
        owner: { login: 'gaearon', avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4' },
        description: null,
        language: 'Shell',
        stargazers_count: 4,
        private: true,
      },
    ],
  },
  {
    key: 'principal-ai',
    label: 'principal-ai',
    avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
    repos: [
      {
        id: 3,
        name: 'file-city',
        full_name: 'principal-ai/file-city',
        owner: { login: 'principal-ai', avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4' },
        description: '3D code visualizations.',
        language: 'TypeScript',
        stargazers_count: 512,
      },
    ],
  },
];

// Full-viewport frame (the shell fills its parent with flex-1).
const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div className="flex flex-col" style={{ width: '100vw', height: '100vh' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeTwoPane> = {
  title: 'Home/HomeTwoPane',
  component: HomeTwoPane,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeTwoPane>;

// Open "Your Projects" from the rail, pick a repo → the right pane names it
// (the live File City mounts here in the app).
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTwoPane
        user={user}
        counts={{ projects: 42, starred: 128, bookmarks: 9, library: 15, recent: 6 }}
        projects={projects}
        onSelectRepo={(r) => console.log('selected', r?.full_name ?? null)}
        onViewChange={(v) => console.log('view', v)}
      />
    </StoryWrapper>
  ),
};

// Demonstrates the render slot: the app passes the real File City here.
export const CustomRightPane: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTwoPane
        user={user}
        counts={{ projects: 42, starred: 128, bookmarks: 9, library: 15, recent: 6 }}
        projects={projects}
        renderRightPane={(repo) => (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ background: '#0d1117', color: '#8b949e', fontFamily: 'monospace' }}
          >
            {repo ? `‹FileCityGuidePanel ${repo.full_name}/›` : 'idle city'}
          </div>
        )}
      />
    </StoryWrapper>
  ),
};
