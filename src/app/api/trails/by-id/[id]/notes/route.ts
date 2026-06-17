/**
 * Trail notes — create.
 *
 * POST /api/trails/{id}/notes
 *   Body: TrailNoteDraft
 *   Returns: TrailNote (with host-filled id/createdAt/updatedAt and
 *            authenticated author)
 */

import { NextRequest, NextResponse } from 'next/server';
import { updatePayload } from '@/lib/trails/s3-storage';
import { validateNoteDraft } from '@/lib/trails/validation';
import {
  resolveTrailForMutation,
  syncTrailNoteSummary,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import { notifyParticipantsOfNote } from '@/lib/trails/note-fanout';
import type { TrailNote } from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user } = resolved.ctx;

    const body = await request.json().catch(() => null);
    const draft = validateNoteDraft(body);

    const now = new Date().toISOString();
    const noteId = crypto.randomUUID();

    const note: TrailNote =
      draft.kind === 'markdown'
        ? {
            id: noteId,
            kind: 'markdown',
            scope: draft.scope,
            anchor: draft.anchor,
            body: draft.body,
            author: user.login,
            createdAt: now,
            updatedAt: now,
          }
        : draft.kind === 'marker'
          ? {
              id: noteId,
              kind: 'marker',
              scope: draft.scope,
              body: draft.body,
              author: user.login,
              createdAt: now,
              updatedAt: now,
            }
          : {
              id: noteId,
              kind: 'snippet',
              scope: draft.scope,
              anchor: draft.anchor,
              body: draft.body,
              author: user.login,
              createdAt: now,
              updatedAt: now,
            };

    await updatePayload(owner, repo, id, (payload) => ({
      ...payload,
      notes: [...(payload.notes ?? []), note],
      updatedAt: now,
    }));

    // Refresh the index entry's noteCount so recipients' inboxes re-badge.
    // Best-effort — the note is already persisted.
    await syncTrailNoteSummary(owner, repo, id).catch(() => undefined);

    // Notify the trail's participants (sender + recipients) of the new note,
    // skipping the author. Best-effort — runs after the count is synced.
    await notifyParticipantsOfNote(owner, repo, id, user.id).catch(
      () => undefined
    );

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to create note');
  }
}
