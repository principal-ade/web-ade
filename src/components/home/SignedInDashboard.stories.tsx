import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { SignedInDashboardView } from './SignedInDashboard';
import type { User } from '@/contexts/AuthContext';
import type { TrailByUserEntry } from '@/lib/trails/types';
import type { TopicByUserEntry } from '@/lib/topics/types';

const mockUser: User = {
  id: 583231,
  login: 'octocat',
  name: 'Mona Lisa Octocat',
  email: 'octocat@github.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

const mockTrails: TrailByUserEntry[] = [
  {
    id: 'trail-auth-flow',
    title: 'Auth middleware: token refresh path',
    owner: 'principal-ai',
    repo: 'web-ade',
    markerCount: 8,
    createdAt: daysAgo(3),
    updatedAt: hoursAgo(2),
    createdBy: { githubId: mockUser.id, githubLogin: mockUser.login },
    githubRepoId: 123456,
  } as TrailByUserEntry,
  {
    id: 'trail-fc3d-init',
    title: 'How FileCity3D inits and repaints the host',
    owner: 'principal-ai',
    repo: 'industry-theme',
    markerCount: 12,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    createdBy: { githubId: mockUser.id, githubLogin: mockUser.login },
    githubRepoId: 234567,
  } as TrailByUserEntry,
  {
    id: 'trail-trails-share',
    title: 'Publishing a trail end-to-end',
    owner: 'principal-ai',
    repo: 'web-ade',
    markerCount: 5,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(7),
    createdBy: { githubId: mockUser.id, githubLogin: mockUser.login },
    githubRepoId: 123456,
  } as TrailByUserEntry,
];

const mockTopics: TopicByUserEntry[] = [
  {
    id: 'topic-onboarding',
    title: 'Onboarding new engineers',
    descriptionPreview:
      'Trails I hand to anyone joining the team — auth, deploy, where the bodies are buried.',
    trailCount: 6,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
  },
  {
    id: 'topic-file-city',
    title: 'File City internals',
    descriptionPreview:
      'How the 3D renderer is wired across web-ade, industry-theme, and the electron app.',
    trailCount: 4,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(5),
  },
];

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div style={{ minHeight: '100vh', padding: '0' }}>{children}</div>
  </ThemeProvider>
);

const meta: Meta<typeof SignedInDashboardView> = {
  title: 'Home/SignedInDashboard',
  component: SignedInDashboardView,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SignedInDashboardView>;

/** Populated dashboard — the common case once a user has trails and topics. */
export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <SignedInDashboardView
        user={mockUser}
        trails={mockTrails}
        topics={mockTopics}
      />
    </StoryWrapper>
  ),
};

/** Brand-new user: both fetches resolved with empty arrays. */
export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <SignedInDashboardView user={mockUser} trails={[]} topics={[]} />
    </StoryWrapper>
  ),
};

/** Initial mount — both fetches still in flight (`null`). */
export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <SignedInDashboardView user={mockUser} trails={null} topics={null} />
    </StoryWrapper>
  ),
};

/** Trails populated, topics still loading — mixed state mid-mount. */
export const TrailsReadyTopicsLoading: Story = {
  render: () => (
    <StoryWrapper>
      <SignedInDashboardView user={mockUser} trails={mockTrails} topics={null} />
    </StoryWrapper>
  ),
};

/** Both fetches failed — covers the error fallbacks. */
export const FetchError: Story = {
  render: () => (
    <StoryWrapper>
      <SignedInDashboardView
        user={mockUser}
        trails={null}
        topics={null}
        trailsError="HTTP 500"
        topicsError="HTTP 500"
      />
    </StoryWrapper>
  ),
};

/** User with no avatar — verifies the greeting block collapses gracefully. */
export const NoAvatar: Story = {
  render: () => (
    <StoryWrapper>
      <SignedInDashboardView
        user={{ ...mockUser, avatar_url: undefined }}
        trails={mockTrails}
        topics={mockTopics}
      />
    </StoryWrapper>
  ),
};
