/**
 * GET /api/github/repo/[owner]/[name]/permissions
 *
 * Check if the authenticated user has admin access to a repository.
 * Used for determining if the user can install GitHub Apps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json({
        isAdmin: false,
        permission: null,
        reason: 'not_authenticated',
      });
    }

    if (!owner || !name) {
      return NextResponse.json(
        { error: 'Owner and name are required' },
        { status: 400 }
      );
    }

    // Get authenticated user's login
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({
        isAdmin: false,
        permission: null,
        reason: 'auth_failed',
      });
    }

    const user = await userResponse.json();
    const username = user.login;

    // Check user's permission on the repo
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/collaborators/${username}/permission`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      // If 404, user doesn't have access or repo doesn't exist
      if (response.status === 404) {
        return NextResponse.json({
          isAdmin: false,
          permission: null,
          reason: 'no_access',
        });
      }

      return NextResponse.json({
        isAdmin: false,
        permission: null,
        reason: 'error',
      });
    }

    const data = await response.json();
    const permission = data.permission;

    // Only 'admin' permission allows installing GitHub Apps
    const isAdmin = permission === 'admin';

    return NextResponse.json({
      isAdmin,
      permission,
    });
  } catch (error) {
    console.error('GitHub permissions check error:', error);
    return NextResponse.json(
      { error: 'Failed to check permissions' },
      { status: 500 }
    );
  }
}
