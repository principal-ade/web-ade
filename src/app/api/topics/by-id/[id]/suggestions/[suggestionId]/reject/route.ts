/**
 * Reject (dismiss) a suggestion. Owner-only. Pure status flip — the topic
 * record is untouched. Accepts an optional `{ reason }` body that is stored
 * as `resolveReason` on the suggestion, used by the UI to surface
 * "dismissed because…" notes (project-kind suggestions in particular).
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getTopic } from '@/lib/topics/s3-storage';
import { rejectSuggestion } from '@/lib/topics/suggestions-storage';
import { validateRejectRequest } from '@/lib/topics/validation';
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
  console.error('[TopicSuggestions] reject error:', error);
  return NextResponse.json(
    { error: 'Failed to reject suggestion' },
    { status: 500 },
  );
}

export async function POST(request: NextRequest, { params }: Params) {
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

    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }
    if (topic.createdBy.githubId !== user.id) {
      return NextResponse.json(
        { error: 'Not the topic owner', code: TopicErrorCodes.NOT_OWNER },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const { reason } = validateRejectRequest(body);

    const resolved = await rejectSuggestion(
      id,
      suggestionId,
      { githubId: user.id, githubLogin: user.login },
      reason,
    );

    return NextResponse.json({ suggestion: resolved });
  } catch (error) {
    return errorResponse(error);
  }
}
