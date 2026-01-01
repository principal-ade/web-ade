import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

export async function GET(
  _request: NextRequest,
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

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "WebADE/1.0",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub API Error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return relevant issue details
    const issue = {
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at,
      html_url: data.html_url,
      user: {
        login: data.user.login,
        avatar_url: data.user.avatar_url,
      },
      labels: data.labels.map((l: { id: number; name: string; color: string }) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      comments: data.comments,
    };

    const jsonResponse = NextResponse.json(issue);

    // Cache for 2 minutes
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=240"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[issue] Error fetching issue:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
