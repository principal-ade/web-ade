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
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
        commitContributionsByRepository(maxRepositories: 20) {
          repository {
            nameWithOwner
            url
          }
          contributions(first: 20, orderBy: {field: OCCURRED_AT, direction: DESC}) {
            nodes {
              occurredAt
              commitCount
            }
          }
        }
      }

      pullRequests(first: 10, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
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

      issues(first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
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
          timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) {
            nodes {
              ... on ClosedEvent {
                actor {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
`;

export interface ActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened' | 'issue_opened';
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
    isClosed?: boolean;
    closedBy?: string;
  };
}

export interface DailyContribution {
  date: string;
  count: number;
}

export interface UserActivityResponse {
  user: {
    login: string;
    name: string | null;
    avatarUrl: string;
  };
  activity: ActivityEvent[];
  contributions: DailyContribution[];
}

interface GraphQLUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributionsCollection: {
    contributionCalendar: {
      totalContributions: number;
      weeks: Array<{
        contributionDays: Array<{
          contributionCount: number;
          date: string;
        }>;
      }>;
    };
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
      timelineItems: {
        nodes: Array<{
          actor?: { login: string };
        }>;
      };
    }>;
  };
}

function normalizeActivity(user: GraphQLUser, fromDate: Date): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const fromTime = fromDate.getTime();

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

  // Normalize merged PRs (filter by date)
  for (const pr of user.pullRequests.nodes) {
    if (new Date(pr.mergedAt).getTime() < fromTime) continue;
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

  // Normalize open PRs (filter by date)
  for (const pr of user.openPullRequests.nodes) {
    if (new Date(pr.createdAt).getTime() < fromTime) continue;
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

  // Normalize issues (filter by date)
  // Note: user.issues returns issues authored by the user, so always "opened"
  for (const issue of user.issues.nodes) {
    if (new Date(issue.createdAt).getTime() < fromTime) continue;

    // Extract who closed the issue from timeline events
    const closedBy = issue.timelineItems?.nodes?.[0]?.actor?.login;

    events.push({
      id: `issue-${issue.repository.nameWithOwner}-${issue.number}`,
      type: 'issue_opened',
      timestamp: issue.createdAt,
      repository: issue.repository.nameWithOwner,
      title: issue.title,
      url: issue.url,
      metadata: {
        issueNumber: issue.number,
        isClosed: issue.state === 'CLOSED',
        closedBy,
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

    // Calculate 14 days ago to ensure we get full contribution calendar data
    const from = new Date();
    from.setDate(from.getDate() - 14);

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

    // Filter activity to last 7 days only
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activity = normalizeActivity(user, sevenDaysAgo);

    // Extract last 7 days of contributions from calendar
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const allDays: DailyContribution[] = [];
    for (const week of user.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        // Only include dates up to today (calendar includes future dates)
        if (day.date <= today) {
          allDays.push({
            date: day.date,
            count: day.contributionCount,
          });
        }
      }
    }
    // Sort by date descending and take last 7 days
    allDays.sort((a, b) => b.date.localeCompare(a.date));
    const contributions = allDays.slice(0, 7).reverse(); // Oldest to newest for display

    const response: UserActivityResponse = {
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      activity,
      contributions,
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
