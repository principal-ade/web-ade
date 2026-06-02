/**
 * Topic by id — GET (public), PATCH (owner), DELETE (owner).
 *
 * Read access is public-by-link, matching trail share semantics. Edits are
 * gated to the topic's `createdBy.githubId` — mirroring the "only the
 * publisher mutates" stance on `/api/trails/by-id/[id]`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  deleteTopic,
  getTopic,
  removeTopicFromUserIndex,
  topicToByUserEntry,
  updateTopic,
  upsertTopicInUserIndex,
} from '@/lib/topics/s3-storage';
import {
  isTopicStarred,
  refreshStarredTopicSnapshot,
} from '@/lib/stars/s3-storage';
import { deleteCommentsContainer } from '@/lib/topics/comments-storage';
import { deleteSuggestionsContainer } from '@/lib/topics/suggestions-storage';
import { validateUpdateRequest } from '@/lib/topics/validation';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicPayload,
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
  console.error(`[Topics] ${where} error:`, error);
  return NextResponse.json({ error: `Failed to ${where} topic` }, { status: 500 });
}

async function requireOwner(
  id: string,
): Promise<
  | { kind: 'ok'; topic: TopicPayload }
  | { kind: 'response'; response: NextResponse }
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
  const topic = await getTopic(id);
  if (!topic) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      ),
    };
  }
  if (topic.createdBy.githubId !== user.id) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'Not the topic owner', code: TopicErrorCodes.NOT_OWNER },
        { status: 403 },
      ),
    };
  }
  return { kind: 'ok', topic };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    // `starred` is per-user; anonymous callers (no token) always get false
    // and skip the per-user S3 read entirely. For authed callers, also
    // refresh the snapshot fire-and-forget if it's starred — this is the
    // "lazy on item open" half of the snapshot-freshness policy.
    let starred = false;
    const token = await getGitHubToken();
    if (token) {
      const user = await fetchGitHubUser(token);
      if (user) {
        starred = await isTopicStarred(user.id, id);
        if (starred) {
          void refreshStarredTopicSnapshot(
            user.id,
            id,
            topicToByUserEntry(topic),
          );
        }
      }
    }

    return NextResponse.json({ topic, starred });
  } catch (error) {
    return errorResponse(error, 'GET');
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireOwner(id);
    if (guard.kind === 'response') return guard.response;

    const body = await request.json().catch(() => null);
    const updates = validateUpdateRequest(body);

    const updated = await updateTopic(id, (current) => ({
      ...current,
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined
        ? { description: updates.description }
        : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
    }));
    await upsertTopicInUserIndex(updated);
    return NextResponse.json({ topic: updated });
  } catch (error) {
    return errorResponse(error, 'PATCH');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireOwner(id);
    if (guard.kind === 'response') return guard.response;

    await deleteTopic(id);
    await removeTopicFromUserIndex(guard.topic.createdBy.githubId, id);
    // Best-effort: a missing container is a no-op; a failure here logs but
    // shouldn't fail the topic-delete the user just performed.
    try {
      await deleteCommentsContainer(id);
    } catch (commentsError) {
      console.error('[Topics] Tear down comments container failed:', {
        id,
        error:
          commentsError instanceof Error
            ? commentsError.message
            : String(commentsError),
      });
    }
    try {
      await deleteSuggestionsContainer(id);
    } catch (suggestionsError) {
      console.error('[Topics] Tear down suggestions container failed:', {
        id,
        error:
          suggestionsError instanceof Error
            ? suggestionsError.message
            : String(suggestionsError),
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 'DELETE');
  }
}
