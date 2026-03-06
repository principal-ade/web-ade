/**
 * GET /api/github/owner/[owner]/repos
 *
 * Returns repositories for a specific GitHub user or organization.
 * Uses authenticated requests when possible to include private repos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  type: 'User' | 'Organization';
  public_repos: number;
  followers: number;
  following: number;
  // Extended profile fields for OrgProfilePanel
  blog: string | null;
  location: string | null;
  email: string | null;
  twitter_username: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  clone_url: string;
  language: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  created_at: string;
  topics?: string[];
  archived?: boolean;
  license?: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string }> }
) {
  try {
    const { owner } = await params;
    const githubToken = await getGitHubToken();

    // Build headers - use auth if available
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    // Fetch owner info and repos in parallel
    const [userResponse, reposResponse] = await Promise.all([
      fetch(`https://api.github.com/users/${owner}`, { headers }),
      fetch(`https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`, { headers }),
    ]);

    if (!userResponse.ok) {
      if (userResponse.status === 404) {
        return NextResponse.json(
          {
            owner: null,
            repositories: [],
            isAuthenticated: !!githubToken,
            error: `User or organization "${owner}" not found`,
          },
          { status: 404 }
        );
      }
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }

    const userData: GitHubUser = await userResponse.json();
    const reposData: GitHubRepo[] = reposResponse.ok ? await reposResponse.json() : [];

    // If authenticated, also fetch org repos with member access (for private repos)
    let allRepos = reposData;
    if (githubToken && userData.type === 'Organization') {
      // For orgs, try to fetch with member visibility
      const orgReposResponse = await fetch(
        `https://api.github.com/orgs/${owner}/repos?per_page=100&sort=updated&type=all`,
        { headers }
      );
      if (orgReposResponse.ok) {
        allRepos = await orgReposResponse.json();
      }
    }

    return NextResponse.json({
      success: true,
      owner: {
        login: userData.login,
        id: userData.id,
        avatar_url: userData.avatar_url,
        name: userData.name,
        bio: userData.bio,
        type: userData.type,
        public_repos: userData.public_repos,
        followers: userData.followers,
        following: userData.following,
        // Extended profile fields for OrgProfilePanel
        blog: userData.blog,
        location: userData.location,
        email: userData.email,
        twitter_username: userData.twitter_username,
        html_url: userData.html_url,
        created_at: userData.created_at,
        updated_at: userData.updated_at,
      },
      repositories: allRepos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner,
        private: repo.private,
        html_url: repo.html_url,
        description: repo.description,
        fork: repo.fork,
        clone_url: repo.clone_url,
        language: repo.language,
        default_branch: repo.default_branch,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        updated_at: repo.updated_at,
        created_at: repo.created_at,
        topics: repo.topics,
        archived: repo.archived,
        license: repo.license?.spdx_id || null,
      })),
      isAuthenticated: !!githubToken,
    });
  } catch (error) {
    console.error('GitHub owner repos error:', error);
    return NextResponse.json(
      {
        owner: null,
        repositories: [],
        isAuthenticated: false,
        error: error instanceof Error ? error.message : 'Failed to fetch repositories',
      },
      { status: 500 }
    );
  }
}
