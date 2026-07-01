import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import {
  HomeProjectsView,
  type ProjectSection,
} from './HomeProjectsView';

const you = (n: number, over?: Partial<ProjectSection['repos'][number]>) => ({
  id: n,
  full_name: `you/project-${n}`,
  name: `project-${n}`,
  owner: {
    login: 'you',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  },
  description: 'A tidy little repository that does one thing well.',
  language: ['TypeScript', 'Python', 'Rust', 'Go'][n % 4],
  stargazers_count: n * 7,
  private: n % 3 === 0,
  ...over,
});

const sections: ProjectSection[] = [
  {
    key: 'you',
    label: 'Your repositories',
    repos: [
      you(1, { name: 'web-ade', full_name: 'you/web-ade' }),
      you(2, { name: 'trail-engine', full_name: 'you/trail-engine', private: false }),
      you(3, { name: 'dotfiles', full_name: 'you/dotfiles', description: null, language: 'Shell' }),
    ],
  },
  {
    key: 'principal',
    label: 'principal-ai',
    avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
    repos: [
      you(4, { name: 'file-city', full_name: 'principal-ai/file-city', owner: { login: 'principal-ai', avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4' } }),
      you(5, { name: 'desktop-app', full_name: 'principal-ai/desktop-app', owner: { login: 'principal-ai', avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4' }, language: 'TypeScript' }),
    ],
  },
];

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div
      className="flex flex-col"
      style={{ width: 340, height: 620, border: '1px solid #ccc' }}
    >
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeProjectsView> = {
  title: 'Home/HomeProjectsView',
  component: HomeProjectsView,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeProjectsView>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <HomeProjectsView
        sections={sections}
        onSelectRepo={(r) => alert(`Open ${r.full_name}`)}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const WithSelection: Story = {
  render: () => (
    <StoryWrapper>
      <HomeProjectsView
        sections={sections}
        selectedFullName="principal-ai/file-city"
        onSelectRepo={(r) => alert(`Open ${r.full_name}`)}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <HomeProjectsView
        sections={null}
        onSelectRepo={() => {}}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <HomeProjectsView
        sections={[]}
        onSelectRepo={() => {}}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <StoryWrapper>
      <HomeProjectsView
        sections={null}
        error="HTTP 401"
        onSelectRepo={() => {}}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};
