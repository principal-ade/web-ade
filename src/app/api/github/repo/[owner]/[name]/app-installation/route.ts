/**
 * GET /api/github/repo/[owner]/[name]/app-installation
 *
 * Check if a GitHub App is installed on a repository.
 * Uses GitHub's native API to determine installation status.
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
        installed: false,
        reason: 'not_authenticated',
      });
    }

    if (!owner || !name) {
      return NextResponse.json(
        { error: 'Owner and name are required' },
        { status: 400 }
      );
    }

    const repoFullName = `${owner}/${name}`;

    // List all GitHub App installations accessible to the user
    // https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token
    const installationsResponse = await fetch(
      'https://api.github.com/user/installations',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!installationsResponse.ok) {
      console.error(
        `GitHub installations check failed: ${installationsResponse.status} ${installationsResponse.statusText}`
      );
      return NextResponse.json(
        {
          installed: false,
          reason: 'api_error',
          error: `GitHub API returned ${installationsResponse.status}`,
        },
        { status: installationsResponse.status }
      );
    }

    const installationsData = await installationsResponse.json();
    const installations = installationsData.installations || [];

    // Check each installation to see if it has access to this repository
    for (const installation of installations) {
      // Get repositories for this installation
      // https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token
      const reposResponse = await fetch(
        `https://api.github.com/user/installations/${installation.id}/repositories`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!reposResponse.ok) {
        continue; // Skip this installation if we can't fetch repos
      }

      const reposData = await reposResponse.json();
      const repositories = reposData.repositories || [];

      // Check if this installation has access to our target repository
      const repoMatch = repositories.find(
        (repo: { full_name: string }) => repo.full_name === repoFullName
      );

      if (repoMatch) {
        // Found an installation with access to this repo
        const isSuspended = installation.suspended_at !== null;

        return NextResponse.json({
          installed: true,
          suspended: isSuspended,
          installationId: installation.id,
          appSlug: installation.app_slug,
          installedAt: new Date(installation.created_at).getTime(),
          installedBy: installation.account.login,
          events: installation.events,
          permissions: installation.permissions,
        });
      }
    }

    // No installation found with access to this repository
    return NextResponse.json({
      installed: false,
      reason: 'no_installation',
    });
  } catch (error) {
    console.error('GitHub App installation check error:', error);
    return NextResponse.json(
      {
        installed: false,
        reason: 'error',
        error: error instanceof Error ? error.message : 'Failed to check installation',
      },
      { status: 500 }
    );
  }
}
