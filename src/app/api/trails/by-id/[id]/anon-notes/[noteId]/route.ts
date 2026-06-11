/**
 * Anonymous trail notes — owner-only moderation delete.
 *
 * DELETE /api/trails/by-id/{id}/anon-notes/{noteId}
 *   - Allowed for the trail owner only (entry.createdBy.githubId).
 *     There is no anon-author identity to authorize against, so the
 *     submitter cannot delete their own note. That trade-off is the
 *     price of skipping the signed-cookie anonAuthorId scheme.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveTrailForMutation,
  syncTrailNoteSummary,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import { deleteAnonNote } from '@/lib/trails/anon-notes-storage';
import { ShareErrorCodes } from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string; noteId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, noteId } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user, entry } = resolved.ctx;

    if (user.id !== entry.createdBy.githubId) {
      return NextResponse.json(
        {
          error: 'Only the trail owner may delete anonymous notes',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    const removed = await deleteAnonNote(id, noteId);
    if (!removed) {
      return NextResponse.json(
        { error: 'Note not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    // Anon note removed — recompute the index noteCount.
    await syncTrailNoteSummary(owner, repo, id).catch(() => undefined);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to delete anonymous note');
  }
}
