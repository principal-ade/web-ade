import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/github/user/:username/pinned
 *
 * Fetches pinned repositories for a GitHub user or organization.
 * Returns an array of repository full names (owner/repo format).
 */

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
  variables: Record<string, unknown>
) {
  const token = process.env.GITHUB_TOKEN || null;

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

// Query for pinned repositories
const PINNED_REPOS_QUERY = `
  query UserPinnedRepositories($login: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            nameWithOwner
          }
        }
      }
    }
  }
`;

// Query for organization pinned repositories
const ORG_PINNED_REPOS_QUERY = `
  query OrgPinnedRepositories($login: String!) {
    organization(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            nameWithOwner
          }
        }
      }
    }
  }
`;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    // Try user query first
    let data;
    try {
      data = await makeGitHubGraphQLRequest(PINNED_REPOS_QUERY, {
        login: username,
      });
    } catch (error) {
      // If user query fails, try organization query
      if (error instanceof GitHubApiError && error.status === 400) {
        data = await makeGitHubGraphQLRequest(ORG_PINNED_REPOS_QUERY, {
          login: username,
        });
      } else {
        throw error;
      }
    }

    const entity = data.user || data.organization;

    if (!entity) {
      return NextResponse.json(
        { error: `User or organization '${username}' not found` },
        { status: 404 }
      );
    }

    // Extract repository names
    const pinnedRepos: string[] = entity.pinnedItems?.nodes
      ?.map((node: { nameWithOwner?: string }) => node.nameWithOwner)
      .filter(Boolean) || [];

    const response = { pinnedRepos };

    const jsonResponse = NextResponse.json(response);

    // Cache for 5 minutes (pinned repos don't change often)
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[pinned] Error fetching pinned repositories:", error);

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
