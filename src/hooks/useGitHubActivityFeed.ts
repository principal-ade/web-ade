import { useState, useEffect, useCallback, useRef } from 'react';
import { FEATURED_REPOS, type FeaturedRepo } from '@/lib/featured-repos';

export interface ActivityCommit {
  repoOwner: string;
  repoName: string;
  sha: string;
  message: string;
  author: string;
  authorLogin: string | null;
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

  // Store ETags per repo for conditional requests
  const etagsRef = useRef<Map<string, string>>(new Map());

  const loadActivityFeed = useCallback(async (useEtags = false) => {
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
      // Track which repos had changes
      const updatedSummaries: RepoActivitySummary[] = [];
      const unchangedRepoKeys = new Set<string>();

      // Fetch commits for each repo in parallel
      await Promise.all(
        repos.map(async (repo) => {
          const repoKey = `${repo.owner}/${repo.repo}`;
          try {
            const headers: Record<string, string> = {};

            // Send ETag for conditional request if we have one
            if (useEtags) {
              const etag = etagsRef.current.get(repoKey);
              if (etag) {
                headers['If-None-Match'] = etag;
              }
            }

            const response = await fetch(
              `/api/github/repo/${repo.owner}/${repo.repo}/commits?per_page=${commitsPerRepo}`,
              { signal, headers }
            );

            // 304 Not Modified - keep existing data
            if (response.status === 304) {
              unchangedRepoKeys.add(repoKey);
              return;
            }

            if (!response.ok) {
              console.warn(`Failed to fetch commits for ${repoKey}: ${response.status}`);
              return;
            }

            // Store new ETag
            const newEtag = response.headers.get('ETag');
            if (newEtag) {
              etagsRef.current.set(repoKey, newEtag);
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
                authorLogin: commit.author?.login || null,
                authorEmail: commit.commit.author.email,
                authorAvatarUrl: commit.author?.avatar_url || null,
                date: commit.commit.author.date,
                additions: commit.stats?.additions,
                deletions: commit.stats?.deletions,
              }));

            if (activityCommits.length === 0) return;

            const latestCommit = activityCommits[0];
            if (latestCommit) {
              updatedSummaries.push({
                owner: repo.owner,
                repo: repo.repo,
                fullName: repoKey,
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
            console.warn(`Error fetching commits for ${repoKey}:`, err);
          }
        })
      );

      if (signal.aborted) return;

      // Build final summaries: updated repos + unchanged repos from previous state
      const updatedRepoKeys = new Set(updatedSummaries.map(s => s.fullName));

      setRepoSummaries((prev) => {
        const finalSummaries = [...updatedSummaries];

        // Add unchanged repos from previous state (304 responses)
        for (const existing of prev) {
          if (unchangedRepoKeys.has(existing.fullName) && !updatedRepoKeys.has(existing.fullName)) {
            finalSummaries.push(existing);
          }
        }

        // Sort by latest commit (most recent first)
        finalSummaries.sort((a, b) => b.latestCommitAt.getTime() - a.latestCommitAt.getTime());
        return finalSummaries;
      });
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

  // Refresh with ETags (efficient polling)
  const refresh = useCallback(() => {
    return loadActivityFeed(true);
  }, [loadActivityFeed]);

  // Force refresh without ETags (full reload)
  const forceRefresh = useCallback(() => {
    etagsRef.current.clear();
    return loadActivityFeed(false);
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
          authorLogin: commit.author?.login || null,
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
    forceRefresh,
    addRepo,
  };
}
