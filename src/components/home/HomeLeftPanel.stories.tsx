import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, useTheme } from '@principal-ade/industry-theme';
import { HomeLeftPanel } from './HomeLeftPanel';
import type { UserAboutInfo } from './UserAboutCard';
import type { ProjectSection } from './HomeProjectsView';

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

const fullUser: UserAboutInfo = {
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

// A stand-in for the right pane (the File City), so the 25%-width rail renders at
// a realistic size inside a two-pane frame.
const RightPanePlaceholder: React.FC = () => {
  const { theme } = useTheme();
  return (
    <div
      className="flex-1 flex items-center justify-center"
      style={{
        background: theme.colors.backgroundSecondary,
        color: theme.colors.textMuted,
        fontSize: theme.fontSizes[2],
      }}
    >
      File City (right pane)
    </div>
  );
};

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div
      className="flex"
      style={{ width: 1280, height: 720, border: '1px solid #ccc' }}
    >
      {children}
      <RightPanePlaceholder />
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeLeftPanel> = {
  title: 'Home/HomeLeftPanel',
  component: HomeLeftPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeLeftPanel>;

// Click a nav card to slide into its (placeholder) view, then the back-chevron
// header returns to the About + nav-cards home view.
export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <HomeLeftPanel
        user={fullUser}
        counts={{ projects: 42, starred: 128, bookmarks: 9, library: 15, recent: 6 }}
        projects={projects}
        onSelectRepo={(r) => console.log('select repo →', r.full_name)}
        onViewChange={(v) => console.log('view →', v)}
      />
    </StoryWrapper>
  ),
};

export const FreshAccount: Story = {
  render: () => (
    <StoryWrapper>
      <HomeLeftPanel
        user={{
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
        }}
        counts={{ projects: 0, starred: 0, bookmarks: 0, library: 0, recent: 0 }}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <HomeLeftPanel user={null} userLoading />
    </StoryWrapper>
  ),
};
