/**
 * GET /api/github/user-profile/[username]
 *
 * Minimal public GitHub user-profile lookup: returns just login, display
 * name, and avatar URL. Used by surfaces that want to render a curator
 * chip (avatar + name) without fanning out to the full repos/orgs payload.
 *
 * Uses the caller's GitHub token if present (for higher rate limits), or
 * the server-side GITHUB_TOKEN env fallback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

interface GitHubUserResponse {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
}

interface UserProfileResponse {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  if (!username || !/^[A-Za-z0-9-]{1,39}$/.test(username)) {
    return NextResponse.json(
      { error: 'Invalid username' },
      { status: 400 },
    );
  }

  const callerToken = await getGitHubToken();
  const token = callerToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/users/${username}`, {
    headers,
    // 1h CDN cache — display names rarely change.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub API error: ${res.status}` },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  const data = (await res.json()) as GitHubUserResponse;
  const profile: UserProfileResponse = {
    login: data.login,
    id: data.id,
    name: data.name,
    avatar_url: data.avatar_url,
  };

  return NextResponse.json(profile, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
