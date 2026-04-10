import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";
import { setCachedAsync } from "@/lib/redis-cache";

// User profile cache TTL (7 days)
const USER_PROFILE_CACHE_TTL = 604800;

/**
 * Cache a user's profile data (name, avatar) for enriching search results
 */
async function cacheUserProfile(login: string, name: string | null, avatarUrl: string): Promise<void> {
  const cacheKey = `github:user-profile:${login.toLowerCase()}`;
  const cacheData = { login, name, avatar_url: avatarUrl };
  await setCachedAsync(cacheKey, cacheData, USER_PROFILE_CACHE_TTL);
}

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

// Query for contribution calendar data (long time range)
const CONTRIBUTIONS_QUERY = `
  query UserContributions($login: String!, $from: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl
      followers {
        totalCount
      }

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
      }
    }
  }
`;

// Query for recent activity (short time range - commits, PRs, issues)
const ACTIVITY_QUERY = `
  query UserActivity($login: String!, $from: DateTime!) {
    viewer {
      login
    }
    user(login: $login) {
      contributionsCollection(from: $from) {
        commitContributionsByRepository(maxRepositories: 20) {
          repository {
            nameWithOwner
            url
            isPrivate
            owner {
              __typename
            }
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
            isPrivate
            owner {
              __typename
            }
          }
          additions
          deletions
          reactions(first: 100) {
            totalCount
            nodes {
              content
              databaseId
              user {
                login
              }
            }
          }
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
            isPrivate
            owner {
              __typename
            }
          }
          reactions(first: 100) {
            totalCount
            nodes {
              content
              databaseId
              user {
                login
              }
            }
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
            isPrivate
            owner {
              __typename
            }
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
          reactions(first: 100) {
            totalCount
            nodes {
              content
              databaseId
              user {
                login
              }
            }
          }
        }
      }
    }
  }
`;

export type ReactionContent = 'THUMBS_UP' | 'THUMBS_DOWN' | 'LAUGH' | 'HOORAY' | 'CONFUSED' | 'HEART' | 'ROCKET' | 'EYES';

export interface ReactionCounts {
  totalCount: number;
  counts: Partial<Record<ReactionContent, number>>;
  viewerReactions: Partial<Record<ReactionContent, number>>; // Maps reaction type to databaseId
  users: Partial<Record<ReactionContent, string[]>>; // Usernames who reacted with each type
}

export interface ActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened' | 'issue_opened';
  timestamp: string;
  repository: string;
  repositoryUrl?: string;
  ownerType?: 'User' | 'Organization';
  isPrivate?: boolean;
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
    reactions?: ReactionCounts;
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
    followersCount: number;
  };
  activity: ActivityEvent[];
  contributions: DailyContribution[];
}

interface GraphQLReactions {
  totalCount: number;
  nodes: Array<{
    content: ReactionContent;
    databaseId: number;
    user: { login: string } | null;
  }>;
}

interface GraphQLUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  followers: {
    totalCount: number;
  };
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
      repository: { nameWithOwner: string; url: string; isPrivate: boolean; owner: { __typename: string } };
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
      repository: { nameWithOwner: string; isPrivate: boolean; owner: { __typename: string } };
      additions: number;
      deletions: number;
      reactions: GraphQLReactions;
    }>;
  };
  openPullRequests: {
    nodes: Array<{
      title: string;
      number: number;
      createdAt: string;
      url: string;
      repository: { nameWithOwner: string; isPrivate: boolean; owner: { __typename: string } };
      reactions: GraphQLReactions;
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
      repository: { nameWithOwner: string; isPrivate: boolean; owner: { __typename: string } };
      timelineItems: {
        nodes: Array<{
          actor?: { login: string };
        }>;
      };
      reactions: GraphQLReactions;
    }>;
  };
}

function parseReactions(reactions: GraphQLReactions, viewerLogin: string): ReactionCounts {
  const counts: Partial<Record<ReactionContent, number>> = {};
  const viewerReactions: Partial<Record<ReactionContent, number>> = {};
  const users: Partial<Record<ReactionContent, string[]>> = {};

  if (reactions?.nodes) {
    for (const node of reactions.nodes) {
      counts[node.content] = (counts[node.content] || 0) + 1;
      // Track viewer's reactions with their databaseId for deletion
      if (node.user?.login === viewerLogin) {
        viewerReactions[node.content] = node.databaseId;
      }
      // Collect usernames for tooltip
      if (node.user?.login) {
        if (!users[node.content]) {
          users[node.content] = [];
        }
        users[node.content]!.push(node.user.login);
      }
    }
  }

  return {
    totalCount: reactions?.totalCount || 0,
    counts,
    viewerReactions,
    users,
  };
}

