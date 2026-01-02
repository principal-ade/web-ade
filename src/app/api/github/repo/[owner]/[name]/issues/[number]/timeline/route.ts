import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; number: string }> }
) {
  try {
    const { owner, name, number } = await params;
    const userToken = await getGitHubToken();
    const token = userToken || process.env.GITHUB_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "GitHub token required" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const perPage = searchParams.get("per_page") || "100";

    // Fetch timeline events (requires preview header for full timeline)
    const timelineResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}/timeline?per_page=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.mockingbird-preview+json",
          "User-Agent": "WebADE/1.0",
        },
      }
    );

    if (!timelineResponse.ok) {
      return NextResponse.json(
        { error: `GitHub API Error: ${timelineResponse.status} ${timelineResponse.statusText}` },
        { status: timelineResponse.status }
      );
    }

    const timeline = await timelineResponse.json();

    // Check if this is a PR by looking at the issue endpoint
    const issueResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "WebADE/1.0",
        },
      }
    );

    let reviewComments: unknown[] = [];
    let isPullRequest = false;

    if (issueResponse.ok) {
      const issueData = await issueResponse.json();
      isPullRequest = !!issueData.pull_request;

      // If it's a PR, also fetch review comments (inline code comments)
      if (isPullRequest) {
        const reviewCommentsResponse = await fetch(
          `https://api.github.com/repos/${owner}/${name}/pulls/${number}/comments?per_page=100`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "WebADE/1.0",
            },
          }
        );

        if (reviewCommentsResponse.ok) {
          reviewComments = await reviewCommentsResponse.json();
        }
      }
    }

    const result = {
      timeline,
      reviewComments,
      isPullRequest,
    };

    const jsonResponse = NextResponse.json(result);

    // Cache for 1 minute
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=120"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[timeline] Error fetching timeline:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
