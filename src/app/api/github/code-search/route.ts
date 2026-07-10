import { NextRequest, NextResponse } from 'next/server';
import { getGitHubApiToken } from '@/lib/auth/cookies';
import type { GitHubRawCodeSearchResponse, GitHubRawCodeSearchItem } from '@/types/api';

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(term, idx)) !== -1) {
    count++;
    idx += term.length;
  }
  return count;
}

async function countOccurrencesInFile(
  owner: string,
  repo: string,
  path: string,
  terms: string[]
): Promise<number> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const text = await res.text();
    return terms.reduce((sum, term) => sum + countOccurrences(text, term), 0);
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

    const terms = q.split(',').map((t) => t.trim()).filter(Boolean);
    if (terms.length === 0) terms.push('isRecord');

    const githubToken = await getGitHubApiToken();

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    // The v3 REST API doesn't support OR in code search, so make parallel
    // requests for each term and merge the results.
    const searches = await Promise.allSettled(
      terms.map((term) => {
        const encoded = encodeURIComponent(term);
        const url = `https://api.github.com/search/code?q=${encoded}+repo:${owner}/${repo}&per_page=100`;
        return fetch(url, { headers }).then((r) => {
          if (!r.ok) return r.json().then((e) => Promise.reject(e));
          return r.json() as Promise<GitHubRawCodeSearchResponse>;
        });
      })
    );

    // Merge unique files across all term searches
    const uniqueItems = new Map<string, GitHubRawCodeSearchItem>();
    let incompleteResults = false;
    let searchError: string | null = null;

    for (const result of searches) {
      if (result.status === 'rejected') {
        const err = result.reason;
        if (err?.message?.includes('rate limit')) {
          return NextResponse.json(
            { error: 'GitHub API rate limit exceeded. Please try again later.' },
            { status: 429 }
          );
        }
        searchError = err?.message || 'GitHub code search failed';
        continue;
      }
      const data = result.value;
      if (data.incomplete_results) incompleteResults = true;
      for (const item of data.items) {
        uniqueItems.set(item.path, item);
      }
    }

    if (uniqueItems.size === 0 && searchError) {
      return NextResponse.json({ error: searchError }, { status: 422 });
    }

    const allItems = Array.from(uniqueItems.values());

    let totalOccurrences = 0;
    if (allItems.length > 0) {
      const counts = await Promise.all(
        allItems.map((item) => countOccurrencesInFile(owner, repo, item.path, terms))
      );
      totalOccurrences = counts.reduce((sum, c) => sum + c, 0);
    }

    return NextResponse.json({
      total_files: allItems.length,
      total_occurrences: totalOccurrences,
      incomplete_results: incompleteResults,
      terms,
      items: allItems.map((i) => ({
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
