import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { MobileRepoCard } from './MobileRepoCard';
import type { RepoActivitySummary, ActivityCommit } from '@/hooks/useGitHubActivityFeed';

// Mock commit data generator
const createMockCommit = (
  index: number,
  repoOwner: string,
  repoName: string,
  overrides?: Partial<ActivityCommit>
): ActivityCommit => {
  const date = new Date();
  date.setHours(date.getHours() - index);

  return {
    repoOwner,
    repoName,
    sha: `abc${index}def${index}ghi${index}jkl${index}mno${index}pqr${index}stu${index}`,
    message: `feat: implement feature ${index + 1} with improvements`,
    author: 'octocat',
    authorEmail: 'octocat@github.com',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
    date: date.toISOString(),
    additions: Math.floor(Math.random() * 100) + 10,
    deletions: Math.floor(Math.random() * 50),
    ...overrides,
  };
};

// Mock repo summary generator
const createMockSummary = (
  owner: string,
  repo: string,
  commitCount: number,
  overrides?: Partial<RepoActivitySummary>
): RepoActivitySummary => {
  const commits = Array.from({ length: commitCount }, (_, i) =>
    createMockCommit(i, owner, repo)
  );

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    commits,
    latestCommitAt: new Date(commits[0]?.date ?? Date.now()),
    commitCount,
    description: 'A sample repository for testing',
    ...overrides,
  };
};

// Mock tree data for File City
const mockTreeData = {
  sha: 'abc123',
  tree: [
    { path: 'src', type: 'tree' },
    { path: 'src/components', type: 'tree' },
    { path: 'src/components/Button.tsx', type: 'blob', size: 1500 },
    { path: 'src/components/Card.tsx', type: 'blob', size: 2000 },
    { path: 'src/hooks', type: 'tree' },
    { path: 'src/hooks/useAuth.ts', type: 'blob', size: 800 },
    { path: 'src/utils', type: 'tree' },
    { path: 'src/utils/helpers.ts', type: 'blob', size: 600 },
    { path: 'package.json', type: 'blob', size: 1200 },
    { path: 'README.md', type: 'blob', size: 3000 },
  ],
};

// Mock commit details with file changes
const mockCommitDetails = {
  stats: { additions: 45, deletions: 12 },
  files: [
    { filename: 'src/components/Button.tsx', status: 'modified' },
    { filename: 'src/components/Card.tsx', status: 'added' },
    { filename: 'src/utils/helpers.ts', status: 'modified' },
  ],
};

// Story wrapper that mocks fetch and trpc
const StoryWrapper: React.FC<{
  children: React.ReactNode;
  height?: string;
}> = ({ children, height = '667px' }) => {
  const [ready, setReady] = React.useState(false);
  const originalFetchRef = React.useRef<typeof global.fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = global.fetch;

    // Mock fetch for commit stats
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Mock commit details endpoint
      if (url.includes('/commits/')) {
        return new Response(JSON.stringify(mockCommitDetails), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetchRef.current!(input);
    };

    // Mock trpc by patching the global object
    // The component uses trpc.github.getTree.query, so we mock that path
    (globalThis as unknown as { __TRPC_MOCK__: boolean }).__TRPC_MOCK__ = true;

    setReady(true);

    return () => {
      if (originalFetchRef.current) {
        global.fetch = originalFetchRef.current;
      }
    };
  }, []);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <div
        style={{
          width: '375px',
          height,
          border: '1px solid #ccc',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </ThemeProvider>
  );
};

const meta: Meta<typeof MobileRepoCard> = {
  title: 'Activity/MobileRepoCard',
  component: MobileRepoCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MobileRepoCard>;

/**
 * Default mobile card with a single commit
 */
export const SingleCommit: Story = {
  render: () => (
    <StoryWrapper>
      <MobileRepoCard summary={createMockSummary('octocat', 'hello-world', 1)} />
    </StoryWrapper>
  ),
};

/**
 * Mobile card with multiple commits showing the "Show more" functionality
 */
export const MultipleCommits: Story = {
  render: () => (
    <StoryWrapper>
      <MobileRepoCard summary={createMockSummary('octocat', 'hello-world', 5)} />
    </StoryWrapper>
  ),
};

/**
 * Mobile card with many commits to test the expand/collapse UI
 */
export const ManyCommits: Story = {
  render: () => (
    <StoryWrapper>
      <MobileRepoCard summary={createMockSummary('facebook', 'react', 10)} />
    </StoryWrapper>
  ),
};

/**
 * Mobile card with a long repository name
 */
export const LongRepoName: Story = {
  render: () => (
    <StoryWrapper>
      <MobileRepoCard
        summary={createMockSummary(
          'organization-with-long-name',
          'super-long-repository-name-that-might-overflow',
          3
        )}
      />
    </StoryWrapper>
  ),
};

/**
 * Mobile card with long commit messages
 */
export const LongCommitMessages: Story = {
  render: () => {
    const summary = createMockSummary('octocat', 'hello-world', 3);
    summary.commits = summary.commits.map((commit, i) => ({
      ...commit,
      message: `feat(core): implement comprehensive user authentication system with OAuth2, SAML, and OpenID Connect support including multi-factor authentication, session management, and token refresh mechanisms - part ${i + 1}`,
    }));
    return (
      <StoryWrapper>
        <MobileRepoCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Mobile card showing high additions (green bar dominant)
 */
export const HighAdditions: Story = {
  render: () => {
    const summary = createMockSummary('octocat', 'new-project', 2);
    summary.commits = summary.commits.map((commit) => ({
      ...commit,
      additions: 500,
      deletions: 10,
    }));
    return (
      <StoryWrapper>
        <MobileRepoCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Mobile card showing high deletions (red bar dominant)
 */
export const HighDeletions: Story = {
  render: () => {
    const summary = createMockSummary('octocat', 'cleanup-repo', 2);
    summary.commits = summary.commits.map((commit) => ({
      ...commit,
      additions: 10,
      deletions: 300,
    }));
    return (
      <StoryWrapper>
        <MobileRepoCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Mobile card in a taller container (tablet-like)
 */
export const TallerContainer: Story = {
  render: () => (
    <StoryWrapper height="900px">
      <MobileRepoCard summary={createMockSummary('github', 'linguist', 5)} />
    </StoryWrapper>
  ),
};

/**
 * Mobile card with different author avatars
 */
export const MultipleAuthors: Story = {
  render: () => {
    const summary = createMockSummary('microsoft', 'vscode', 4);
    const authors = [
      { author: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4' },
      { author: 'torvalds', avatarUrl: 'https://avatars.githubusercontent.com/u/1024025?v=4' },
      { author: 'defunkt', avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4' },
      { author: 'mojombo', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' },
    ];
    summary.commits = summary.commits.map((commit, i) => ({
      ...commit,
      author: authors[i % authors.length]!.author,
      authorAvatarUrl: authors[i % authors.length]!.avatarUrl,
    }));
    return (
      <StoryWrapper>
        <MobileRepoCard summary={summary} />
      </StoryWrapper>
    );
  },
};
