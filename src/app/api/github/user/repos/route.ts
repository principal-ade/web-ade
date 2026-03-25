/**
 * GET /api/github/user/repos
 *
 * Returns the authenticated user's repositories (owned and starred).
 * Reads GitHub token from HTTP-only cookie.
 *
 * Uses server-side caching to reduce GitHub API calls:
 * - User repos, starred, orgs, following: cached 5 minutes per user
 * - Org repos: cached 10 minutes (shared across requests for same org)
 */

import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import {
  fetchUserReposWithCache,
  fetchOrgReposWithCache,
  GitHubApiError,
  CACHE_TTL,
} from '@/lib/github-cache';
import type { GitHubRepo, GitHubOrg, GitHubUserProfile } from '@/types/api';

export async function GET() {
  try {
    const githubToken = await getGitHubToken();

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', isAuthenticated: false },
        { status: 401 }
      );
    }

    // Fetch user data with caching (4 parallel cached requests)
    const { owned, starred, orgs, following } = await fetchUserReposWithCache(githubToken);

    const ownedRepos = owned as GitHubRepo[];
    const starredRepos = starred as GitHubRepo[];
    const orgsList = orgs as GitHubOrg[];
    const followingList = following as GitHubUserProfile[];

    // Fetch repos for each org with caching
    const orgReposPromises = orgsList.map(async (org) => {
      const repos = await fetchOrgReposWithCache(org.login, githubToken) as GitHubRepo[];
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
          license: repo.license?.spdx_id || null,
        })),
      };
    });

    const organizations = await Promise.all(orgReposPromises);

    // Filter owned repos to only include user's personal repos (not org repos)
    const personalRepos = ownedRepos.filter((repo) => repo.owner.type === 'User');

    const response = NextResponse.json({
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
        license: repo.license?.spdx_id || null,
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
        license: repo.license?.spdx_id || null,
      })),
      organizations,
      following: followingList.map((user) => ({
        id: user.id,
        login: user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        name: user.name,
        bio: user.bio,
      })),
    });

    // Add cache headers - private because this is user-specific data
    response.headers.set(
      'Cache-Control',
      `private, s-maxage=${CACHE_TTL.USER_REPOS}, stale-while-revalidate=${CACHE_TTL.USER_REPOS * 2}`
    );

    return response;
  } catch (error) {
    console.error('GitHub repos error:', error);

    // Handle auth errors specifically
    if (error instanceof GitHubApiError && error.status === 401) {
      return NextResponse.json(
        { error: 'Invalid token', isAuthenticated: false },
        { status: 401 }
      );
    }

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
