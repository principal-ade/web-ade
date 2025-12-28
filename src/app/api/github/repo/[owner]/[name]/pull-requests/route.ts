import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { owner, name } = await params;
  const searchParams = request.nextUrl.searchParams;
  const perPage = Math.min(parseInt(searchParams.get("per_page") || "30"), 100);
  const page = parseInt(searchParams.get("page") || "1");
  const state = searchParams.get("state") || "all"; // open, closed, all

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
    // Build query parameters
    const queryParams = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString(),
      state,
      sort: "updated",
      direction: "desc",
    });

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${name}/pulls?${queryParams}`,
      { headers },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return addCorsHeaders(
        NextResponse.json(
          {
            error: errorData.message || `GitHub API error: ${response.status}`,
            status: response.status,
            isAuthenticated: !!userToken,
          },
          { status: response.status },
        ),
      );
    }

    const pullRequests = await response.json();

    // Transform to match PullRequestInfo interface expected by GitPullRequestsPanel
    const transformedPRs = pullRequests.map((pr: {
      id: number;
      number: number;
      title: string;
      body: string | null;
      state: 'open' | 'closed';
      draft?: boolean;
      html_url: string;
      user?: {
        login: string;
        avatar_url?: string;
        html_url?: string;
      } | null;
      created_at: string;
      updated_at: string;
      closed_at?: string | null;
      merged_at?: string | null;
      base?: {
        ref: string;
        sha?: string;
      } | null;
      head?: {
        ref: string;
        sha?: string;
      } | null;
      comments?: number;
      review_comments?: number;
    }) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      draft: pr.draft,
      html_url: pr.html_url,
      user: pr.user ? {
        login: pr.user.login,
        avatar_url: pr.user.avatar_url,
        html_url: pr.user.html_url,
      } : null,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at,
      merged_at: pr.merged_at,
      base: pr.base ? {
        ref: pr.base.ref,
        sha: pr.base.sha,
      } : null,
      head: pr.head ? {
        ref: pr.head.ref,
        sha: pr.head.sha,
      } : null,
      comments: pr.comments,
      review_comments: pr.review_comments,
    }));

    // Return pull requests with cache headers
    const jsonResponse = NextResponse.json(
      {
        pullRequests: transformedPRs,
        owner,
        repo: name,
        isAuthenticated: !!userToken,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );

    return addCorsHeaders(jsonResponse);
  } catch (error) {
    console.error("[pull-requests API] Error fetching pull requests:", error);
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Failed to fetch pull requests",
          isAuthenticated: !!userToken,
        },
        { status: 500 },
      ),
    );
  }
}
