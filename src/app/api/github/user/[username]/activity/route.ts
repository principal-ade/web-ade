import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function makeGitHubGraphQLRequest(
  query: string,
  variables: Record<string, unknown>,
  userToken?: string | null
) {
  const token = userToken || process.env.GITHUB_TOKEN || null;

  if (!token) {
    throw new GitHubApiError("GitHub token required for GraphQL API", 401);
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "WebADE/1.0",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub GraphQL Error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const data = await response.json();

  if (data.errors) {
    throw new GitHubApiError(
      `GitHub GraphQL Error: ${data.errors[0]?.message || "Unknown error"}`,
      400
    );
  }

  return data.data;
}

const USER_ACTIVITY_QUERY = `
  query UserActivity($login: String!, $from: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl

      contributionsCollection(from: $from) {
        commitContributionsByRepository(maxRepositories: 20) {
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

      pullRequests(first: 30, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          title
          number
          mergedAt
          url
          repository {
            nameWithOwner
          }
          additions
          deletions
        }
      }

      openPullRequests: pullRequests(first: 10, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          title
          number
          createdAt
          url
          repository {
            nameWithOwner
          }
        }
      }

      issues(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          title
          number
          state
          createdAt
          closedAt
          url
          repository {
            nameWithOwner
          }
        }
      }
    }
  }
`;

export interface ActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened' | 'issue_opened' | 'issue_closed';
  timestamp: string;
  repository: string;
  repositoryUrl?: string;
  title?: string;
  url?: string;
  metadata?: {
    commitCount?: number;
    additions?: number;
    deletions?: number;
    prNumber?: number;
    issueNumber?: number;
  };
}

export interface UserActivityResponse {
  user: {
    login: string;
    name: string | null;
    avatarUrl: string;
  };
  activity: ActivityEvent[];
}

interface GraphQLUser {
  login: string;
  name: string | null;
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
      mergedAt: string;
      url: string;
      repository: { nameWithOwner: string };
      additions: number;
      deletions: number;
    }>;
  };
  openPullRequests: {
    nodes: Array<{
      title: string;
      number: number;
      createdAt: string;
      url: string;
      repository: { nameWithOwner: string };
    }>;
  };
  issues: {
    nodes: Array<{
      title: string;
      number: number;
      state: string;
      createdAt: string;
      closedAt: string | null;
      url: string;
      repository: { nameWithOwner: string };
    }>;
  };
}

function normalizeActivity(user: GraphQLUser): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Normalize commit contributions
  for (const repo of user.contributionsCollection.commitContributionsByRepository) {
    for (const contribution of repo.contributions.nodes) {
      events.push({
        id: `commit-${repo.repository.nameWithOwner}-${contribution.occurredAt}`,
        type: 'commit',
        timestamp: contribution.occurredAt,
        repository: repo.repository.nameWithOwner,
        repositoryUrl: repo.repository.url,
        metadata: {
          commitCount: contribution.commitCount,
        },
      });
    }
  }

  // Normalize merged PRs
  for (const pr of user.pullRequests.nodes) {
    events.push({
      id: `pr-merged-${pr.repository.nameWithOwner}-${pr.number}`,
      type: 'pr_merged',
      timestamp: pr.mergedAt,
      repository: pr.repository.nameWithOwner,
      title: pr.title,
      url: pr.url,
      metadata: {
        prNumber: pr.number,
        additions: pr.additions,
        deletions: pr.deletions,
      },
    });
  }

  // Normalize open PRs
  for (const pr of user.openPullRequests.nodes) {
    events.push({
      id: `pr-opened-${pr.repository.nameWithOwner}-${pr.number}`,
      type: 'pr_opened',
      timestamp: pr.createdAt,
      repository: pr.repository.nameWithOwner,
      title: pr.title,
      url: pr.url,
      metadata: {
        prNumber: pr.number,
      },
    });
  }

  // Normalize issues
  for (const issue of user.issues.nodes) {
    const isClosed = issue.state === 'CLOSED';
    events.push({
      id: `issue-${issue.repository.nameWithOwner}-${issue.number}`,
      type: isClosed ? 'issue_closed' : 'issue_opened',
      timestamp: isClosed && issue.closedAt ? issue.closedAt : issue.createdAt,
      repository: issue.repository.nameWithOwner,
      title: issue.title,
      url: issue.url,
      metadata: {
        issueNumber: issue.number,
      },
    });
  }

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const userToken = await getGitHubToken();

    // Calculate 30 days ago
    const from = new Date();
    from.setDate(from.getDate() - 30);

    const data = await makeGitHubGraphQLRequest(
      USER_ACTIVITY_QUERY,
      {
        login: username,
        from: from.toISOString(),
      },
      userToken
    );

    const user = data.user as GraphQLUser;

    if (!user) {
      return NextResponse.json(
        { error: `User '${username}' not found` },
        { status: 404 }
      );
    }

    const activity = normalizeActivity(user);

    const response: UserActivityResponse = {
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      activity,
    };

    const jsonResponse = NextResponse.json(response);

    // Cache for 2 minutes
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=240"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[activity] Error fetching user activity:", error);

    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
