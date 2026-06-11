/**
 * Trail notes — edit + delete.
 *
 * PATCH  /api/trails/{id}/notes/{noteId}    Body: { body: string }
 *   - Author-only (no moderator override; owners may delete + the user
 *     re-creates if rewording is needed).
 *
 * DELETE /api/trails/{id}/notes/{noteId}
 *   - Allowed for the original author OR the trail owner
 *     (entry.createdBy.githubId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { updatePayload } from '@/lib/trails/s3-storage';
import { validateNoteBodyUpdate } from '@/lib/trails/validation';
import {
  canModerate,
  resolveTrailForMutation,
  syncTrailNoteSummary,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import { ShareErrorCodes } from '@/lib/trails/types';
import type { TrailNote } from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string; noteId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, noteId } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user } = resolved.ctx;

    const body = await request.json().catch(() => null);
    const { body: newBody } = validateNoteBodyUpdate(body);

    let updatedNote: TrailNote | null = null;
    let forbidden = false;
    let notFound = false;

    await updatePayload(owner, repo, id, (payload) => {
      const notes = payload.notes ?? [];
      const idx = notes.findIndex((n) => n.id === noteId);
      if (idx < 0) {
        notFound = true;
        return payload;
      }
      const existing = notes[idx]!;
      if (existing.author !== user.login) {
        forbidden = true;
        return payload;
      }
      const updatedAt = new Date().toISOString();
      const next: TrailNote =
        existing.kind === 'markdown'
          ? { ...existing, body: newBody, updatedAt }
          : { ...existing, body: newBody, updatedAt };
      updatedNote = next;
      const nextNotes = [...notes];
      nextNotes[idx] = next;
      return { ...payload, notes: nextNotes, updatedAt: next.updatedAt };
    });

    if (notFound) {
      return NextResponse.json(
        { error: 'Note not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }
    if (forbidden) {
      return NextResponse.json(
        {
          error: 'Only the author may edit this note',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ note: updatedNote });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to update note');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, noteId } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user, entry } = resolved.ctx;

    let forbidden = false;
    let notFound = false;

    await updatePayload(owner, repo, id, (payload) => {
      const notes = payload.notes ?? [];
      const target = notes.find((n) => n.id === noteId);
      if (!target) {
        notFound = true;
        return payload;
      }
      if (!canModerate(user, entry, target.author)) {
        forbidden = true;
        return payload;
      }
      return {
        ...payload,
        notes: notes.filter((n) => n.id !== noteId),
        updatedAt: new Date().toISOString(),
      };
    });

    if (notFound) {
      return NextResponse.json(
        { error: 'Note not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }
    if (forbidden) {
      return NextResponse.json(
        {
          error: 'Only the author or trail owner may delete this note',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    // Note removed — recompute the index noteCount so the badge clears.
    await syncTrailNoteSummary(owner, repo, id).catch(() => undefined);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to delete note');
  }
}
