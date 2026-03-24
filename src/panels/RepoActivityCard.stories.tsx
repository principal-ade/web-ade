import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { RepoActivityCard } from './RepoActivityCard';
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

  const messages = [
    'feat: add new authentication flow',
    'fix: resolve memory leak in worker',
    'refactor: simplify state management',
    'docs: update API documentation',
    'chore: upgrade dependencies',
    'test: add unit tests for utils',
    'style: format code with prettier',
    'perf: optimize render performance',
  ];

  return {
    repoOwner,
    repoName,
    sha: `${index}abc${index}def${index}ghi${index}jkl${index}mno${index}pqr${index}stu`,
    message: messages[index % messages.length] ?? `commit ${index}`,
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

// Mock commit details with file changes
const mockCommitDetails = {
  stats: { additions: 45, deletions: 12 },
  files: [
    { filename: 'src/components/Button.tsx', status: 'modified' },
    { filename: 'src/components/Card.tsx', status: 'added' },
    { filename: 'src/utils/helpers.ts', status: 'modified' },
  ],
};

// Story wrapper that mocks fetch and provides theme
const StoryWrapper: React.FC<{
  children: React.ReactNode;
  width?: string;
}> = ({ children, width = '700px' }) => {
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
      <div style={{ width, padding: '16px' }}>
        {children}
      </div>
    </ThemeProvider>
  );
};

// Interactive wrapper for expand/collapse
const InteractiveCard: React.FC<{
  summary: RepoActivitySummary;
  initialExpanded?: boolean;
  dimmed?: boolean;
}> = ({ summary, initialExpanded = false, dimmed = false }) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  return (
    <RepoActivityCard
      summary={summary}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      onOpen={() => console.log('Open clicked:', summary.fullName)}
      dimmed={dimmed}
    />
  );
};

const meta: Meta<typeof RepoActivityCard> = {
  title: 'Activity/RepoActivityCard',
  component: RepoActivityCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RepoActivityCard>;

/**
 * Default horizontal card with a single commit (no expand button shown)
 */
export const SingleCommit: Story = {
  render: () => (
    <StoryWrapper>
      <InteractiveCard summary={createMockSummary('octocat', 'hello-world', 1)} />
    </StoryWrapper>
  ),
};

/**
 * Horizontal card with multiple commits showing commit dots
 */
export const MultipleCommits: Story = {
  render: () => (
    <StoryWrapper>
      <InteractiveCard summary={createMockSummary('octocat', 'hello-world', 5)} />
    </StoryWrapper>
  ),
};

/**
 * Horizontal card with many commits (shows multiple rows of dots)
 */
export const ManyCommits: Story = {
  render: () => (
    <StoryWrapper>
      <InteractiveCard summary={createMockSummary('facebook', 'react', 15)} />
    </StoryWrapper>
  ),
};

/**
 * Card in expanded state showing all commits
 */
export const Expanded: Story = {
  render: () => (
    <StoryWrapper>
      <InteractiveCard
        summary={createMockSummary('github', 'linguist', 6)}
        initialExpanded
      />
    </StoryWrapper>
  ),
};

/**
 * Card in dimmed state (used when another card is focused)
 */
export const Dimmed: Story = {
  render: () => (
    <StoryWrapper>
      <InteractiveCard
        summary={createMockSummary('microsoft', 'vscode', 4)}
        dimmed
      />
    </StoryWrapper>
  ),
};

/**
 * Card with a long repository name
 */
export const LongRepoName: Story = {
  render: () => (
    <StoryWrapper>
      <InteractiveCard
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
 * Card with long commit messages
 */
export const LongCommitMessages: Story = {
  render: () => {
    const summary = createMockSummary('octocat', 'hello-world', 3);
    summary.commits = summary.commits.map((commit, i) => ({
      ...commit,
      message: `feat(core): implement comprehensive user authentication system with OAuth2, SAML, and OpenID Connect support - part ${i + 1}`,
    }));
    return (
      <StoryWrapper>
        <InteractiveCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Card with high additions showing green-dominant stats bar
 */
export const HighAdditions: Story = {
  render: () => {
    const summary = createMockSummary('octocat', 'new-project', 3);
    summary.commits = summary.commits.map((commit) => ({
      ...commit,
      additions: 500,
      deletions: 10,
    }));
    return (
      <StoryWrapper>
        <InteractiveCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Card with high deletions showing red-dominant stats bar
 */
export const HighDeletions: Story = {
  render: () => {
    const summary = createMockSummary('octocat', 'cleanup-repo', 3);
    summary.commits = summary.commits.map((commit) => ({
      ...commit,
      additions: 10,
      deletions: 300,
    }));
    return (
      <StoryWrapper>
        <InteractiveCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Card with multiple authors in commits
 */
export const MultipleAuthors: Story = {
  render: () => {
    const summary = createMockSummary('microsoft', 'vscode', 5);
    const authors = [
      { author: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4' },
      { author: 'torvalds', avatarUrl: 'https://avatars.githubusercontent.com/u/1024025?v=4' },
      { author: 'defunkt', avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4' },
      { author: 'mojombo', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' },
      { author: 'pjhyett', avatarUrl: 'https://avatars.githubusercontent.com/u/3?v=4' },
    ];
    summary.commits = summary.commits.map((commit, i) => ({
      ...commit,
      author: authors[i % authors.length]!.author,
      authorAvatarUrl: authors[i % authors.length]!.avatarUrl,
    }));
    return (
      <StoryWrapper>
        <InteractiveCard summary={summary} />
      </StoryWrapper>
    );
  },
};

/**
 * Card in a narrower container
 */
export const NarrowContainer: Story = {
  render: () => (
    <StoryWrapper width="500px">
      <InteractiveCard summary={createMockSummary('octocat', 'hello-world', 5)} />
    </StoryWrapper>
  ),
};

/**
 * Card in a wider container
 */
export const WideContainer: Story = {
  render: () => (
    <StoryWrapper width="900px">
      <InteractiveCard summary={createMockSummary('octocat', 'hello-world', 8)} />
    </StoryWrapper>
  ),
};

/**
 * Multiple cards stacked together (typical feed layout)
 */
export const MultipleFeedCards: Story = {
  render: () => (
    <StoryWrapper width="700px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <InteractiveCard summary={createMockSummary('octocat', 'hello-world', 3)} />
        <InteractiveCard summary={createMockSummary('facebook', 'react', 5)} />
        <InteractiveCard summary={createMockSummary('microsoft', 'vscode', 2)} />
      </div>
    </StoryWrapper>
  ),
};

/**
 * Cards showing focus state (one active, others dimmed)
 */
export const FocusState: Story = {
  render: () => (
    <StoryWrapper width="700px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <InteractiveCard summary={createMockSummary('octocat', 'hello-world', 3)} dimmed />
        <InteractiveCard summary={createMockSummary('facebook', 'react', 5)} />
        <InteractiveCard summary={createMockSummary('microsoft', 'vscode', 2)} dimmed />
      </div>
    </StoryWrapper>
  ),
};
