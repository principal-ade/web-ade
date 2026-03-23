import { useState, useEffect, useCallback, useRef } from 'react';
import { FEATURED_REPOS, type FeaturedRepo } from '@/lib/featured-repos';

export interface ActivityCommit {
  repoOwner: string;
  repoName: string;
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  authorAvatarUrl: string | null;
  date: string; // ISO date string
  additions?: number;
  deletions?: number;
}

export interface RepoActivitySummary {
  owner: string;
  repo: string;
  fullName: string;
  commits: ActivityCommit[];
  latestCommitAt: Date;
  commitCount: number;
  description?: string;
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
  stats?: {
    additions: number;
    deletions: number;
  };
}

/**
 * Hook to fetch recent commits across featured repositories for an activity feed
 * @param repos - List of repos to fetch (defaults to FEATURED_REPOS)
 * @param commitsPerRepo - Number of commits to fetch per repo (default: 10)
 */
export function useGitHubActivityFeed(
  repos: FeaturedRepo[] = FEATURED_REPOS,
  commitsPerRepo = 10
) {
  const [repoSummaries, setRepoSummaries] = useState<RepoActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadActivityFeed = useCallback(async () => {
    if (repos.length === 0) {
      setRepoSummaries([]);
      setLoading(false);
      return;
    }

    // Cancel any in-flight requests
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      const summaries: RepoActivitySummary[] = [];

      // Fetch commits for each repo in parallel
      await Promise.all(
        repos.map(async (repo) => {
          try {
            const response = await fetch(
              `/api/github/repo/${repo.owner}/${repo.repo}/commits?per_page=${commitsPerRepo}`,
              { signal }
            );

            if (!response.ok) {
              console.warn(`Failed to fetch commits for ${repo.owner}/${repo.repo}: ${response.status}`);
              return;
            }

            const data = await response.json();
            const commits: GitHubCommitResponse[] = data.commits || [];

            if (commits.length === 0) return;

            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const activityCommits: ActivityCommit[] = commits
              .filter((commit) => new Date(commit.commit.author.date) >= twentyFourHoursAgo)
              .map((commit) => ({
                repoOwner: repo.owner,
                repoName: repo.repo,
                sha: commit.sha,
                message: commit.commit.message.split('\n')[0] ?? '', // First line only
                author: commit.commit.author.name,
                authorEmail: commit.commit.author.email,
                authorAvatarUrl: commit.author?.avatar_url || null,
                date: commit.commit.author.date,
                additions: commit.stats?.additions,
                deletions: commit.stats?.deletions,
              }));

            if (activityCommits.length === 0) return;

            const latestCommit = activityCommits[0];
            if (latestCommit) {
              summaries.push({
                owner: repo.owner,
                repo: repo.repo,
                fullName: `${repo.owner}/${repo.repo}`,
                commits: activityCommits,
                latestCommitAt: new Date(latestCommit.date),
                commitCount: activityCommits.length,
                description: repo.description,
              });
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              return; // Request was cancelled
            }
            console.warn(`Error fetching commits for ${repo.owner}/${repo.repo}:`, err);
          }
        })
      );

      if (signal.aborted) return;

      // Sort by latest commit (most recent first)
      summaries.sort((a, b) => b.latestCommitAt.getTime() - a.latestCommitAt.getTime());
      setRepoSummaries(summaries);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('[useGitHubActivityFeed] Error loading activity feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load activity feed');
      setRepoSummaries([]);
    } finally {
      setLoading(false);
    }
  }, [repos, commitsPerRepo]);

  // Load on mount and when repos change
  useEffect(() => {
    loadActivityFeed();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadActivityFeed]);

  const refresh = useCallback(() => {
    return loadActivityFeed();
  }, [loadActivityFeed]);

  // Add a single repo to the feed dynamically
  const addRepo = useCallback(async (owner: string, repo: string) => {
    // Check if already in feed
    const exists = repoSummaries.some(
      (s) => s.owner.toLowerCase() === owner.toLowerCase() && s.repo.toLowerCase() === repo.toLowerCase()
    );
    if (exists) return;

    try {
      const response = await fetch(
        `/api/github/repo/${owner}/${repo}/commits?per_page=${commitsPerRepo}`
      );

      if (!response.ok) {
        console.warn(`Failed to fetch commits for ${owner}/${repo}: ${response.status}`);
        return;
      }

      const data = await response.json();
      const commits: GitHubCommitResponse[] = data.commits || [];

      if (commits.length === 0) return;

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const activityCommits: ActivityCommit[] = commits
        .filter((commit) => new Date(commit.commit.author.date) >= twentyFourHoursAgo)
        .map((commit) => ({
          repoOwner: owner,
          repoName: repo,
          sha: commit.sha,
          message: commit.commit.message.split('\n')[0] ?? '',
          author: commit.commit.author.name,
          authorEmail: commit.commit.author.email,
          authorAvatarUrl: commit.author?.avatar_url || null,
          date: commit.commit.author.date,
          additions: commit.stats?.additions,
          deletions: commit.stats?.deletions,
        }));

      if (activityCommits.length === 0) return;

      const latestCommit = activityCommits[0];
      if (latestCommit) {
        const newSummary: RepoActivitySummary = {
          owner,
          repo,
          fullName: `${owner}/${repo}`,
          commits: activityCommits,
          latestCommitAt: new Date(latestCommit.date),
          commitCount: activityCommits.length,
        };

        setRepoSummaries((prev) => {
          const updated = [...prev, newSummary];
          updated.sort((a, b) => b.latestCommitAt.getTime() - a.latestCommitAt.getTime());
          return updated;
        });
      }
    } catch (err) {
      console.warn(`Error fetching commits for ${owner}/${repo}:`, err);
    }
  }, [repoSummaries, commitsPerRepo]);

  return {
    repoSummaries,
    loading,
    error,
    refresh,
    addRepo,
  };
}
