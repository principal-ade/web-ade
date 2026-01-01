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
  query Following($login: String!) {
    user(login: $login) {
      following(first: 50) {
        nodes {
          login
          name
          avatarUrl
          bio
          followers {
            totalCount
          }
        }
      }
    }
  }
`;

export interface FollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  followersCount: number;
}

interface GraphQLFollowingUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  followers: {
    totalCount: number;
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const userToken = await getGitHubToken();

    const data = await makeGitHubGraphQLRequest(
      FOLLOWING_QUERY,
      { login: username },
      userToken
    );

    const followingNodes = data.user?.following?.nodes as GraphQLFollowingUser[] || [];

    const following: FollowingUser[] = followingNodes.map((user) => ({
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      followersCount: user.followers?.totalCount ?? 0,
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
