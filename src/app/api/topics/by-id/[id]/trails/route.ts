/**
 * Topic trails — POST adds a trail, PATCH reorders. Owner-gated.
 *
 * Add validates the trail id resolves via `trails/_by-id/{id}.json` before
 * appending. Reorder requires the new list to be a permutation of the
 * existing list (no add/remove via reorder — keeps surfaces honest).
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getIdPointer } from '@/lib/trails/s3-storage';
import {
  getTopic,
  updateTopic,
  upsertTopicInUserIndex,
} from '@/lib/topics/s3-storage';
import { resolveProjectSuggestionsForRepo } from '@/lib/topics/suggestions-storage';
import {
  validateAddTrailRequest,
  validateReorderRequest,
} from '@/lib/topics/validation';
import { MAX_TRAILS_PER_TOPIC } from '@/lib/topics/constants';
import {
  TopicErrorCodes,
  TopicShareError,
} from '@/lib/topics/types';

interface Params {
  params: Promise<{ id: string }>;
}

function errorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof TopicShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error(`[Topics] trails ${where} error:`, error);
  return NextResponse.json(
    { error: `Failed to ${where} trail` },
    { status: 500 },
  );
}

async function authedOwnerCheck(id: string) {
  const githubToken = await getGitHubToken();
  if (!githubToken) {
    return {
      response: NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  const user = await fetchGitHubUser(githubToken);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  const topic = await getTopic(id);
  if (!topic) {
    return {
      response: NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      ),
    };
  }
  if (topic.createdBy.githubId !== user.id) {
    return {
      response: NextResponse.json(
        { error: 'Not the topic owner', code: TopicErrorCodes.NOT_OWNER },
        { status: 403 },
      ),
    };
  }
  return { topic };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await authedOwnerCheck(id);
    if ('response' in auth) return auth.response;

    const body = await request.json().catch(() => null);
    const trailId = validateAddTrailRequest(body);

    if (auth.topic.trailIds.includes(trailId)) {
      return NextResponse.json(
        {
          error: 'Trail already in this topic',
          code: TopicErrorCodes.TRAIL_ALREADY_ADDED,
        },
        { status: 409 },
      );
    }
    if (auth.topic.trailIds.length >= MAX_TRAILS_PER_TOPIC) {
      return NextResponse.json(
        {
          error: `Cap of ${MAX_TRAILS_PER_TOPIC} trails per topic reached`,
          code: TopicErrorCodes.TOO_MANY_TRAILS,
        },
        { status: 409 },
      );
    }

    const pointer = await getIdPointer(trailId);
    if (!pointer) {
      return NextResponse.json(
        {
          error: 'Trail not found',
          code: TopicErrorCodes.TRAIL_NOT_FOUND,
        },
        { status: 404 },
      );
    }

    const updated = await updateTopic(id, (current) => ({
      ...current,
      trailIds: [...current.trailIds, trailId],
    }));
    await upsertTopicInUserIndex(updated);

    // Auto-resolve any project suggestions on this topic that point at the
    // same repo. Best-effort — a failure here doesn't roll back the trail
    // add; the next match attempt will pick the suggestion up.
    try {
      await resolveProjectSuggestionsForRepo(id, {
        owner: pointer.owner,
        repo: pointer.repo,
      });
    } catch (err) {
      console.error('[Topics] resolve-on-match failed:', err);
    }

    return NextResponse.json({ topic: updated });
  } catch (error) {
    return errorResponse(error, 'add');
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await authedOwnerCheck(id);
    if ('response' in auth) return auth.response;

    const body = await request.json().catch(() => null);
    const nextOrder = validateReorderRequest(body);

    // Reorder must be a permutation of the existing list — adds/removes go
    // through POST/DELETE so each surface stays single-purpose.
    const current = auth.topic.trailIds;
    const sameSet =
      nextOrder.length === current.length &&
      nextOrder.every((tid) => current.includes(tid));
    if (!sameSet) {
      return NextResponse.json(
        {
          error: 'Reorder must contain the exact existing trail set',
          code: TopicErrorCodes.INVALID_PAYLOAD,
        },
        { status: 400 },
      );
    }

    const updated = await updateTopic(id, (cur) => ({
      ...cur,
      trailIds: nextOrder,
    }));
    await upsertTopicInUserIndex(updated);
    return NextResponse.json({ topic: updated });
  } catch (error) {
    return errorResponse(error, 'reorder');
  }
}
