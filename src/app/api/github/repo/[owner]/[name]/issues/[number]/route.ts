import { NextRequest, NextResponse } from "next/server";
import type { components } from "@octokit/openapi-types";
import { getGitHubToken } from "@/lib/auth/cookies";

type GitHubIssue = components["schemas"]["issue"];

type RouteParams = { params: Promise<{ owner: string; name: string; number: string }> };

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

    // Pass the raw GitHub issue through, typed against the official schema
    // (`@octokit/openapi-types`). Previously this route hand-picked a subset
    // and dropped `state_reason`, `author_association`, and `assignees` — the
    // fields the File City issue view needs. Returning the full payload lets
    // the client map it with `issueViewFromGitHubIssue` and keeps the response
    // a superset of the old shape (same top-level field names), so any other
    // consumer keeps working.
    const data = (await response.json()) as GitHubIssue;

    const jsonResponse = NextResponse.json(data);

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

/**
 * Add a comment to an issue
 * POST /api/github/repo/{owner}/{name}/issues/{number}
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
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
    console.error("[issue] Error adding comment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Update an issue (close/reopen, update labels, etc.)
 * PATCH /api/github/repo/{owner}/{name}/issues/{number}
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { owner, name, number } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return NextResponse.json(
        { error: "Authentication required to update issues" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Build update payload - only include fields that are provided
    const updatePayload: {
      state?: 'open' | 'closed';
      title?: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    } = {};

    if (body.state) updatePayload.state = body.state;
    if (body.title) updatePayload.title = body.title;
    if (body.body !== undefined) updatePayload.body = body.body;
    if (body.labels) updatePayload.labels = body.labels;
    if (body.assignees) updatePayload.assignees = body.assignees;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}`,
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
      issue: {
        number: data.number,
        title: data.title,
        state: data.state,
        html_url: data.html_url,
        updated_at: data.updated_at,
      },
    });
  } catch (error) {
    console.error("[issue] Error updating issue:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Delete an issue (not supported by GitHub API - use PATCH to close instead)
 * DELETE /api/github/repo/{owner}/{name}/issues/{number}
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  // GitHub doesn't support deleting issues via API
  // We'll close the issue instead
  return PATCH(request, { params });
}
