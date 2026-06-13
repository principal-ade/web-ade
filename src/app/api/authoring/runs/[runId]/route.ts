/**
 * Stage 4 — `GET /api/authoring/runs/{runId}`: poll one run.
 *
 * Owned by its creator: a run the caller didn't create (or that doesn't exist)
 * returns 404 — we don't leak run existence across users. Returns the
 * client-facing `AuthoringRun` shape (record minus server-only fields).
 * Contract: `mobile-app/docs/AUTHORING_API.md`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { ShareErrorCodes } from '@/lib/trails/types';
import { getRunRecord } from '@/lib/authoring/run-store';
import { toClientRun } from '@/lib/authoring/run-types';

interface Params {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
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

  const { runId } = await params;
  const record = await getRunRecord(runId);
  if (!record || record.createdBy !== user.id) {
    return NextResponse.json(
      { error: 'Run not found', code: ShareErrorCodes.NOT_FOUND },
      { status: 404 }
    );
  }

  return NextResponse.json(toClientRun(record), { status: 200 });
}
