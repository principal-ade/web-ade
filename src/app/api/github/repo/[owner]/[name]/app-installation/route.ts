/**
 * GET /api/github/repo/[owner]/[name]/app-installation
 *
 * Check if a GitHub App is installed on a repository.
 * Uses GitHub's native API to determine installation status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

interface InstallationResponse {
  id: number;
  account: {
    login: string;
    id: number;
    type: string;
  };
  repository_selection: string;
  access_tokens_url: string;
  repositories_url: string;
  html_url: string;
  app_id: number;
  app_slug: string;
  target_id: number;
  target_type: string;
  permissions: Record<string, string>;
  events: string[];
  created_at: string;
  updated_at: string;
  single_file_name: string | null;
  has_multiple_single_files: boolean;
  suspended_by: {
    login: string;
    id: number;
  } | null;
  suspended_at: string | null;
}

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

    // Check if a GitHub App is installed on this repository
    // https://docs.github.com/en/rest/apps/installations#get-a-repository-installation-for-the-authenticated-app
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/installation`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    // 404 means no app is installed on this repository
    if (response.status === 404) {
      return NextResponse.json({
        installed: false,
        reason: 'no_installation',
      });
    }

    // Other errors (401, 403, etc.)
    if (!response.ok) {
      console.error(
        `GitHub App installation check failed: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(
        {
          installed: false,
          reason: 'api_error',
          error: `GitHub API returned ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data: InstallationResponse = await response.json();

    // Check if the installation is suspended
    const isSuspended = data.suspended_at !== null;

    return NextResponse.json({
      installed: true,
      suspended: isSuspended,
      installationId: data.id,
      appSlug: data.app_slug,
      installedAt: new Date(data.created_at).getTime(),
      installedBy: data.account.login,
      events: data.events,
      permissions: data.permissions,
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
