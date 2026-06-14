/**
 * Stage 4 — `POST /api/authoring/runs`: start an async authoring run.
 *
 * Authors-as-the-user (the topic's resolved auth decision): the caller's
 * GitHub token gates repo read-access, checks out the repo, and publishes — so
 * `createdBy` is the user and private repos work iff they can read them. The
 * token stays in the trusted server layer; it never reaches the sandbox.
 *
 * Returns 202 immediately with a run id; the actual VM authoring runs
 * fire-and-forget in the background (Node server keeps the promise alive after
 * the response). The client polls `GET /runs/{id}` and/or waits for the inbox.
 * Contract: `mobile-app/docs/AUTHORING_API.md`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { checkRepoAccess } from '@/lib/trails/github-access';
import { validateOwnerRepo } from '@/lib/trails/validation';
import { ShareErrorCodes, TrailShareError } from '@/lib/trails/types';
import { putRun } from '@/lib/authoring/run-store';
import { runAuthoringJob } from '@/lib/authoring/run-job';
import type { AuthoringRunRecord } from '@/lib/authoring/run-types';

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
    const question = typeof b.question === 'string' ? b.question.trim() : '';
    const ref = typeof b.ref === 'string' && b.ref ? b.ref : undefined;
    const model = typeof b.model === 'string' && b.model ? b.model : undefined;

    if (!question) {
      return NextResponse.json(
        { error: 'question is required', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }
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
    const runId = `run_${randomUUID()}`;
    const record: AuthoringRunRecord = {
      runId,
      status: 'queued',
      createdBy: user.id,
      owner,
      repo,
      ...(ref ? { ref } : {}),
      question,
      ...(model ? { model } : {}),
      trailId: null,
      trailUrl: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await putRun(record);

    // Fire-and-forget. Authoring is slow (VM boot + agent exploration); the
    // Node server keeps this promise alive after we respond. NOTE: a server
    // restart mid-run orphans the run in 'running' — acceptable for v1; a
    // reaper/TTL is a follow-up (cold-create means no VM leaks regardless,
    // since runInFreestyle deletes its VM in a finally).
    void runAuthoringJob({
      runId,
      token,
      owner,
      repo,
      ref,
      question,
      model,
      isPublic: !access.private,
      requester: { id: user.id, login: user.login },
    }).catch((e) => console.error('[authoring] job crashed', runId, e));

    return NextResponse.json(
      {
        runId,
        status: 'queued',
        owner,
        repo,
        ...(ref ? { ref } : {}),
        question,
        createdAt: now,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[authoring] POST /runs failed', error);
    return NextResponse.json(
      { error: 'Internal error', code: ShareErrorCodes.S3_ERROR },
      { status: 500 }
    );
  }
}
