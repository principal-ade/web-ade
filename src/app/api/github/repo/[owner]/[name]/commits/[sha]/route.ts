import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";
import { getCached, setCachedAsync, getCommitDetailCacheKey } from "@/lib/redis-cache";
import type { GitHubCommitDetailResponse } from "@/types/api";

const CACHE_TTL_24H = 86400; // 24 hours in seconds

function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return response;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}

const GITHUB_API_BASE = "https://api.github.com";

interface RouteParams {
  params: Promise<{
    owner: string;
    name: string;
    sha: string;
  }>;
}

/**
 * GET /api/github/repo/[owner]/[name]/commits/[sha]
 *
 * Fetches a single commit with full details including:
 * - stats (additions, deletions, total)
 * - files (list of changed files with stats)
 * - parents (parent commit SHAs)
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { owner, name, sha } = await params;

  // Check Redis cache first (SHA-based, immutable, 24h TTL)
  const cacheKey = getCommitDetailCacheKey(owner, name, sha);
  const cached = await getCached<GitHubCommitDetailResponse>(cacheKey);

  if (cached) {
    const jsonResponse = NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
        "X-Cache-Source": "redis",
      },
    });
    return addCorsHeaders(jsonResponse);
  }

  // Get user's GitHub token from cookies
  const userToken = await getGitHubToken();
  const token = userToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "WebADE/1.0",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${name}/commits/${sha}`,
      { headers },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return addCorsHeaders(
        NextResponse.json(
          {
            error: errorData.message || `GitHub API error: ${response.status}`,
            status: response.status,
          },
          { status: response.status },
        ),
      );
    }

    const commit: GitHubCommitDetailResponse = await response.json();

    // Cache in Redis (24h TTL - commits are immutable)
    setCachedAsync(cacheKey, commit, CACHE_TTL_24H);

    // Return commit with cache headers
    const jsonResponse = NextResponse.json(commit, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
        "X-Cache-Source": "github",
      },
    });

    return addCorsHeaders(jsonResponse);
  } catch (error) {
    console.error("[commit API] Error fetching commit:", error);
    return addCorsHeaders(
      NextResponse.json(
        { error: "Failed to fetch commit" },
        { status: 500 },
      ),
    );
  }
}
