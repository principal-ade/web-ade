import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: {
    login: string;
  } | null;
  html_url: string;
}

export interface CommitDetails {
  sha: string;
  message: string;
  date: string;
  url: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; owner: string; repo: string }> }
) {
  try {
    const { username, owner, repo } = await params;
    const userToken = await getGitHubToken();
    const token = userToken || process.env.GITHUB_TOKEN || null;

    // Get date filter from query params (default to 1 day ago)
    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get("since") || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const until = searchParams.get("until");

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "WebADE/1.0",
    };

    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    // Note: We don't filter by author because GitHub's author filter uses git commit
    // author name/email, not GitHub username. The contribution data already tells us
    // these are this user's commits within the date range.
    let url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${since}&per_page=30`;
    if (until) {
      url += `&until=${until}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const allCommits: GitHubCommit[] = await response.json();

    // Filter by GitHub username (author.login) since the API's author param
    // filters by git commit author name/email which often doesn't match
    const userCommits = allCommits.filter(
      (commit) => commit.author?.login?.toLowerCase() === username.toLowerCase()
    );

    const details: CommitDetails[] = userCommits.map((commit) => ({
      sha: commit.sha.slice(0, 7),
      message: commit.commit.message.split("\n")[0] || "", // First line only
      date: commit.commit.author.date,
      url: commit.html_url,
    }));

    const jsonResponse = NextResponse.json({ commits: details });

    // Cache for 2 minutes
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=240"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[commits] Error fetching commits:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
