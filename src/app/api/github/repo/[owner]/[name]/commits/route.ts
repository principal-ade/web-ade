import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { owner, name } = await params;
  const searchParams = request.nextUrl.searchParams;
  const perPage = Math.min(parseInt(searchParams.get("per_page") || "30"), 100);
  const page = parseInt(searchParams.get("page") || "1");
  const sha = searchParams.get("sha") || undefined; // Branch or commit SHA to start from

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

  // Forward ETag for conditional requests
  const clientEtag = request.headers.get("If-None-Match");
  if (clientEtag) {
    headers["If-None-Match"] = clientEtag;
  }

  try {
    // Build query parameters
    const queryParams = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString(),
    });
    if (sha) {
      queryParams.set("sha", sha);
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${name}/commits?${queryParams}`,
      { headers },
    );

    // Handle 304 Not Modified - forward it to client
    if (response.status === 304) {
      const notModifiedResponse = new NextResponse(null, { status: 304 });
      return addCorsHeaders(notModifiedResponse);
    }

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

    const commits: GitHubCommit[] = await response.json();

    // Get ETag from GitHub response
    const etag = response.headers.get("ETag");

    // Return commits with cache headers and ETag
    const responseHeaders: Record<string, string> = {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    };
    if (etag) {
      responseHeaders["ETag"] = etag;
    }

    const jsonResponse = NextResponse.json(
      { commits },
      { headers: responseHeaders },
    );

    return addCorsHeaders(jsonResponse);
  } catch (error) {
    console.error("[commits API] Error fetching commits:", error);
    return addCorsHeaders(
      NextResponse.json(
        { error: "Failed to fetch commits" },
        { status: 500 },
      ),
    );
  }
}
