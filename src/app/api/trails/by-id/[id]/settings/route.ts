/**
 * Trail-owner settings — flip host-private payload flags.
 *
 * PATCH /api/trails/by-id/{id}/settings
 *   Body: { allowAnonNotes?: boolean }
 *   Returns: { allowAnonNotes: boolean }
 *
 * Owner-only. Today this only flips `allowAnonNotes`, but the route
 * is shaped so future flags (e.g. `allowSignOffs`) slot in next to
 * it without a new endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { updatePayload } from '@/lib/trails/s3-storage';
import {
  resolveTrailForMutation,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import {
  ShareErrorCodes,
  TrailShareError,
  type StoredTrailPayload,
} from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user, entry } = resolved.ctx;

    if (user.id !== entry.createdBy.githubId) {
      return NextResponse.json(
        {
          error: 'Only the trail owner may change settings',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { allowAnonNotes?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      throw new TrailShareError(
        'Request body must be an object',
        400,
        ShareErrorCodes.INVALID_REQUEST
      );
    }

    const next: { allowAnonNotes?: boolean } = {};
    if (body.allowAnonNotes !== undefined) {
      if (typeof body.allowAnonNotes !== 'boolean') {
        throw new TrailShareError(
          'allowAnonNotes must be a boolean',
          400,
          ShareErrorCodes.INVALID_REQUEST
        );
      }
      next.allowAnonNotes = body.allowAnonNotes;
    }

    const updated = (await updatePayload(owner, repo, id, (payload) => {
      const stored = payload as StoredTrailPayload;
      const merged: StoredTrailPayload = { ...stored };
      if (next.allowAnonNotes !== undefined) {
        merged.allowAnonNotes = next.allowAnonNotes;
      }
      return merged;
    })) as StoredTrailPayload;

    return NextResponse.json({
      allowAnonNotes: updated.allowAnonNotes ?? false,
    });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to update trail settings');
  }
}
