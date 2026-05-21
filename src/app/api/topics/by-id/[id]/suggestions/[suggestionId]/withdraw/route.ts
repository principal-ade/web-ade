/**
 * Withdraw a trail suggestion. Suggester-only — the storage layer re-checks
 * that the actor matches the original `suggestedBy` under the ETag lock, so
 * this route only needs to ensure the caller is authenticated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getTopic } from '@/lib/topics/s3-storage';
import { withdrawSuggestion } from '@/lib/topics/suggestions-storage';
import { TopicErrorCodes, TopicShareError } from '@/lib/topics/types';

interface Params {
  params: Promise<{ id: string; suggestionId: string }>;
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TopicShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error('[TopicSuggestions] withdraw error:', error);
  return NextResponse.json(
    { error: 'Failed to withdraw suggestion' },
    { status: 500 },
  );
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id, suggestionId } = await params;

    const githubToken = await getGitHubToken();
    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }
    const user = await fetchGitHubUser(githubToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    // Surface 404 for unknown topics before hitting suggestions storage so
    // a typo'd topic id doesn't read as "suggestion not found".
    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    const resolved = await withdrawSuggestion(id, suggestionId, {
      githubId: user.id,
      githubLogin: user.login,
    });

    return NextResponse.json({ suggestion: resolved });
  } catch (error) {
    return errorResponse(error);
  }
}
