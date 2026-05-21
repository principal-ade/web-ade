/**
 * Accept a trail suggestion. Owner-only.
 *
 * Two-write operation across two S3 objects: the topic record gets the new
 * trailId appended, then the suggestion container flips status to `accepted`.
 * Order is deliberate — see `suggestions-storage.ts` header for the recovery
 * story when the second write fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  getTopic,
  updateTopic,
  upsertTopicInUserIndex,
} from '@/lib/topics/s3-storage';
import {
  acceptSuggestion,
  getSuggestion,
} from '@/lib/topics/suggestions-storage';
import { MAX_TRAILS_PER_TOPIC } from '@/lib/topics/constants';
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
  console.error('[TopicSuggestions] accept error:', error);
  return NextResponse.json(
    { error: 'Failed to accept suggestion' },
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

    const suggestion = await getSuggestion(id, suggestionId);
    if (!suggestion) {
      return NextResponse.json(
        {
          error: 'Suggestion not found',
          code: TopicErrorCodes.SUGGESTION_NOT_FOUND,
        },
        { status: 404 },
      );
    }
    if (suggestion.status !== 'pending') {
      return NextResponse.json(
        {
          error: `Suggestion already ${suggestion.status}`,
          code: TopicErrorCodes.SUGGESTION_ALREADY_RESOLVED,
        },
        { status: 409 },
      );
    }

    // If the trail isn't already on the topic, append it. We check the cap
    // against the resulting list, not the existing one — accepting brings
    // length from N to N+1.
    if (!topic.trailIds.includes(suggestion.trailId)) {
      if (topic.trailIds.length >= MAX_TRAILS_PER_TOPIC) {
        return NextResponse.json(
          {
            error: `Cap of ${MAX_TRAILS_PER_TOPIC} trails per topic reached`,
            code: TopicErrorCodes.TOO_MANY_TRAILS,
          },
          { status: 409 },
        );
      }
      // Idempotent: if a concurrent path appended the same trail between our
      // peek and this write, the updater sees the duplicate and skips it.
      const updated = await updateTopic(id, (current) => {
        if (current.trailIds.includes(suggestion.trailId)) return current;
        return {
          ...current,
          trailIds: [...current.trailIds, suggestion.trailId],
        };
      });
      await upsertTopicInUserIndex(updated);
    }

    const resolved = await acceptSuggestion(id, suggestionId, {
      githubId: user.id,
      githubLogin: user.login,
    });

    return NextResponse.json({ suggestion: resolved });
  } catch (error) {
    return errorResponse(error);
  }
}
