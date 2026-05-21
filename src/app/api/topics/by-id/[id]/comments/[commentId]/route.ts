/**
 * Single topic comment — PATCH (edit) and DELETE.
 *
 * Authorization is asymmetric: edits are author-only, but deletes are
 * available to either the author or the topic owner (the curator's
 * moderation hook). Storage enforces the comment-author match under the
 * ETag lock; the route resolves the caller and loads the topic record so
 * it can pass `allowAsTopicOwner` into the DELETE path only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  deleteComment,
  updateComment,
} from '@/lib/topics/comments-storage';
import { getTopic } from '@/lib/topics/s3-storage';
import { validateUpdateCommentRequest } from '@/lib/topics/validation';
import { TopicErrorCodes, TopicShareError } from '@/lib/topics/types';

interface Params {
  params: Promise<{ id: string; commentId: string }>;
}

function errorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof TopicShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error(`[TopicComments] ${where} error:`, error);
  return NextResponse.json(
    { error: `Failed to ${where} comment` },
    { status: 500 },
  );
}

async function authedActor(topicId: string): Promise<
  | { kind: 'response'; response: NextResponse }
  | {
      kind: 'ok';
      actorGithubId: number;
      allowAsTopicOwner: boolean;
    }
> {
  const githubToken = await getGitHubToken();
  if (!githubToken) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  const user = await fetchGitHubUser(githubToken);
  if (!user) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      ),
    };
  }
  const topic = await getTopic(topicId);
  if (!topic) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      ),
    };
  }
  return {
    kind: 'ok',
    actorGithubId: user.id,
    allowAsTopicOwner: topic.createdBy.githubId === user.id,
  };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, commentId } = await params;
    const actor = await authedActor(id);
    if (actor.kind === 'response') return actor.response;

    const body = await request.json().catch(() => null);
    const { body: nextBody } = validateUpdateCommentRequest(body);

    const updated = await updateComment(id, commentId, {
      body: nextBody,
      actorGithubId: actor.actorGithubId,
    });
    return NextResponse.json({ comment: updated });
  } catch (error) {
    return errorResponse(error, 'update');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, commentId } = await params;
    const actor = await authedActor(id);
    if (actor.kind === 'response') return actor.response;

    await deleteComment(id, commentId, {
      actorGithubId: actor.actorGithubId,
      allowAsTopicOwner: actor.allowAsTopicOwner,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 'delete');
  }
}
