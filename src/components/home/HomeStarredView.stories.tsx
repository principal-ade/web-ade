import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { HomeStarredView } from './HomeStarredView';
import type { ProjectRepo } from './HomeProjectsView';

const repo = (id: number, full_name: string, over?: Partial<ProjectRepo>): ProjectRepo => {
  const [login, name] = full_name.split('/');
  return {
    id,
    full_name,
    name: name ?? full_name,
    owner: {
      login: login ?? 'owner',
      avatar_url: `https://avatars.githubusercontent.com/u/${id * 7}?v=4`,
    },
    description: 'A repository worth remembering.',
    language: ['TypeScript', 'Rust', 'Go', 'Python'][id % 4],
    stargazers_count: id * 137,
    ...over,
  };
};

const starred: ProjectRepo[] = [
  repo(1, 'facebook/react', { description: 'A JS library for building UIs.', stargazers_count: 224318 }),
  repo(2, 'vercel/next.js', { description: 'The React framework.', language: 'JavaScript' }),
  repo(3, 'rust-lang/rust', { language: 'Rust' }),
  repo(4, 'tldraw/tldraw', { description: null }),
  repo(5, 'colinhacks/zod', { language: 'TypeScript', private: true }),
];

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div className="flex flex-col" style={{ width: 340, height: 620, border: '1px solid #ccc' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeStarredView> = {
  title: 'Home/HomeStarredView',
  component: HomeStarredView,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeStarredView>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <HomeStarredView
        repos={starred}
        onSelectRepo={(r) => alert(`Open ${r.full_name}`)}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const WithSelection: Story = {
  render: () => (
    <StoryWrapper>
      <HomeStarredView
        repos={starred}
        selectedFullName="rust-lang/rust"
        onSelectRepo={(r) => alert(`Open ${r.full_name}`)}
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <HomeStarredView repos={null} onSelectRepo={() => {}} onBack={() => {}} />
    </StoryWrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <HomeStarredView repos={[]} onSelectRepo={() => {}} onBack={() => {}} />
    </StoryWrapper>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <StoryWrapper>
      <HomeStarredView repos={null} error="HTTP 401" onSelectRepo={() => {}} onBack={() => {}} />
    </StoryWrapper>
  ),
};
