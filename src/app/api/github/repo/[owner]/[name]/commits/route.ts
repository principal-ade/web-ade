import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getGitHubToken } from "@/lib/auth/cookies";
import { CACHE_TTL, CACHE_TAGS, GitHubApiError } from "@/lib/github-cache";
import { getCached, setCachedAsync, getCommitsCacheKey } from "@/lib/redis-cache";
import type { GitHubCommit } from "@/types/api";

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
  }>;
}

/**
 * Fetch commits from GitHub with server-side caching
 * Uses shared cache for public repos to reduce API calls across all clients
 */
async function fetchCommitsFromGitHub(
  owner: string,
  name: string,
  perPage: number,
  page: number,
  sha: string | undefined,
  token: string | null
): Promise<GitHubCommit[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "WebADE/1.0",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const queryParams = new URLSearchParams({
    per_page: perPage.toString(),
    page: page.toString(),
  });
  if (sha) {
    queryParams.set("sha", sha);
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${name}/commits?${queryParams}`,
    { headers }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new GitHubApiError(
      errorData.message || `GitHub API error: ${response.status}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Get cached commits - shared cache for public repos
 * All clients polling the same repo share this cache entry
 */
function getCachedCommits(
  owner: string,
  name: string,
  perPage: number,
  page: number,
  sha: string | undefined,
  token: string | null
): Promise<GitHubCommit[]> {
  // Cache key includes query params but NOT token (shared cache for public repos)
  const cacheKey = `commits:${owner}/${name}:${perPage}:${page}:${sha || 'HEAD'}`;

  return unstable_cache(
    () => fetchCommitsFromGitHub(owner, name, perPage, page, sha, token),
    [cacheKey],
    {
      revalidate: CACHE_TTL.COMMITS,
      tags: [CACHE_TAGS.GITHUB_API, CACHE_TAGS.COMMITS, `commits:${owner}/${name}`],
    }
  )();
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { owner, name } = await params;
  const searchParams = request.nextUrl.searchParams;
  const perPage = Math.min(parseInt(searchParams.get("per_page") || "30"), 100);
  const page = parseInt(searchParams.get("page") || "1");
  const sha = searchParams.get("sha") || undefined;

  // Get user's GitHub token from cookies, fall back to server token
  const userToken = await getGitHubToken();
  const token = userToken || process.env.GITHUB_TOKEN || null;

  // Check Redis cache first
  const redisKey = getCommitsCacheKey(owner, name, perPage, page, sha);
  const cachedFromRedis = await getCached<GitHubCommit[]>(redisKey);

  if (cachedFromRedis) {
    const jsonResponse = NextResponse.json(
      { commits: cachedFromRedis },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_TTL.COMMITS}, stale-while-revalidate=${CACHE_TTL.COMMITS * 2}`,
          "X-Cache-Source": "redis",
        },
      }
    );
    return addCorsHeaders(jsonResponse);
  }

  try {
    // Use server-side caching - all clients share this cache
    const commits = await getCachedCommits(owner, name, perPage, page, sha, token);

    // Store in Redis asynchronously (fire and forget)
    setCachedAsync(redisKey, commits, 1200); // 20 min in Redis

    // Return commits with cache headers for CDN/browser
    const jsonResponse = NextResponse.json(
      { commits },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_TTL.COMMITS}, stale-while-revalidate=${CACHE_TTL.COMMITS * 2}`,
          "X-Cache-Source": "nextjs",
        },
      }
    );

    return addCorsHeaders(jsonResponse);
  } catch (error) {
    console.error("[commits API] Error fetching commits:", error);

    if (error instanceof GitHubApiError) {
      return addCorsHeaders(
        NextResponse.json(
          { error: error.message, status: error.status },
          { status: error.status }
        )
      );
    }

    return addCorsHeaders(
      NextResponse.json(
        { error: "Failed to fetch commits" },
        { status: 500 }
      )
    );
  }
}
