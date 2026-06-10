/**
 * Topic trail suggestions — GET (list) + POST (authenticated suggest).
 *
 * Read and write follow the topic's visibility: on a public topic any
 * GitHub-authenticated user can suggest any resolvable trail; on a private
 * topic the suggestion queue is visible and writable only to the creator and
 * recipients (same {@link canReadTopic} gate as the topic record). The topic
 * owner is not in the loop for the suggest action here; accept/reject lives on
 * the sibling [suggestionId] routes. See docs/topic-trail-suggestions.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { getTopic } from '@/lib/topics/s3-storage';
import { canReadTopic } from '@/lib/topics/access';
import {
  appendProjectSuggestion,
  appendSuggestion,
  listSuggestions,
} from '@/lib/topics/suggestions-storage';
import { getIdPointer } from '@/lib/trails/s3-storage';
import { validateSuggestRequest } from '@/lib/topics/validation';
import {
  TopicErrorCodes,
  TopicShareError,
  type SuggestionStatus,
} from '@/lib/topics/types';

interface Params {
  params: Promise<{ id: string }>;
}

const STATUS_VALUES: ReadonlySet<SuggestionStatus> = new Set([
  'pending',
  'accepted',
  'rejected',
  'withdrawn',
  'resolved',
]);

function errorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof TopicShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error(`[TopicSuggestions] ${where} error:`, error);
  return NextResponse.json(
    { error: `Failed to ${where} suggestion` },
    { status: 500 },
  );
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    // Confirm the topic exists so an unknown id returns 404 rather than an
    // empty list — empty-on-missing would mask typos in the URL.
    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    // Private topics expose their suggestion queue only to creator +
    // recipients. Deny → 404, matching the topic record's gate.
    const token = await getGitHubToken();
    const user = token ? await fetchGitHubUser(token) : null;
    if (!(await canReadTopic(topic, user?.id ?? null))) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    const container = await listSuggestions(id);
    const statusParam = request.nextUrl.searchParams.get('status');
    let suggestions = container.suggestions;
    if (statusParam) {
      if (!STATUS_VALUES.has(statusParam as SuggestionStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status filter: ${statusParam}`,
            code: TopicErrorCodes.INVALID_REQUEST,
          },
          { status: 400 },
        );
      }
      suggestions = suggestions.filter((s) => s.status === statusParam);
    }

    return NextResponse.json({
      topicId: container.topicId,
      updatedAt: container.updatedAt,
      suggestions,
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

    // A user who can't read a private topic can't suggest to it.
    if (!(await canReadTopic(topic, user.id))) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => null);
    const validated = validateSuggestRequest(body);
    const suggestedBy = { githubId: user.id, githubLogin: user.login };

    if (validated.kind === 'project') {
      const suggestion = await appendProjectSuggestion(id, {
        owner: validated.owner,
        repo: validated.repo,
        ...(validated.githubRepoId !== undefined
          ? { githubRepoId: validated.githubRepoId }
          : {}),
        ...(validated.reason !== undefined ? { reason: validated.reason } : {}),
        suggestedBy,
      });
      return NextResponse.json({ suggestion }, { status: 201 });
    }

    const { trailId, reason } = validated;

    // Suggesting a trail already on the topic is meaningless — surface the
    // same code the owner-add path uses so the UI can reuse the message.
    if (topic.trailIds.includes(trailId)) {
      return NextResponse.json(
        {
          error: 'Trail already in this topic',
          code: TopicErrorCodes.TRAIL_ALREADY_ADDED,
        },
        { status: 409 },
      );
    }

    const pointer = await getIdPointer(trailId);
    if (!pointer) {
      return NextResponse.json(
        { error: 'Trail not found', code: TopicErrorCodes.TRAIL_NOT_FOUND },
        { status: 404 },
      );
    }

    const suggestion = await appendSuggestion(id, {
      trailId,
      ...(reason !== undefined ? { reason } : {}),
      suggestedBy,
    });

    return NextResponse.json({ suggestion }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'create');
  }
}
