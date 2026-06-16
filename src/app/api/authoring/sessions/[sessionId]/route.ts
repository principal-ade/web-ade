/**
 * `GET /api/authoring/sessions/{sessionId}` — poll one session.
 *
 * Owned by its creator: a session the caller didn't create (or that doesn't
 * exist) returns 404 — we don't leak session existence across users. Returns
 * the client-facing `AuthoringSession` shape (record minus server-only fields).
 * The client polls this through importing → preparing → ready, then again
 * through authoring → succeeded|failed after it asks.
 * Contract: `mobile-app/docs/AUTHORING_API.md`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { ShareErrorCodes } from '@/lib/trails/types';
import { getSessionRecord } from '@/lib/authoring/session-store';
import { toClientSession } from '@/lib/authoring/session-types';

interface Params {
  params: Promise<{ sessionId: string }>;
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

  const { sessionId } = await params;
  const record = await getSessionRecord(sessionId);
  if (!record || record.createdBy !== user.id) {
    return NextResponse.json(
      { error: 'Session not found', code: ShareErrorCodes.NOT_FOUND },
      { status: 404 }
    );
  }

  return NextResponse.json(toClientSession(record), { status: 200 });
}
