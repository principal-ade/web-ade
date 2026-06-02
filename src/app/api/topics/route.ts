/**
 * Topics API
 *
 * POST — create a new topic. Authenticated GitHub user becomes the owner.
 *
 * Topic ownership and storage parallel trails ([[../trails/route.ts]]) but
 * are not repo-scoped: a topic curates trails that may live in many repos,
 * so the topic record itself isn't gated by any single repo's read access.
 * Trails listed inside continue to enforce their own repo-access checks on
 * read (handled by `/api/trails/by-id/{id}`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getIdPointer } from '@/lib/trails/s3-storage';
import { putTopic, upsertTopicInUserIndex } from '@/lib/topics/s3-storage';
import { validateCreateRequest } from '@/lib/topics/validation';
import {
  TopicErrorCodes,
  TopicShareError,
  type CreateTopicResponse,
  type TopicPayload,
} from '@/lib/topics/types';

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TopicShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error('[Topics] POST error:', error);
  return NextResponse.json({ error: 'Failed to create topic' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json().catch(() => null);
    const { title, description, trailIds, status } = validateCreateRequest(body);

    // Confirm every trail id resolves before we mint the topic. Cheaper than
    // failing later on read, and prevents typos from sticking.
    for (const trailId of trailIds) {
      const pointer = await getIdPointer(trailId);
      if (!pointer) {
        return NextResponse.json(
          {
            error: `Trail not found: ${trailId}`,
            code: TopicErrorCodes.TRAIL_NOT_FOUND,
          },
          { status: 400 },
        );
      }
    }

    const now = new Date().toISOString();
    const topic: TopicPayload = {
      id: crypto.randomUUID(),
      title,
      description,
      trailIds,
      createdBy: { githubId: user.id, githubLogin: user.login },
      createdAt: now,
      updatedAt: now,
      ...(status !== undefined ? { status } : {}),
    };

    await putTopic(topic);
    await upsertTopicInUserIndex(topic);

    const response: CreateTopicResponse = {
      id: topic.id,
      url: `/topic/${topic.id}`,
      topic,
    };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
