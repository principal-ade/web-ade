import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { CommunityCarousel } from './CommunityCarousel';
import type { CarouselCache, CarouselRepo } from './CommunityCarousel';

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div style={{ width: '100%', maxWidth: 1200, margin: '40px auto', padding: '0 32px' }}>
      {children}
    </div>
  </ThemeProvider>
);

function makeRepo(overrides: Partial<CarouselRepo> & { fullName: string }): CarouselRepo {
  const [owner, repo] = overrides.fullName.split('/');
  return {
    owner,
    repo,
    description: 'A repository for exploring and collaborating on code.',
    language: 'TypeScript',
    stargazersCount: 1200,
    visitorCount: 340,
    lastVisitedAt: new Date().toISOString(),
    totalLines: 45000,
    topContributors: [
      { name: 'sarahchen', commits: 342, lines: 18200 },
      { name: 'marcor', commits: 218, lines: 12400 },
      { name: 'jessica_dev', commits: 156, lines: 8900 },
      { name: 'alex_k', commits: 89, lines: 3400 },
    ],
    ...overrides,
  };
}

const sampleRepos: CarouselRepo[] = [
  makeRepo({
    fullName: 'vercel/next.js',
    description: 'The React framework for production. SSR, SSG, and more.',
    language: 'TypeScript',
    stargazersCount: 128000,
    visitorCount: 892,
    totalLines: 620000,
    topContributors: [
      { name: 'ijjk', commits: 12400, lines: 312000 },
      { name: 'timneutkens', commits: 8900, lines: 198000 },
      { name: 'shuding', commits: 5600, lines: 124000 },
      { name: 'huozhi', commits: 3400, lines: 87000 },
      { name: 'styfle', commits: 2800, lines: 56000 },
    ],
  }),
  makeRepo({
    fullName: 'rust-lang/rust',
    description: 'Empowering everyone to build reliable and efficient software.',
    language: 'Rust',
    stargazersCount: 98000,
    visitorCount: 756,
    totalLines: 1850000,
    topContributors: [
      { name: 'nikomatsakis', commits: 15600, lines: 450000 },
      { name: 'eddyb', commits: 10200, lines: 380000 },
      { name: 'pnkfelix', commits: 7800, lines: 210000 },
      { name: 'michaelwoerister', commits: 5400, lines: 167000 },
    ],
  }),
  makeRepo({
    fullName: 'home-assistant/core',
    description: 'Open source home automation that puts local control and privacy first.',
    language: 'Python',
    stargazersCount: 74000,
    visitorCount: 623,
    totalLines: 890000,
    topContributors: [
      { name: 'balloob', commits: 18200, lines: 520000 },
      { name: 'pvizeli', commits: 9400, lines: 280000 },
      { name: 'frenck', commits: 7600, lines: 195000 },
    ],
  }),
  makeRepo({
    fullName: 'denoland/deno',
    description: 'A modern runtime for JavaScript and TypeScript.',
    language: 'Rust',
    stargazersCount: 97000,
    visitorCount: 512,
    totalLines: 740000,
    topContributors: [
      { name: 'ry', commits: 8900, lines: 310000 },
      { name: 'kitsonk', commits: 4500, lines: 120000 },
    ],
  }),
  makeRepo({
    fullName: 'tailwindlabs/tailwindcss',
    description: 'A utility-first CSS framework for rapid UI development.',
    language: 'CSS',
    stargazersCount: 84000,
    visitorCount: 487,
    totalLines: 210000,
    topContributors: [
      { name: 'adamwathan', commits: 6200, lines: 98000 },
      { name: 'reinink', commits: 3100, lines: 54000 },
      { name: 'bradlc', commits: 2800, lines: 42000 },
    ],
  }),
  makeRepo({
    fullName: 'golang/go',
    description: 'The Go programming language.',
    language: 'Go',
    stargazersCount: 124000,
    visitorCount: 678,
    totalLines: 3200000,
    topContributors: [
      { name: 'rsc', commits: 14200, lines: 680000 },
      { name: 'gri', commits: 9800, lines: 420000 },
      { name: 'ianlancetaylor', commits: 8700, lines: 350000 },
    ],
  }),
  makeRepo({
    fullName: 'facebook/react',
    description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
    language: 'TypeScript',
    stargazersCount: 230000,
    visitorCount: 945,
    totalLines: 480000,
    topContributors: [
      { name: 'acdlite', commits: 7800, lines: 145000 },
      { name: 'sebmarkbage', commits: 6500, lines: 120000 },
      { name: 'gaearon', commits: 5200, lines: 98000 },
      { name: 'sophiebits', commits: 4100, lines: 76000 },
    ],
  }),
];

const populatedData: CarouselCache = {
  version: 1,
  builtAt: new Date().toISOString(),
  sourceFeedUpdatedAt: new Date().toISOString(),
  repoCount: sampleRepos.length,
  repos: sampleRepos,
};

const sparseData: CarouselCache = {
  version: 1,
  builtAt: new Date().toISOString(),
  sourceFeedUpdatedAt: new Date().toISOString(),
  repoCount: 2,
  repos: [
    makeRepo({
      fullName: 'user/minimal-repo',
      description: null,
      language: null,
      stargazersCount: 12,
      visitorCount: 5,
      totalLines: undefined,
      topContributors: [],
    }),
    makeRepo({
      fullName: 'another/small-project',
      description: 'A small utility library.',
      language: 'Python',
      stargazersCount: 89,
      visitorCount: 23,
      totalLines: 3400,
      topContributors: [{ name: 'dev1', commits: 45, lines: 2100 }],
    }),
  ],
};

const meta: Meta<typeof CommunityCarousel> = {
  title: 'Community/CommunityCarousel',
  component: CommunityCarousel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CommunityCarousel>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityCarousel data={populatedData} />
    </StoryWrapper>
  ),
};

export const Sparse: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityCarousel data={sparseData} />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityCarousel loading />
    </StoryWrapper>
  ),
};

export const Error: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityCarousel
        error="Network request failed"
        onRetry={() => alert('Retry clicked')}
      />
    </StoryWrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityCarousel data={{ ...populatedData, repos: [], repoCount: 0 }} />
    </StoryWrapper>
  ),
};

export const NoContributors: Story = {
  render: () => {
    const noContrib = sampleRepos.slice(0, 3).map((r) => ({
      ...r,
      topContributors: [],
      totalLines: undefined,
    }));
    return (
      <StoryWrapper>
        <CommunityCarousel
          data={{ ...populatedData, repos: noContrib, repoCount: noContrib.length }}
        />
      </StoryWrapper>
    );
  },
};
