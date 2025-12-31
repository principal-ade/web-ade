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

const FOLLOWING_QUERY = `
  query Following($login: String!, $from: DateTime!) {
    user(login: $login) {
      following(first: 50) {
        nodes {
          login
          name
          avatarUrl
          bio
          contributionsCollection(from: $from) {
            contributionCalendar {
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
    }
  }
`;

export interface DailyContribution {
  date: string;
  count: number;
}

export interface FollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  contributions: DailyContribution[];
}

interface GraphQLFollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  contributionsCollection: {
    contributionCalendar: {
      weeks: Array<{
        contributionDays: Array<{
          contributionCount: number;
          date: string;
        }>;
      }>;
    };
  };
}

function extractLast7Days(user: GraphQLFollowingUser): DailyContribution[] {
  const allDays: DailyContribution[] = [];
  for (const week of user.contributionsCollection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      allDays.push({
        date: day.date,
        count: day.contributionCount,
      });
    }
  }
  // Sort by date descending and take last 7 days
  allDays.sort((a, b) => b.date.localeCompare(a.date));
  return allDays.slice(0, 7).reverse(); // Oldest to newest for display
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const userToken = await getGitHubToken();

    // Calculate 7 days ago for contribution data
    const from = new Date();
    from.setDate(from.getDate() - 7);

    const data = await makeGitHubGraphQLRequest(
      FOLLOWING_QUERY,
      {
        login: username,
        from: from.toISOString(),
      },
      userToken
    );

    const followingNodes = data.user?.following?.nodes as GraphQLFollowingUser[] || [];

    const following: FollowingUser[] = followingNodes.map((user) => ({
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      contributions: extractLast7Days(user),
    }));

    const jsonResponse = NextResponse.json({ following });

    // Cache for 5 minutes
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[following] Error fetching following:", error);

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
