/**
 * Trail sign-offs — create.
 *
 * POST /api/trails/{id}/sign-offs
 *   Body: TrailSignOffDraft (currently only `comment?` — author is
 *         server-supplied)
 *   Returns: TrailSignOff
 *
 * Multiple sign-offs per author are allowed at the schema level, but
 * the panel's LGTM gate hides the button once the current author has
 * already signed. The host enforces the same rule defensively here so
 * a stale client (or curl) can't double-sign.
 */

import { NextRequest, NextResponse } from 'next/server';
import { updatePayload } from '@/lib/trails/s3-storage';
import { validateSignOffDraft } from '@/lib/trails/validation';
import {
  resolveTrailForMutation,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import { ShareErrorCodes } from '@/lib/trails/types';
import type { TrailSignOff } from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user } = resolved.ctx;

    const body = await request.json().catch(() => ({}));
    const draft = validateSignOffDraft(body ?? {});

    const now = new Date().toISOString();
    const signOff: TrailSignOff = {
      id: crypto.randomUUID(),
      author: user.login,
      signedAt: now,
      ...(draft.comment !== undefined ? { comment: draft.comment } : {}),
    };

    let alreadySigned = false;

    await updatePayload(owner, repo, id, (payload) => {
      const existing = payload.signOffs ?? [];
      if (existing.some((s) => s.author === user.login)) {
        alreadySigned = true;
        return payload;
      }
      return {
        ...payload,
        signOffs: [...existing, signOff],
        updatedAt: now,
      };
    });

    if (alreadySigned) {
      return NextResponse.json(
        {
          error: 'You have already signed off this trail',
          code: ShareErrorCodes.INVALID_REQUEST,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ signOff }, { status: 201 });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to create sign-off');
  }
}
