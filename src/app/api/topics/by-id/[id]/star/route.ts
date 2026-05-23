/**
 * Topic star toggle — per-user starred-topics indirection.
 *
 * POST   stars a topic for the authenticated caller (idempotent, refreshes
 *        starredAt + snapshot on re-star).
 * DELETE unstars (idempotent — also a no-op when the topic itself is gone,
 *        since the goal is "not in my starred list").
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getTopic, topicToByUserEntry } from '@/lib/topics/s3-storage';
import {
  removeStarredTopic,
  upsertStarredTopic,
} from '@/lib/stars/s3-storage';
import {
  StarError,
  StarErrorCodes,
  StarWarningCodes,
  type StarredTopicEntry,
} from '@/lib/stars/types';

interface Params {
  params: Promise<{ id: string }>;
}

function errorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof StarError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error(`[Stars] Topic ${where} error:`, error);
  return NextResponse.json(
    { error: `Failed to ${where} starred topic` },
    { status: 500 },
  );
}

async function requireUser(): Promise<
  { kind: 'ok'; userId: number } | { kind: 'response'; response: NextResponse }
> {
  const token = await getGitHubToken();
  if (!token) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not authenticated', code: StarErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  const user = await fetchGitHubUser(token);
  if (!user) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not authenticated', code: StarErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  return { kind: 'ok', userId: user.id };
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireUser();
    if (guard.kind === 'response') return guard.response;

    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: StarErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    const entry: StarredTopicEntry = {
      topicId: id,
      starredAt: new Date().toISOString(),
      snapshot: topicToByUserEntry(topic),
    };
    const result = await upsertStarredTopic(guard.userId, entry);

    return NextResponse.json({
      entry: result.entry,
      ...(result.pruned
        ? { warnings: [StarWarningCodes.STAR_LIMIT_REACHED] }
        : {}),
    });
  } catch (error) {
    return errorResponse(error, 'POST');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireUser();
    if (guard.kind === 'response') return guard.response;

    // No 404 on a missing topic — unstar must work after the target is gone
    // (the goal is "not in my starred list"). Idempotent: removing an entry
    // that isn't there is a no-op inside the modifier.
    await removeStarredTopic(guard.userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 'DELETE');
  }
}
