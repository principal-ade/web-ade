import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";
import type { components } from "@octokit/openapi-types";

// The single-PR detail payload — carries what `pullRequestViewFromGitHubPullRequest`
// needs (merged/merged_at, draft, base/head, requested_reviewers, labels,
// assignees, author_association, additions/deletions/changed_files/commits).
type GitHubPullRequest = components["schemas"]["pull-request"];

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
      `https://api.github.com/repos/${owner}/${name}/pulls/${number}`,
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

    // Return the full GitHub payload so the client can map it with
    // `pullRequestViewFromGitHubPullRequest` (the superset is intentional — the
    // adapter reads merged_at, draft, base/head, requested_reviewers, labels,
    // assignees, author_association, and the diff counters).
    const data: GitHubPullRequest = await response.json();

    const jsonResponse = NextResponse.json(data);

    // Cache for 2 minutes
    jsonResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=240"
    );

    return jsonResponse;
  } catch (error) {
    console.error("[pull-request] Error fetching PR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Add a comment to a pull request
 * POST /api/github/repo/{owner}/{name}/pull-requests/{number}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; number: string }> }
) {
  try {
    const { owner, name, number } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return NextResponse.json(
        { error: "Authentication required to add comments" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { comment } = body;

    if (!comment) {
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 }
      );
    }

    // PRs use the issues endpoint for comments
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "WebADE/1.0",
        },
        body: JSON.stringify({ body: comment }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || `GitHub API Error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      comment: {
        id: data.id,
        body: data.body,
        html_url: data.html_url,
        created_at: data.created_at,
        user: {
          login: data.user.login,
          avatar_url: data.user.avatar_url,
        },
      },
    });
  } catch (error) {
    console.error("[pull-request] Error adding comment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Update a pull request (close/reopen, update title, etc.)
 * PATCH /api/github/repo/{owner}/{name}/pull-requests/{number}
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; number: string }> }
) {
  try {
    const { owner, name, number } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return NextResponse.json(
        { error: "Authentication required to update pull requests" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Build update payload
    const updatePayload: {
      state?: 'open' | 'closed';
      title?: string;
      body?: string;
    } = {};

    if (body.state) updatePayload.state = body.state;
    if (body.title) updatePayload.title = body.title;
    if (body.body !== undefined) updatePayload.body = body.body;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/pulls/${number}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "WebADE/1.0",
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || `GitHub API Error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      pullRequest: {
        number: data.number,
        title: data.title,
        state: data.state,
        html_url: data.html_url,
        updated_at: data.updated_at,
      },
    });
  } catch (error) {
    console.error("[pull-request] Error updating PR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Delete a pull request (not supported by GitHub API - use PATCH to close instead)
 * DELETE /api/github/repo/{owner}/{name}/pull-requests/{number}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; number: string }> }
) {
  // GitHub doesn't support deleting PRs via API
  // We'll close the PR instead
  return PATCH(request, { params });
}
