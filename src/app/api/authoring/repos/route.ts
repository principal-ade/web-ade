/**
 * `GET /api/authoring/repos` — repos the authoring picker should surface.
 *
 * Returns the curated (verified-good) set, the repos that have failed to import
 * (so the client can flag them in search results and warn before a repeat
 * attempt), and a server-controlled notice to show on an unsupported pick.
 *
 * Auth-gated like `POST /runs` for parity (the mobile client already sends the
 * token). The unsupported list only ever contains public repos (recording is
 * gated on visibility in the background job), so it's safe to serve globally.
 */
import { NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { ShareErrorCodes } from '@/lib/trails/types';
import {
  CURATED_AUTHORING_REPOS,
  UNSUPPORTED_NOTICE,
} from '@/lib/authoring/curated-repos';
import { getUnsupportedRepos } from '@/lib/authoring/unsupported-store';

export async function GET() {
  try {
    const token = await getGitHubToken();
    const user = token ? await fetchGitHubUser(token) : null;
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const unsupported = await getUnsupportedRepos();
    return NextResponse.json({
      curated: CURATED_AUTHORING_REPOS,
      unsupported,
      notice: UNSUPPORTED_NOTICE,
    });
  } catch (error) {
    console.error('[authoring] GET /repos failed', error);
    return NextResponse.json(
      { error: 'Internal error', code: ShareErrorCodes.S3_ERROR },
      { status: 500 }
    );
  }
}
