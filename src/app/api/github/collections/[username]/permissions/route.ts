/**
 * GET /api/github/collections/[username]/permissions
 *
 * Check if the authenticated user has write access to a user/org's web-ade-collections repo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

const REPO_NAME = 'web-ade-collections';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json({
        canEdit: false,
        reason: 'not_authenticated',
      });
    }

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Check user's permission on the repo
    const response = await fetch(
      `https://api.github.com/repos/${username}/${REPO_NAME}/collaborators/${await getAuthenticatedUsername(token)}/permission`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      // If 404, repo doesn't exist or user doesn't have access to check
      if (response.status === 404) {
        // Check if the repo exists at all
        const repoCheck = await fetch(
          `https://api.github.com/repos/${username}/${REPO_NAME}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (!repoCheck.ok) {
          return NextResponse.json({
            canEdit: false,
            reason: 'repo_not_found',
          });
        }

        return NextResponse.json({
          canEdit: false,
          reason: 'no_access',
        });
      }

      return NextResponse.json({
        canEdit: false,
        reason: 'error',
      });
    }

    const data = await response.json();
    const permission = data.permission;

    // 'admin' or 'write' permissions allow editing
    const canEdit = permission === 'admin' || permission === 'write';

    return NextResponse.json({
      canEdit,
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

async function getAuthenticatedUsername(token: string): Promise<string> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get authenticated user');
  }

  const user = await response.json();
  return user.login;
}
