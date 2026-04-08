import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

/**
 * Stargazers API - Fetches stargazers with timestamps for star history
 *
 * Query params:
 * - limit: max number of stargazers to fetch (default: 100, max: 1000)
 * - cursor: pagination cursor for fetching more
 */

interface StargazerEdge {
  starredAt: string;
  node: {
    login: string;
    avatarUrl: string;
  };
}

interface StargazersResponse {
  totalCount: number;
  stargazers: Array<{
    login: string;
    avatarUrl: string;
    starredAt: string;
  }>;
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

const STARGAZERS_QUERY = `
  query($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      stargazerCount
      stargazers(first: $first, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          starredAt
          node {
            login
            avatarUrl
          }
        }
      }
    }
  }
`;

async function makeGitHubGraphQLRequest(
  query: string,
  variables: Record<string, unknown>,
  userToken?: string | null
) {
  const token = userToken || process.env.GITHUB_TOKEN || null;

  if (!token) {
    throw new Error("GitHub token required for GraphQL API");
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "CodeCity-App/1.0",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GitHub GraphQL Error: ${data.errors[0]?.message || "Unknown error"}`);
  }

  return data.data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 100);
    const cursor = searchParams.get("cursor") || null;

    const userToken = await getGitHubToken();

    const data = await makeGitHubGraphQLRequest(
      STARGAZERS_QUERY,
      { owner, name, first: limit, after: cursor },
      userToken
    );

    const repository = data.repository;
    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 404 }
      );
    }

    const response: StargazersResponse = {
      totalCount: repository.stargazerCount,
      stargazers: repository.stargazers.edges.map((edge: StargazerEdge) => ({
        login: edge.node.login,
        avatarUrl: edge.node.avatarUrl,
        starredAt: edge.starredAt,
      })),
      pageInfo: repository.stargazers.pageInfo,
    };

    // Cache for 2 minutes
    const nextResponse = NextResponse.json(response);
    nextResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=240"
    );

    return nextResponse;
  } catch (error) {
    console.error("Stargazers API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
