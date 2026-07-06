/**
 * GET /api/github/user/[username]/starred
 *
 * Returns public starred repositories for a given GitHub user.
 * Public endpoint — uses the server's GITHUB_TOKEN as fallback when
 * the viewer is unauthenticated, so rate-limits don't bite.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubApiToken } from '@/lib/auth/cookies';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  private: boolean;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  try {
    const token = await getGitHubApiToken();

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'WebADE/1.0',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/starred?sort=updated&per_page=50`,
      { headers },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: `User "${username}" not found` },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error: 'Failed to fetch starred repos',
          status: response.status,
        },
        { status: response.status },
      );
    }

    const repos: GitHubRepo[] = await response.json();

    const mapped = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
      private: repo.private,
      description: repo.description,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      updated_at: repo.updated_at,
    }));

    return NextResponse.json({ starred: mapped });
  } catch (error) {
    console.error(`[starred/${username}] error:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch starred repos' },
      { status: 500 },
    );
  }
}
