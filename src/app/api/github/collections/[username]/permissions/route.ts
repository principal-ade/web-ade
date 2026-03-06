/**
 * GET /api/github/collections/[username]/permissions
 *
 * Check if the authenticated user has write access to a user/org's principal-ai-collections repo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import type { CollectionsPermissionsResponse } from '@/types/api';
import { PUBLIC_REPO_NAME } from '@/lib/collections/github-repo-manager';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const token = await getGitHubToken();

    if (!token) {
      const response: CollectionsPermissionsResponse = {
        canEdit: false,
        reason: 'not_authenticated',
      };
      return NextResponse.json(response);
    }

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Check user's permission on the repo
    const response = await fetch(
      `https://api.github.com/repos/${username}/${PUBLIC_REPO_NAME}/collaborators/${await getAuthenticatedUsername(token)}/permission`,
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
          `https://api.github.com/repos/${username}/${PUBLIC_REPO_NAME}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (!repoCheck.ok) {
          const notFoundResponse: CollectionsPermissionsResponse = {
            canEdit: false,
            reason: 'repo_not_found',
          };
          return NextResponse.json(notFoundResponse);
        }

        const noAccessResponse: CollectionsPermissionsResponse = {
          canEdit: false,
          reason: 'no_access',
        };
        return NextResponse.json(noAccessResponse);
      }

      const errorResponse: CollectionsPermissionsResponse = {
        canEdit: false,
        reason: 'error',
      };
      return NextResponse.json(errorResponse);
    }

    const data = await response.json();
    const permission = data.permission as CollectionsPermissionsResponse['permission'];

    // 'admin' or 'write' permissions allow editing
    const canEdit = permission === 'admin' || permission === 'write';

    const successResponse: CollectionsPermissionsResponse = {
      canEdit,
      permission,
    };
    return NextResponse.json(successResponse);
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
