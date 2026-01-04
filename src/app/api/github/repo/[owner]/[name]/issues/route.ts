import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  const state = searchParams.get("state") || "open"; // open, closed, all

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
      `${GITHUB_API_BASE}/repos/${owner}/${name}/issues?${queryParams}`,
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

    const issues = await response.json();

    // Filter out pull requests (GitHub API returns PRs as issues too)
    const filteredIssues = issues.filter(
      (issue: { pull_request?: unknown }) => !issue.pull_request
    );

    // Return issues with cache headers
    const jsonResponse = NextResponse.json(
      {
        issues: filteredIssues,
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
    console.error("[issues API] Error fetching issues:", error);
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Failed to fetch issues",
          isAuthenticated: !!userToken,
        },
        { status: 500 },
      ),
    );
  }
}

/**
 * Create a new issue in the repository
 * POST /api/github/repo/{owner}/{name}/issues
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { owner, name } = await params;

  // Get user's GitHub token - REQUIRED for creating issues
  const userToken = await getGitHubToken();

  if (!userToken) {
    return addCorsHeaders(
      NextResponse.json(
        { error: "Authentication required to create issues" },
        { status: 401 }
      )
    );
  }

  try {
    const body = await request.json();
    const { title, body: issueBody, labels, assignees } = body;

    if (!title) {
      return addCorsHeaders(
        NextResponse.json({ error: "Title is required" }, { status: 400 })
      );
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${name}/issues`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `token ${userToken}`,
          "Content-Type": "application/json",
          "User-Agent": "WebADE/1.0",
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels,
          assignees,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return addCorsHeaders(
        NextResponse.json(
          { error: errorData.message || `GitHub API error: ${response.status}` },
          { status: response.status }
        )
      );
    }

    const issue = await response.json();
    return addCorsHeaders(NextResponse.json({ issue, success: true }));
  } catch (error) {
    console.error("[issues API] Error creating issue:", error);
    return addCorsHeaders(
      NextResponse.json({ error: "Failed to create issue" }, { status: 500 })
    );
  }
}
