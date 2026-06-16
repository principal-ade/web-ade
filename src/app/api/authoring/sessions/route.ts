/**
 * `POST /api/authoring/sessions` — start preparing an authoring session.
 *
 * Phase 1 of the two-phase ask flow: the substrate is prepared BEFORE the user
 * asks anything, so the client can show "Initializing" (Freestyle Git import) →
 * "Preparing" (VM boot + clone) → "Ready", and gate the question field on a
 * successful import. The question is submitted later via
 * `POST /sessions/{id}/ask`.
 *
 * Authors-as-the-user (the topic's resolved auth decision): the caller's GitHub
 * token gates repo read-access and imports the repo; it stays in the trusted
 * server layer and never reaches the sandbox.
 *
 * Returns 202 immediately with a session id; the actual prepare runs
 * fire-and-forget in the background. The client polls `GET /sessions/{id}`.
 * Contract: `mobile-app/docs/AUTHORING_API.md`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { ShareErrorCodes, TrailShareError } from '@/lib/trails/types';
import { putSession } from '@/lib/authoring/session-store';
import { runPrepareJob } from '@/lib/authoring/session-job';
import {
  toClientSession,
  type AuthoringSessionRecord,
} from '@/lib/authoring/session-types';

export async function POST(request: NextRequest) {
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
    const owner = typeof b.owner === 'string' ? b.owner : '';
    const repo = typeof b.repo === 'string' ? b.repo : '';
    const ref = typeof b.ref === 'string' && b.ref ? b.ref : undefined;
    const model = typeof b.model === 'string' && b.model ? b.model : undefined;

    // Throws TrailShareError(400, INVALID_OWNER_REPO) on a malformed pair.
    validateOwnerRepo(owner, repo);

    const access = await checkRepoAccess(owner, repo, token);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const sessionId = `sess_${randomUUID()}`;
    const record: AuthoringSessionRecord = {
      sessionId,
      status: 'queued',
      createdBy: user.id,
      owner,
      repo,
      ...(ref ? { ref } : {}),
      ...(model ? { model } : {}),
      question: null,
      vmId: null,
      repoId: null,
      identityId: null,
      sha: null,
      trailId: null,
      trailUrl: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await putSession(record);

    // Fire-and-forget the prepare (import → VM boot → clone). The Node server
    // keeps the promise alive after we respond; the client polls for `ready`.
    void runPrepareJob({
      sessionId,
      token,
      owner,
      repo,
      ref,
      isPublic: !access.private,
    }).catch((e) => console.error('[authoring] prepare job crashed', sessionId, e));

    return NextResponse.json(toClientSession(record), { status: 202 });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[authoring] POST /sessions failed', error);
    return NextResponse.json(
      { error: 'Internal error', code: ShareErrorCodes.S3_ERROR },
      { status: 500 }
    );
  }
}
