/**
 * Feed Activity Fetchers
 *
 * Functions to fetch activity from followed users and repos.
 * Uses GitHub's GraphQL API for user activity and REST API for repo activity.
 */

import type { WatchedUser, WatchedRepo } from '@/lib/feed-collections/types';
import type { FeedActivityEvent } from './types';

// GraphQL query for a user's recent activity
const USER_ACTIVITY_QUERY = `
  query UserActivity($login: String!, $from: DateTime!) {
    user(login: $login) {
      login
      avatarUrl

      contributionsCollection(from: $from) {
        commitContributionsByRepository(maxRepositories: 10) {
          repository {
            nameWithOwner
            url
          }
          contributions(first: 10, orderBy: {field: OCCURRED_AT, direction: DESC}) {
            nodes {
              occurredAt
              commitCount
            }
          }
        }
      }

      pullRequests(first: 5, states: [OPEN, MERGED], orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          title
          number
          state
          createdAt
          mergedAt
          url
          repository {
            nameWithOwner
          }
          additions
          deletions
        }
      }
    }
  }
`;

// GraphQL query for a repo's recent activity
const REPO_ACTIVITY_QUERY = `
  query RepoActivity($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      url

      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 10) {
              nodes {
                oid
                message
                committedDate
                author {
                  user {
                    login
                    avatarUrl
                  }
                }
              }
            }
          }
        }
      }

      pullRequests(first: 5, states: [OPEN, MERGED], orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          title
          number
          state
          createdAt
          mergedAt
          url
          author {
            login
            avatarUrl
          }
          additions
          deletions
        }
      }
    }
  }
`;

async function makeGitHubGraphQLRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T | null> {
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WebADE/1.0',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error(
        `[feed-activity] GraphQL request failed: ${response.status}`
      );
      return null;
    }

    const data = await response.json();

    if (data.errors) {
      console.error('[feed-activity] GraphQL errors:', data.errors);
      return null;
    }

    return data.data as T;
  } catch (error) {
    console.error('[feed-activity] GraphQL request error:', error);
    return null;
  }
}

interface UserActivityData {
  user: {
    login: string;
    avatarUrl: string;
    contributionsCollection: {
      commitContributionsByRepository: Array<{
        repository: { nameWithOwner: string; url: string };
        contributions: {
          nodes: Array<{ occurredAt: string; commitCount: number }>;
        };
      }>;
    };
    pullRequests: {
      nodes: Array<{
        title: string;
        number: number;
        state: string;
        createdAt: string;
        mergedAt: string | null;
        url: string;
        repository: { nameWithOwner: string };
        additions: number;
        deletions: number;
      }>;
    };
  } | null;
}

interface RepoActivityData {
  repository: {
    nameWithOwner: string;
    url: string;
    defaultBranchRef: {
      target: {
        history: {
          nodes: Array<{
            oid: string;
            message: string;
            committedDate: string;
            author: {
              user: { login: string; avatarUrl: string } | null;
            } | null;
          }>;
        };
      };
    } | null;
    pullRequests: {
      nodes: Array<{
        title: string;
        number: number;
        state: string;
        createdAt: string;
        mergedAt: string | null;
        url: string;
        author: { login: string; avatarUrl: string } | null;
        additions: number;
        deletions: number;
      }>;
    };
  } | null;
}

/**
 * Fetch activity for a single user
 */
