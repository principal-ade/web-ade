/**
 * Trail sign-offs — delete.
 *
 * DELETE /api/trails/{id}/sign-offs/{signOffId}
 *   - Allowed for the original signer OR the trail owner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { updatePayload } from '@/lib/trails/s3-storage';
import {
  canModerate,
  resolveTrailForMutation,
  trailErrorResponse,
} from '@/lib/trails/route-helpers';
import { ShareErrorCodes } from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string; signOffId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, signOffId } = await params;
    const resolved = await resolveTrailForMutation(id);
    if (!resolved.ok) return resolved.response;
    const { owner, repo, user, entry } = resolved.ctx;

    let forbidden = false;
    let notFound = false;

    await updatePayload(owner, repo, id, (payload) => {
      const signOffs = payload.signOffs ?? [];
      const target = signOffs.find((s) => s.id === signOffId);
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
        signOffs: signOffs.filter((s) => s.id !== signOffId),
        updatedAt: new Date().toISOString(),
      };
    });

    if (notFound) {
      return NextResponse.json(
        { error: 'Sign-off not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }
    if (forbidden) {
      return NextResponse.json(
        {
          error: 'Only the signer or trail owner may remove this sign-off',
          code: ShareErrorCodes.NOT_OWNER,
        },
        { status: 403 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return trailErrorResponse(error, 'Failed to delete sign-off');
  }
}