function normalizeActivity(user: GraphQLUser, fromDate: Date, viewerLogin: string): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const fromTime = fromDate.getTime();

  // Normalize commit contributions (filtered by GraphQL query time range)
  for (const repo of user.contributionsCollection.commitContributionsByRepository) {
    for (const contribution of repo.contributions.nodes) {
      // Note: commits are already filtered by the GraphQL contributionsCollection(from:) parameter
      events.push({
        id: `commit-${repo.repository.nameWithOwner}-${contribution.occurredAt}`,
        type: 'commit',
        timestamp: contribution.occurredAt,
        repository: repo.repository.nameWithOwner,
        repositoryUrl: repo.repository.url,
        ownerType: repo.repository.owner.__typename as 'User' | 'Organization',
        isPrivate: repo.repository.isPrivate,
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
      ownerType: pr.repository.owner.__typename as 'User' | 'Organization',
      isPrivate: pr.repository.isPrivate,
      title: pr.title,
      url: pr.url,
      metadata: {
        prNumber: pr.number,
        additions: pr.additions,
        deletions: pr.deletions,
        reactions: parseReactions(pr.reactions, viewerLogin),
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
      ownerType: pr.repository.owner.__typename as 'User' | 'Organization',
      isPrivate: pr.repository.isPrivate,
      title: pr.title,
      url: pr.url,
      metadata: {
        prNumber: pr.number,
        reactions: parseReactions(pr.reactions, viewerLogin),
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
      ownerType: issue.repository.owner.__typename as 'User' | 'Organization',
      isPrivate: issue.repository.isPrivate,
      title: issue.title,
      url: issue.url,
      metadata: {
        issueNumber: issue.number,
        isClosed: issue.state === 'CLOSED',
        closedBy,
        reactions: parseReactions(issue.reactions, viewerLogin),
      },
    });
  }

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const userToken = await getGitHubToken();

    // Get query parameters (default: 7 days for both, max: 365)
    const { searchParams } = new URL(request.url);
    const contributionDays = Math.min(
      parseInt(searchParams.get('contributionDays') || '7', 10),
      365
    );
    const activityDays = Math.min(
      parseInt(searchParams.get('activityDays') || '7', 10),
      365
    );

    // Make two separate GraphQL requests with different time ranges
    const contributionsFrom = new Date();
    contributionsFrom.setDate(contributionsFrom.getDate() - contributionDays);

    const activityFrom = new Date();
    activityFrom.setDate(activityFrom.getDate() - activityDays);

    // Fetch contributions and activity in parallel
    const [contributionsData, activityData] = await Promise.all([
      makeGitHubGraphQLRequest(
        CONTRIBUTIONS_QUERY,
        {
          login: username,
          from: contributionsFrom.toISOString(),
        },
        userToken
      ),
      makeGitHubGraphQLRequest(
        ACTIVITY_QUERY,
        {
          login: username,
          from: activityFrom.toISOString(),
        },
        userToken
      ),
    ]);

    const contributionsUser = contributionsData.user as GraphQLUser;
    const activityUser = activityData.user as GraphQLUser;
    const viewerLogin = (activityData.viewer?.login as string) || '';

    if (!contributionsUser || !activityUser) {
      return NextResponse.json(
        { error: `User '${username}' not found` },
        { status: 404 }
      );
    }

    // Normalize activity events (no date filtering needed - already filtered by GraphQL query)
    const activity = normalizeActivity(activityUser, activityFrom, viewerLogin);

    // Extract contributions from contributions query result
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const allDays: DailyContribution[] = [];
    for (const week of contributionsUser.contributionsCollection.contributionCalendar.weeks) {
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
    // Sort by date descending and take last N days
    allDays.sort((a, b) => b.date.localeCompare(a.date));
    const contributions = allDays.slice(0, contributionDays).reverse(); // Oldest to newest for display

    const response: UserActivityResponse = {
      user: {
        login: contributionsUser.login,
        name: contributionsUser.name,
        avatarUrl: contributionsUser.avatarUrl,
        followersCount: contributionsUser.followers?.totalCount ?? 0,
      },
      activity,
      contributions,
    };

    // Cache user profile for enriching search results (fire and forget)
    cacheUserProfile(contributionsUser.login, contributionsUser.name, contributionsUser.avatarUrl);

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
