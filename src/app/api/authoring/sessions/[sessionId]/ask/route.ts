/**
 * `POST /api/authoring/sessions/{sessionId}/ask` — submit the question.
 *
 * Phase 2 of the two-phase ask flow. Only valid once the session is `ready`
 * (VM booted, repo cloned); the question drives opencode in the already-prepared
 * VM, the trail is published as the user and self-delivered to their inbox, and
 * the VM is torn down. Returns 202 with the session now `authoring`; the client
 * polls `GET /sessions/{id}` to authoring → succeeded|failed.
 *
 * Owner-gated like the GET (404 for unknown / not-yours). A non-`ready` session
 * is a 409 — the client shouldn't reach this before the prepare poll says ready.
 * Contract: `mobile-app/docs/AUTHORING_API.md`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { ShareErrorCodes } from '@/lib/trails/types';
import { getSessionRecord, patchSession } from '@/lib/authoring/session-store';
import { runAskJob } from '@/lib/authoring/session-job';
import { toClientSession } from '@/lib/authoring/session-types';

interface Params {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const token = await getGitHubToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }
    const user = await fetchGitHubUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const { sessionId } = await params;
    const record = await getSessionRecord(sessionId);
    if (!record || record.createdBy !== user.id) {
      return NextResponse.json(
        { error: 'Session not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const question = typeof b.question === 'string' ? b.question.trim() : '';
    if (!question) {
      return NextResponse.json(
        { error: 'question is required', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }

    // The VM is only waiting in `ready`. Anything else (still preparing, already
    // authoring, terminal, or reaped) can't accept a question.
    if (record.status !== 'ready') {
      return NextResponse.json(
        {
          error: `Session is not ready (status: ${record.status})`,
          code: ShareErrorCodes.INVALID_REQUEST,
        },
        { status: 409 }
      );
    }

    const updated = await patchSession(sessionId, {
      status: 'authoring',
      question,
    });

    // Fire-and-forget the ask (opencode → publish → inbox → teardown).
    void runAskJob({
      sessionId,
      token,
      requester: { id: user.id, login: user.login },
    }).catch((e) => console.error('[authoring] ask job crashed', sessionId, e));

    return NextResponse.json(toClientSession(updated ?? record), { status: 202 });
  } catch (error) {
    console.error('[authoring] POST /sessions/{id}/ask failed', error);
    return NextResponse.json(
      { error: 'Internal error', code: ShareErrorCodes.S3_ERROR },
      { status: 500 }
    );
  }
}
