import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import {
  HomeRecentlyVisitedView,
  type RecentTrailItem,
} from './HomeRecentlyVisitedView';
import type { ProjectRepo } from './HomeProjectsView';

const project = (id: number, full_name: string): ProjectRepo => {
  const [login, name] = full_name.split('/');
  return {
    id,
    full_name,
    name: name ?? full_name,
    owner: {
      login: login ?? 'owner',
      avatar_url: `https://avatars.githubusercontent.com/u/${id * 11}?v=4`,
    },
  };
};

const projects: ProjectRepo[] = [
  project(1, 'facebook/react'),
  project(2, 'principal-ai/file-city'),
  project(3, 'you/web-ade'),
];

const trails: RecentTrailItem[] = [
  { id: 't1', title: 'How auth refresh works', owner: 'you', repo: 'web-ade', lastVisitedAt: '2026-06-30T10:00:00Z' },
  { id: 't2', title: 'The File City render pipeline', owner: 'principal-ai', repo: 'file-city', lastVisitedAt: '2026-06-28T18:30:00Z' },
];

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div className="flex flex-col" style={{ width: 340, height: 620, border: '1px solid #ccc' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeRecentlyVisitedView> = {
  title: 'Home/HomeRecentlyVisitedView',
  component: HomeRecentlyVisitedView,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeRecentlyVisitedView>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <HomeRecentlyVisitedView
        projects={projects}
        trails={trails}
        onSelectRepo={(r) => alert(`Open ${r.full_name}`)}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const OnlyProjects: Story = {
  render: () => (
    <StoryWrapper>
      <HomeRecentlyVisitedView
        projects={projects}
        trails={[]}
        onSelectRepo={(r) => alert(`Open ${r.full_name}`)}
        onBack={() => {}}
      />
    </StoryWrapper>
  ),
};

export const OnlyTrails: Story = {
  render: () => (
    <StoryWrapper>
      <HomeRecentlyVisitedView
        projects={[]}
        trails={trails}
        onSelectRepo={() => {}}
        onBack={() => {}}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <HomeRecentlyVisitedView projects={null} trails={null} onSelectRepo={() => {}} onBack={() => {}} />
    </StoryWrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <HomeRecentlyVisitedView projects={[]} trails={[]} onSelectRepo={() => {}} onBack={() => {}} />
    </StoryWrapper>
  ),
};
