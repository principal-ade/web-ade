/**
 * GET /api/github/search
 *
 * Proxies GitHub repository search API.
 * Uses authenticated requests if user is logged in, otherwise uses public API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import type { GitHubSearchReposResponse } from '@/types/api';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const perPage = searchParams.get('per_page') || '30';
    const page = searchParams.get('page') || '1';
    const sort = searchParams.get('sort') || 'stars';
    const order = searchParams.get('order') || 'desc';

    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    // Try to get auth token for higher rate limits
    const githubToken = await getGitHubToken();

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('page', page);
    url.searchParams.set('sort', sort);
    url.searchParams.set('order', order);

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 403 && errorData.message?.includes('rate limit')) {
        return NextResponse.json(
          { error: 'GitHub API rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorData.message || 'GitHub search failed' },
        { status: response.status }
      );
    }

    const data: GitHubSearchReposResponse = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('GitHub search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search repositories',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
