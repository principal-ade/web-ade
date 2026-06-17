/**
 * Anonymous trail notes — create.
 *
 * POST /api/trails/by-id/{id}/anon-notes
 *   Body: TrailNoteDraft (subject to anon char allowlist + 2KB cap)
 *   Returns: TrailNote (with host-filled id/createdAt/updatedAt and
 *            author: "Anonymous")
 *
 * No auth gate — that's the point. Three layered guards instead:
 *   1. The trail's owner must have opted in (`allowAnonNotes: true`).
 *   2. IP+trail rate-limit (see `anon-rate-limit.ts` — best-effort).
 *   3. Body validation: char allowlist + 2KB cap (see
 *      `validateAnonNoteDraft`).
 *
 * Anon notes are write-once. There is no PATCH route. The trail
 * owner moderates via `DELETE /anon-notes/{noteId}`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getIdPointer,
  getPayload,
} from '@/lib/trails/s3-storage';
import {
  appendAnonNote,
  newAnonNoteId,
} from '@/lib/trails/anon-notes-storage';
import {
  validateAnonNoteDraft,
  validateOwnerRepo,
} from '@/lib/trails/validation';
import {
  syncTrailNoteSummary,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import { notifyParticipantsOfNote } from '@/lib/trails/note-fanout';
import {
  getClientIp,
  recordAndCheck,
} from '@/lib/trails/anon-rate-limit';
import {
  ShareErrorCodes,
  type StoredTrailPayload,
  type TrailNote,
} from '@/lib/trails/types';

const ANON_AUTHOR = 'Anonymous';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid trail id', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }

    const pointer = await getIdPointer(id);
    if (!pointer) {
      return NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    const { owner, repo } = pointer;
    validateOwnerRepo(owner, repo);

    const payload = (await getPayload(owner, repo, id)) as
      | StoredTrailPayload
      | null;
    if (!payload) {
      return NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    if (!payload.allowAnonNotes) {
      return NextResponse.json(
        {
          error: 'Anonymous notes are not enabled for this trail',
          code: ShareErrorCodes.ANON_NOTES_DISABLED,
        },
        { status: 403 }
      );
    }

    const ip = getClientIp(request);
    if (!recordAndCheck(ip, id)) {
      return NextResponse.json(
        {
          error: 'Too many submissions — please try again later',
          code: ShareErrorCodes.RATE_LIMITED,
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const draft = validateAnonNoteDraft(body);

    const now = new Date().toISOString();
    const noteId = newAnonNoteId();

    const note: TrailNote =
      draft.kind === 'markdown'
        ? {
            id: noteId,
            kind: 'markdown',
            scope: draft.scope,
            anchor: draft.anchor,
            body: draft.body,
            author: ANON_AUTHOR,
            createdAt: now,
            updatedAt: now,
          }
        : draft.kind === 'marker'
          ? {
              id: noteId,
              kind: 'marker',
              scope: draft.scope,
              body: draft.body,
              author: ANON_AUTHOR,
              createdAt: now,
              updatedAt: now,
            }
          : {
              id: noteId,
              kind: 'snippet',
              scope: draft.scope,
              anchor: draft.anchor,
              body: draft.body,
              author: ANON_AUTHOR,
              createdAt: now,
              updatedAt: now,
            };

    await appendAnonNote(id, note);

    // Anon notes count toward the recipient's badge — refresh the index.
    await syncTrailNoteSummary(owner, repo, id).catch(() => undefined);

    // Notify the trail's participants of the new note. Anonymous notes have no
    // author to exclude. Best-effort — runs after the count is synced.
    await notifyParticipantsOfNote(owner, repo, id, null).catch(
      () => undefined
    );

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to create anonymous note');
  }
}
