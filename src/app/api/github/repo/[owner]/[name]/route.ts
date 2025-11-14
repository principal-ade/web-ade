import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { gitTreeCache } from "@/lib/git-tree-cache";

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
} as const;

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

    throw new Error(errorMessage);
  }

  return response.json();
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

    // Get user's GitHub token from Authorization header
    const authHeader = request.headers.get('authorization');
    const userToken = authHeader?.replace('Bearer ', '').replace('token ', '') || null;

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

      case "tree":
        // Fetch tree with in-memory caching by SHA
        const ref = searchParams.get("ref") || "HEAD";
        const cacheKey = `${owner}/${name}/${ref}`;

        // Check in-memory cache first
        const cachedTree = gitTreeCache.get(cacheKey);
        if (cachedTree) {
          data = cachedTree;
          break;
        }

        // Not in cache, fetch from GitHub
        data = await makeGitHubRequest(
          `/repos/${owner}/${name}/git/trees/${ref}?recursive=1`,
          userToken
        );

        // Cache by both the requested ref AND the returned SHA
        if (data && data.sha) {
          gitTreeCache.set(cacheKey, data);
          gitTreeCache.set(data.sha, data); // Also cache by SHA for direct lookups
        }
        break;

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
