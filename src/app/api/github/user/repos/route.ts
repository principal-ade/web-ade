/**
 * GET /api/github/user/repos
 *
 * Returns the authenticated user's repositories (owned and starred).
 * Reads GitHub token from HTTP-only cookie.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

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
  topics?: string[];
}

interface GitHubOrg {
  login: string;
  id: number;
  avatar_url: string;
  description: string | null;
}

export async function GET() {
  try {
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', isAuthenticated: false },
        { status: 401 }
      );
    }

    const headers = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };

    // Fetch owned repos, starred repos, and orgs in parallel
    const [ownedResponse, starredResponse, orgsResponse] = await Promise.all([
      fetch('https://api.github.com/user/repos?sort=updated&per_page=100', { headers }),
      fetch('https://api.github.com/user/starred?sort=updated&per_page=50', { headers }),
      fetch('https://api.github.com/user/orgs', { headers }),
    ]);

    if (!ownedResponse.ok) {
      if (ownedResponse.status === 401) {
        return NextResponse.json(
          { error: 'Invalid token', isAuthenticated: false },
          { status: 401 }
        );
      }
      throw new Error(`GitHub API error: ${ownedResponse.status}`);
    }

    const ownedRepos: GitHubRepo[] = await ownedResponse.json();
    const starredRepos: GitHubRepo[] = starredResponse.ok ? await starredResponse.json() : [];
    const orgs: GitHubOrg[] = orgsResponse.ok ? await orgsResponse.json() : [];

    // Fetch repos for each org
    const orgReposPromises = orgs.map(async (org) => {
      const response = await fetch(
        `https://api.github.com/orgs/${org.login}/repos?sort=updated&per_page=50`,
        { headers }
      );
      const repos: GitHubRepo[] = response.ok ? await response.json() : [];
      return {
        id: org.id,
        login: org.login,
        avatar_url: org.avatar_url,
        description: org.description,
        repositories: repos.map((repo) => ({
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
          topics: repo.topics,
        })),
      };
    });

    const organizations = await Promise.all(orgReposPromises);

    // Filter owned repos to only include user's personal repos (not org repos)
    const personalRepos = ownedRepos.filter((repo) => repo.owner.type === 'User');

    return NextResponse.json({
      isAuthenticated: true,
      owned: personalRepos.map((repo) => ({
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
        topics: repo.topics,
      })),
      starred: starredRepos.map((repo) => ({
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
        topics: repo.topics,
      })),
      organizations,
    });
  } catch (error) {
    console.error('GitHub repos error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch repositories',
        message: error instanceof Error ? error.message : 'Unknown error',
        isAuthenticated: true,
      },
      { status: 500 }
    );
  }
}
