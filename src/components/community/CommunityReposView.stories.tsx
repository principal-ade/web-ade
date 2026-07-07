import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { GitFileTreeBuilder, type FileTree } from '@principal-ai/repository-abstraction';
import { CommunityReposView } from './CommunityReposView';
import type { CarouselCache, CarouselRepo } from './CommunityCarousel';
import type { ContributionAnalysis } from '@/lib/repo-analysis/contributionLayers';

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
    owner, repo,
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
    ],
    ...overrides,
  };
}

const sampleRepos: CarouselRepo[] = [
  makeRepo({
    fullName: 'vercel/next.js',
    description: 'The React framework for production. SSR, SSG, and more.',
    language: 'TypeScript', stargazersCount: 128000, visitorCount: 892, totalLines: 620000,
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
    language: 'Rust', stargazersCount: 98000, visitorCount: 756, totalLines: 1850000,
    topContributors: [
      { name: 'nikomatsakis', commits: 15600, lines: 450000 },
      { name: 'eddyb', commits: 10200, lines: 380000 },
      { name: 'pnkfelix', commits: 7800, lines: 210000 },
    ],
  }),
  makeRepo({
    fullName: 'home-assistant/core',
    description: 'Open source home automation that puts local control and privacy first.',
    language: 'Python', stargazersCount: 74000, visitorCount: 623, totalLines: 890000,
    topContributors: [
      { name: 'balloob', commits: 18200, lines: 520000 },
      { name: 'pvizeli', commits: 9400, lines: 280000 },
      { name: 'frenck', commits: 7600, lines: 195000 },
    ],
  }),
  makeRepo({
    fullName: 'denoland/deno',
    description: 'A modern runtime for JavaScript and TypeScript.',
    language: 'Rust', stargazersCount: 97000, visitorCount: 512, totalLines: 740000,
    topContributors: [
      { name: 'ry', commits: 8900, lines: 310000 },
    ],
  }),
  makeRepo({
    fullName: 'tailwindlabs/tailwindcss',
    description: 'A utility-first CSS framework for rapid UI development.',
    language: 'CSS', stargazersCount: 84000, visitorCount: 487, totalLines: 210000,
    topContributors: [
      { name: 'adamwathan', commits: 6200, lines: 98000 },
      { name: 'reinink', commits: 3100, lines: 54000 },
    ],
  }),
  makeRepo({
    fullName: 'golang/go',
    description: 'The Go programming language.',
    language: 'Go', stargazersCount: 124000, visitorCount: 678, totalLines: 3200000,
    topContributors: [
      { name: 'rsc', commits: 14200, lines: 680000 },
      { name: 'gri', commits: 9800, lines: 420000 },
    ],
  }),
  makeRepo({
    fullName: 'facebook/react',
    description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
    language: 'TypeScript', stargazersCount: 230000, visitorCount: 945, totalLines: 480000,
    topContributors: [
      { name: 'acdlite', commits: 7800, lines: 145000 },
      { name: 'sebmarkbage', commits: 6500, lines: 120000 },
    ],
  }),
  makeRepo({
    fullName: 'microsoft/vscode',
    description: 'Visual Studio Code — Open Source code editor.',
    language: 'TypeScript', stargazersCount: 165000, visitorCount: 834, totalLines: 2100000,
    topContributors: [
      { name: 'joaomoreno', commits: 11200, lines: 480000 },
      { name: 'bpasero', commits: 8900, lines: 360000 },
    ],
  }),
  makeRepo({
    fullName: 'chromium/chromium',
    description: 'The Chromium web browser.',
    language: 'C++', stargazersCount: 45000, visitorCount: 456, totalLines: 12000000,
    topContributors: [
      { name: 'dcheng', commits: 9800, lines: 2100000 },
      { name: 'nick', commits: 7600, lines: 1800000 },
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

function buildMockFileTree(rootPath: string): FileTree {
  return new GitFileTreeBuilder().build({
    files: [
      { path: 'src/index.ts', size: 1200 },
      { path: 'src/components/App.tsx', size: 3400 },
      { path: 'src/components/Header.tsx', size: 890 },
      { path: 'src/styles.css', size: 4500 },
      { path: 'README.md', size: 2100 },
      { path: 'package.json', size: 560 },
    ],
    rootPath,
    commitSha: 'abc123def456',
    branch: 'main',
  });
}

const mockFileTree = buildMockFileTree('/vercel/next.js');

const mockIdentityByEmail: Record<string, { login: string; avatarUrl: string } | null> = {
  'ijjk@example.com': { login: 'ijjk', avatarUrl: 'https://avatars.githubusercontent.com/u/123456?v=4' },
  'timneutkens@example.com': { login: 'timneutkens', avatarUrl: 'https://avatars.githubusercontent.com/u/456789?v=4' },
  'shuding@example.com': { login: 'shuding', avatarUrl: 'https://avatars.githubusercontent.com/u/789012?v=4' },
};

const mockAnalysis: ContributionAnalysis = {
  byEmail: {
    'ijjk@example.com': { 'src/index.ts': 800, 'src/components/App.tsx': 2000, 'src/components/Header.tsx': 100 },
    'timneutkens@example.com': { 'src/styles.css': 3000, 'src/components/App.tsx': 1200 },
    'shuding@example.com': { 'README.md': 1500, 'package.json': 400 },
  },
  totalLines: { 'src/index.ts': 1200, 'src/components/App.tsx': 3400, 'src/components/Header.tsx': 890, 'src/styles.css': 4500, 'README.md': 2100, 'package.json': 560 },
  contributors: [
    { name: 'ijjk', commits: 12400, email: 'ijjk@example.com' },
    { name: 'timneutkens', commits: 8900, email: 'timneutkens@example.com' },
    { name: 'shuding', commits: 5600, email: 'shuding@example.com' },
  ],
};

const meta: Meta<typeof CommunityReposView> = {
  title: 'Community/CommunityReposView',
  component: CommunityReposView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CommunityReposView>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityReposView
        data={populatedData}
        heroFileTree={mockFileTree}
        heroAnalysis={mockAnalysis}
        heroIdentityByEmail={mockIdentityByEmail}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityReposView loading />
    </StoryWrapper>
  ),
};

export const Error: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityReposView error="Failed to fetch community data" onRetry={() => alert('Retry')} />
    </StoryWrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <CommunityReposView data={{ ...populatedData, repos: [], repoCount: 0 }} />
    </StoryWrapper>
  ),
};
