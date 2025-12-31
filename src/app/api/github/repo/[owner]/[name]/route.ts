import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { gitTreeCache } from "@/lib/git-tree-cache";
import { getGitHubToken } from "@/lib/auth/cookies";

function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return response;
}

// Handle preflight OPTIONS requests
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}

const GITHUB_API_BASE = "https://api.github.com";

// Cache durations (in seconds) for different action types
const CACHE_DURATIONS = {
  info: 300, // 5 minutes - repository info changes infrequently
  tree: 180, // 3 minutes - file tree changes with commits
  readme: 600, // 10 minutes - README changes rarely
  file: 600, // 10 minutes - individual files change rarely
  contributors: 1800, // 30 minutes - very stable data
  "file-count": 600, // 10 minutes - stable data
  counts: 120, // 2 minutes - PR/issue counts can change frequently
} as const;

class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function makeGitHubRequest(endpoint: string, userToken?: string | null) {
  // Use user's token if provided, otherwise fall back to server token
  const token = userToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeCity-App/1.0",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    let errorMessage = `GitHub API Error: ${response.status} ${response.statusText}`;

    // Add token diagnostic information for 401 errors
    if (response.status === 401) {
      const tokenSource = token ? "environment" : "none";
      const tokenPrefix = token ? `${token.substring(0, 8)}...` : "null";

      errorMessage += `\nToken Status: ${tokenSource} (${tokenPrefix})`;

      if (!token) {
        errorMessage +=
          "\nSuggestion: No GitHub token available. Please set GITHUB_TOKEN environment variable.";
      } else {
        errorMessage +=
          "\nSuggestion: Token may be expired or invalid. Please check your GitHub token permissions and expiration.";
      }
    }

    throw new GitHubApiError(errorMessage, response.status);
  }

  return response.json();
}

// GraphQL request for efficient data fetching
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
      "User-Agent": "CodeCity-App/1.0",
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

// Cached version of makeGitHubRequest
function makeCachedGitHubRequest(
  endpoint: string,
  cacheKey: string,
  revalidate: number,
  userToken?: string | null,
) {
  // Note: We include userToken in the cache key for user-specific data
  const fullCacheKey = userToken ? `${cacheKey}-user-${userToken.substring(0, 8)}` : cacheKey;
  return unstable_cache(
    async () => makeGitHubRequest(endpoint, userToken),
    [fullCacheKey],
    {
      revalidate,
      tags: ["github-api", fullCacheKey],
    },
  )();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  try {
    const { owner, name } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "info";

    // Get user's GitHub token from HTTP-only cookie
    const userToken = await getGitHubToken();

    let data;

    switch (action) {
      case "info":
        data = await makeCachedGitHubRequest(
          `/repos/${owner}/${name}`,
          `repo-info-${owner}-${name}`,
          CACHE_DURATIONS.info,
          userToken,
        );
        break;

      case "tree": {
        // Fetch tree with in-memory caching by SHA
        // First resolve the ref to actual commit SHA to ensure cache freshness
        const requestedRef = searchParams.get("ref") || "HEAD";

        // Get the latest commit SHA for the ref to use as cache key
        // This ensures we don't serve stale trees when new commits are pushed
        let resolvedSha: string;
        try {
          const refData = await makeGitHubRequest(
            `/repos/${owner}/${name}/commits/${requestedRef}`,
            userToken
          );
          resolvedSha = refData.sha;
        } catch {
          // If we can't resolve the ref, fall back to using the ref directly
          resolvedSha = requestedRef;
        }

        const cacheKey = `${owner}/${name}/${resolvedSha}`;

        // Check in-memory cache first using the resolved SHA
        const cachedTree = gitTreeCache.get(cacheKey);
        if (cachedTree) {
          data = cachedTree;
          break;
        }

        // Not in cache, fetch from GitHub using the resolved SHA
        data = await makeGitHubRequest(
          `/repos/${owner}/${name}/git/trees/${resolvedSha}?recursive=1`,
          userToken
        );

        // Cache by SHA
        if (data && data.sha) {
          gitTreeCache.set(cacheKey, data);
          gitTreeCache.set(data.sha, data); // Also cache by tree SHA for direct lookups
        }
        break;
      }

      case "readme":
        data = await makeCachedGitHubRequest(
          `/repos/${owner}/${name}/readme`,
          `repo-readme-${owner}-${name}`,
          CACHE_DURATIONS.readme,
          userToken,
        );
        break;

      case "contributors":
        data = await makeCachedGitHubRequest(
          `/repos/${owner}/${name}/contributors?per_page=100`,
          `repo-contributors-${owner}-${name}`,
          CACHE_DURATIONS.contributors,
          userToken,
        );
        break;

      case "file":
        const filePath = searchParams.get("path");
        if (!filePath) {
          return NextResponse.json(
            { error: "File path required" },
            { status: 400 },
          );
        }
        data = await makeCachedGitHubRequest(
          `/repos/${owner}/${name}/contents/${filePath}`,
          `repo-file-${owner}-${name}-${filePath}`,
          CACHE_DURATIONS.file,
          userToken,
        );
        break;

      case "counts": {
        // Use GraphQL to efficiently fetch PR and issue counts in a single request
        const countsQuery = `
          query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
              issues(states: OPEN) { totalCount }
              pullRequests(states: OPEN) { totalCount }
            }
          }
        `;
        const countsData = await makeGitHubGraphQLRequest(
          countsQuery,
          { owner, name },
          userToken
        );
        data = {
          openIssues: countsData.repository.issues.totalCount,
          openPullRequests: countsData.repository.pullRequests.totalCount,
        };
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Add cache control headers to response
    const cacheDuration = CACHE_DURATIONS[action as keyof typeof CACHE_DURATIONS] || 300;
    const response = NextResponse.json(data);

    // Set cache headers for CDN/browser caching
    response.headers.set(
      "Cache-Control",
      `public, s-maxage=${cacheDuration}, stale-while-revalidate=${cacheDuration * 2}`,
    );

    return response;
  } catch (error) {
    console.error("GitHub API proxy error:", error);

    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
