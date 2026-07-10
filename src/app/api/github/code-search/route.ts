import { NextRequest, NextResponse } from 'next/server';
import { getGitHubApiToken } from '@/lib/auth/cookies';
import type { GitHubRawCodeSearchResponse } from '@/types/api';

async function countOccurrencesInFile(
  owner: string,
  repo: string,
  path: string,
  term: string
): Promise<number> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const text = await res.text();
    let count = 0;
    let idx = 0;
    while ((idx = text.indexOf(term, idx)) !== -1) {
      count++;
      idx += term.length;
    }
    return count;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const q = searchParams.get('q');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'owner and repo are required' },
        { status: 400 }
      );
    }

    if (!q) {
      return NextResponse.json(
        { error: 'Search query (q) is required' },
        { status: 400 }
      );
    }

    const githubToken = await getGitHubApiToken();

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const encodedQ = encodeURIComponent(q);
    const url = `https://api.github.com/search/code?q=${encodedQ}+repo:${owner}/${repo}&per_page=100`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 403 && errorData.message?.includes('rate limit')) {
        return NextResponse.json(
          { error: 'GitHub API rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorData.message || 'GitHub code search failed' },
        { status: response.status }
      );
    }

    const data: GitHubRawCodeSearchResponse = await response.json();

    let totalOccurrences = 0;
    if (data.items?.length) {
      const counts = await Promise.all(
        data.items.map((item) => countOccurrencesInFile(owner, repo, item.path, q))
      );
      totalOccurrences = counts.reduce((sum, c) => sum + c, 0);
    }

    return NextResponse.json({
      total_files: data.total_count,
      total_occurrences: totalOccurrences,
      incomplete_results: data.incomplete_results,
      items: data.items.map((i) => ({
        path: i.path,
        html_url: i.html_url,
      })),
    });
  } catch (error) {
    console.error('GitHub code search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search code',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
