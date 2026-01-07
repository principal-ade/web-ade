import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

/**
 * Add a reaction to an issue comment
 * POST /api/github/repo/{owner}/{name}/issues/comments/{commentId}/reactions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; commentId: string }> }
) {
  try {
    const { owner, name, commentId } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return NextResponse.json(
        { error: "Authentication required to add reactions" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const content = body.content as ReactionContent;

    if (!content) {
      return NextResponse.json(
        { error: "Reaction content is required" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}/reactions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "WebADE/1.0",
        },
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `GitHub API Error: ${response.status} - ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      id: data.id,
      content: data.content,
      user: data.user?.login,
    });
  } catch (error) {
    console.error("[comment-reactions] Error adding reaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Remove a reaction from an issue comment
 * DELETE /api/github/repo/{owner}/{name}/issues/comments/{commentId}/reactions?reactionId={id}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; commentId: string }> }
) {
  try {
    const { owner, name, commentId } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return NextResponse.json(
        { error: "Authentication required to remove reactions" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const reactionId = searchParams.get('reactionId');

    if (!reactionId) {
      return NextResponse.json(
        { error: "reactionId query parameter required" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}/reactions/${reactionId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "WebADE/1.0",
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      const error = await response.text();
      return NextResponse.json(
        { error: `GitHub API Error: ${response.status} - ${error}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[comment-reactions] Error removing reaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
