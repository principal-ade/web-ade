/**
 * Topic comments — GET (public list) + POST (authenticated append).
 *
 * Read is public-by-link, mirroring the topic record itself: anyone with the
 * topic URL can read the thread. Write requires a resolvable GitHub identity
 * via the same `fetchGitHubUser` + `getGitHubToken` path that gates topic
 * creation; there is no repo-membership requirement because comments belong
 * to the topic, not to any embedded trail's repo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  appendComment,
  listComments,
} from '@/lib/topics/comments-storage';
import { getTopic } from '@/lib/topics/s3-storage';
import { validateCreateCommentRequest } from '@/lib/topics/validation';
import { TopicErrorCodes, TopicShareError } from '@/lib/topics/types';

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
  console.error(`[TopicComments] ${where} error:`, error);
  return NextResponse.json(
    { error: `Failed to ${where} comment` },
    { status: 500 },
  );
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    // Confirm the topic exists so an unknown id returns 404 rather than an
    // empty thread — empty-on-missing would mask typos in the URL.
    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }
    const container = await listComments(id);
    return NextResponse.json({
      topicId: container.topicId,
      updatedAt: container.updatedAt,
      comments: container.comments,
    });
  } catch (error) {
    return errorResponse(error, 'list');
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

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

    const body = await request.json().catch(() => null);
    const { body: commentBody } = validateCreateCommentRequest(body);

    const comment = await appendComment(id, {
      body: commentBody,
      author: { githubId: user.id, githubLogin: user.login },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'append');
  }
}