async function fetchUserActivity(
  login: string,
  token: string
): Promise<FeedActivityEvent[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const data = await makeGitHubGraphQLRequest<UserActivityData>(
    USER_ACTIVITY_QUERY,
    { login, from: sevenDaysAgo.toISOString() },
    token
  );

  if (!data?.user) {
    return [];
  }

  const events: FeedActivityEvent[] = [];
  const user = data.user;

  // Convert commit contributions
  for (const repo of user.contributionsCollection.commitContributionsByRepository) {
    for (const contribution of repo.contributions.nodes) {
      events.push({
        id: `user-commit-${user.login}-${repo.repository.nameWithOwner}-${contribution.occurredAt}`,
        type: 'commit',
        timestamp: contribution.occurredAt,
        repository: repo.repository.nameWithOwner,
        repositoryUrl: repo.repository.url,
        source: 'followed_user',
        sourceIdentifier: user.login,
        author: {
          login: user.login,
          avatarUrl: user.avatarUrl,
        },
        metadata: {
          commitCount: contribution.commitCount,
        },
      });
    }
  }

  // Convert PRs
  for (const pr of user.pullRequests.nodes) {
    const isMerged = pr.state === 'MERGED';
    events.push({
      id: `user-pr-${user.login}-${pr.repository.nameWithOwner}-${pr.number}`,
      type: isMerged ? 'pr_merged' : 'pr_opened',
      timestamp: isMerged && pr.mergedAt ? pr.mergedAt : pr.createdAt,
      repository: pr.repository.nameWithOwner,
      title: pr.title,
      url: pr.url,
      source: 'followed_user',
      sourceIdentifier: user.login,
      author: {
        login: user.login,
        avatarUrl: user.avatarUrl,
      },
      metadata: {
        prNumber: pr.number,
        additions: pr.additions,
        deletions: pr.deletions,
      },
    });
  }

  return events;
}

/**
 * Fetch activity for a single repository
 */
async function fetchRepoActivity(
  owner: string,
  repo: string,
  token: string
): Promise<FeedActivityEvent[]> {
  const data = await makeGitHubGraphQLRequest<RepoActivityData>(
    REPO_ACTIVITY_QUERY,
    { owner, name: repo },
    token
  );

  if (!data?.repository) {
    return [];
  }

  const events: FeedActivityEvent[] = [];
  const repository = data.repository;
  const repoIdentifier = `${owner}/${repo}`;

  // Convert commits
  const commits =
    repository.defaultBranchRef?.target?.history?.nodes ?? [];
  for (const commit of commits) {
    events.push({
      id: `repo-commit-${repoIdentifier}-${commit.oid}`,
      type: 'commit',
      timestamp: commit.committedDate,
      repository: repository.nameWithOwner,
      repositoryUrl: repository.url,
      source: 'followed_repo',
      sourceIdentifier: repoIdentifier,
      author: commit.author?.user
        ? {
            login: commit.author.user.login,
            avatarUrl: commit.author.user.avatarUrl,
          }
        : undefined,
      metadata: {
        message: commit.message.split('\n')[0], // First line only
      },
    });
  }

  // Convert PRs
  for (const pr of repository.pullRequests.nodes) {
    const isMerged = pr.state === 'MERGED';
    events.push({
      id: `repo-pr-${repoIdentifier}-${pr.number}`,
      type: isMerged ? 'pr_merged' : 'pr_opened',
      timestamp: isMerged && pr.mergedAt ? pr.mergedAt : pr.createdAt,
      repository: repository.nameWithOwner,
      title: pr.title,
      url: pr.url,
      source: 'followed_repo',
      sourceIdentifier: repoIdentifier,
      author: pr.author
        ? {
            login: pr.author.login,
            avatarUrl: pr.author.avatarUrl,
          }
        : undefined,
      metadata: {
        prNumber: pr.number,
        additions: pr.additions,
        deletions: pr.deletions,
      },
    });
  }

  return events;
}

/**
 * Fetch activity for all followed users in parallel
 */
export async function fetchFollowedUsersActivity(
  users: WatchedUser[],
  token: string
): Promise<FeedActivityEvent[]> {
  if (users.length === 0) return [];

  const results = await Promise.all(
    users.map((user) => fetchUserActivity(user.login, token))
  );

  return results.flat();
}

/**
 * Fetch activity for all followed repos in parallel
 */
export async function fetchFollowedReposActivity(
  repos: WatchedRepo[],
  token: string
): Promise<FeedActivityEvent[]> {
  if (repos.length === 0) return [];

  const results = await Promise.all(
    repos.map((repo) => fetchRepoActivity(repo.owner, repo.repo, token))
  );

  return results.flat();
}
