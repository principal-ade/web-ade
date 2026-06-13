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
  isTopicBookmarked,
  refreshBookmarkedTopicSnapshot,
} from '@/lib/bookmarks/s3-storage';
import { canReadTopic } from '@/lib/topics/access';
import { deleteCommentsContainer } from '@/lib/topics/comments-storage';
import { deleteSuggestionsContainer } from '@/lib/topics/suggestions-storage';
import { validateUpdateRequest } from '@/lib/topics/validation';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicPayload,
} from '@/lib/topics/types';
import {
  markdownResponse,
  negotiateFormat,
  topicCliHint,
  topicMarkdown,
  topicNotFoundOrPrivateMarkdown,
  type AgentFormat,
  type TopicLinks,
} from '@/lib/trails/agent-markdown';

interface Params {
  params: Promise<{ id: string }>;
}

/** Absolute origin from forwarded proxy headers, for self-describing links. */
function resolveOrigin(request: NextRequest): string {
  const h = request.headers;
  const host =
    h.get('x-forwarded-host') || h.get('host') || request.nextUrl.host;
  const proto =
    h.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/**
 * Self-describing affordances for non-browser callers, mirroring the trail
 * by-id route. The `/topic/{id}` page is client-hydrated, so an agent handed
 * the bare share link follows the <noscript> pointer here; `_links` lets it
 * traverse to the resolved trails, comments, and suggestions without knowing
 * the URL scheme, and `_hints` describes the payload shape.
 */
function topicEnvelope(origin: string, id: string) {
  const safeId = encodeURIComponent(id);
  const base = `${origin}/api/topics/by-id/${safeId}`;
  return {
    _links: {
      self: base,
      trails: `${base}/trails`,
      comments: `${base}/comments`,
      suggestions: `${base}/suggestions`,
      humanView: `${origin}/topic/${safeId}`,
    } satisfies TopicLinks,
    _hints:
      'Principal topic, returned as JSON. A topic is a curated bundle of trails on one subject; `topic.trailIds` is an ordered list of trail ids — fetch each at `/api/trails/by-id/<trailId>`. `topic.description` is the Markdown working brief. Follow `_links` for the resolved trail summaries (`trails`), the comment thread, the suggestion queue, and the human-viewable page. Private topics resolve only for their creator and recipients; every other caller gets a 404 that does not disclose the topic exists.',
  };
}

/**
 * Not-found / private response. A private topic is hidden behind a 404 (never
 * a 403) so its existence isn't disclosed, so this single helper answers both
 * the genuine miss and the private-gate miss identically. Markdown callers get
 * a CLI-aware notice; JSON keeps its `error`/`code` shape plus additive
 * `cli`/`cliHint` fields.
 */
function notFoundOrPrivateResponse(format: AgentFormat, links: TopicLinks) {
  if (format === 'md') {
    return markdownResponse(
      topicNotFoundOrPrivateMarkdown(links.humanView),
      404,
    );
  }
  return NextResponse.json(
    { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND, ...topicCliHint() },
    { status: 404 },
  );
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

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // Markdown for non-browser callers (the `/topic/{id}` middleware sets the
    // `x-agent-format` header when it rewrites here); default stays JSON. `env`
    // carries the absolute `_links` reused by both the JSON envelope and the
    // Markdown body.
    const format = negotiateFormat(request);
    const origin = resolveOrigin(request);
    const env = topicEnvelope(origin, id);

    const topic = await getTopic(id);
    if (!topic) {
      return notFoundOrPrivateResponse(format, env._links);
    }

    // Resolve the caller's identity once. Optional for public topics
    // (anonymous reads allowed), required to clear the private gate below.
    const token = await getGitHubToken();
    const user = token ? await fetchGitHubUser(token) : null;

    // Private gate: readable only by creator or recipient. Anyone else —
    // including anonymous callers — gets a 404 rather than a 403, so a private
    // topic's existence isn't disclosed.
    if (!(await canReadTopic(topic, user?.id ?? null))) {
      return notFoundOrPrivateResponse(format, env._links);
    }

    if (format === 'md') {
      const trails = topic.trailIds.map((tid) => {
        const safeTid = encodeURIComponent(tid);
        return {
          id: tid,
          humanView: `${origin}/trail/${safeTid}`,
          json: `${origin}/api/trails/by-id/${safeTid}`,
        };
      });
      return markdownResponse(topicMarkdown({ topic, links: env._links, trails }));
    }

    // Access granted. `bookmarked` is per-user; anonymous callers always get
    // false. For authed callers, also refresh the snapshot fire-and-forget if
    // it's bookmarked — the "lazy on item open" half of the snapshot-freshness
    // policy.
    let bookmarked = false;
    if (user) {
      bookmarked = await isTopicBookmarked(user.id, id);
      if (bookmarked) {
        void refreshBookmarkedTopicSnapshot(
          user.id,
          id,
          topicToByUserEntry(topic),
        );
      }
    }

    return NextResponse.json({ topic, bookmarked, ...env });
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
      ...(updates.visibility !== undefined
        ? { visibility: updates.visibility }
        : {}),
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
