/**
 * Topic trail — DELETE removes a specific trail from the topic. Owner-gated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  getTopic,
  updateTopic,
  upsertTopicInUserIndex,
} from '@/lib/topics/s3-storage';
import { isUuid } from '@/lib/topics/validation';
import { TopicErrorCodes, TopicShareError } from '@/lib/topics/types';

interface Params {
  params: Promise<{ id: string; trailId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, trailId } = await params;
    if (!isUuid(trailId)) {
      return NextResponse.json(
        { error: 'Invalid trail id', code: TopicErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }

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

    const updated = await updateTopic(id, (cur) => ({
      ...cur,
      trailIds: cur.trailIds.filter((tid) => tid !== trailId),
    }));
    await upsertTopicInUserIndex(updated);
    return NextResponse.json({ topic: updated });
  } catch (error) {
    if (error instanceof TopicShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Topics] DELETE trail error:', error);
    return NextResponse.json(
      { error: 'Failed to remove trail' },
      { status: 500 },
    );
  }
}
