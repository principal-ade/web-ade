import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

// Map from GraphQL enum names to REST API content values
const GRAPHQL_TO_REST: Record<string, ReactionContent> = {
  THUMBS_UP: '+1',
  THUMBS_DOWN: '-1',
  LAUGH: 'laugh',
  CONFUSED: 'confused',
  HEART: 'heart',
  HOORAY: 'hooray',
  ROCKET: 'rocket',
  EYES: 'eyes',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; number: string }> }
) {
  try {
    const { owner, name, number } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return NextResponse.json(
        { error: "Authentication required to add reactions" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const graphqlContent = body.content as string;
    const restContent = GRAPHQL_TO_REST[graphqlContent];

    if (!restContent) {
      return NextResponse.json(
        { error: `Invalid reaction content: ${graphqlContent}` },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}/reactions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "WebADE/1.0",
        },
        body: JSON.stringify({ content: restContent }),
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
      content: graphqlContent,
      user: data.user?.login,
    });
  } catch (error) {
    console.error("[reactions] Error adding reaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string; number: string }> }
) {
  try {
    const { owner, name, number } = await params;
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

    // GitHub's delete reaction endpoint uses the repo-level reactions endpoint
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${number}/reactions/${reactionId}`,
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
    console.error("[reactions] Error removing reaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
