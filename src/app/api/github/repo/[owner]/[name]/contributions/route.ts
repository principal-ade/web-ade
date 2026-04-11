import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

export interface DailyContribution {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface RepoContributionsResponse {
  contributions: DailyContribution[];
  timeRange: {
    start: string;
    end: string;
  };
  totalCommits: number;
  pagesFetched: number;
  contributorsUsed: number;
}

/**
 * Get repository contribution calendar
 * Fetches commits and aggregates them by day
 * Uses repo creation date as the start time (or goes back to max 365 days)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const userToken = await getGitHubToken();

    const token = userToken || process.env.GITHUB_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token required' },
        { status: 401 }
      );
    }

    // First, fetch repo info to get creation date
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${token}`,
          'User-Agent': 'WebADE/1.0',
        },
      }
    );

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found' },
          { status: 404 }
        );
      }
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }

    const repoData = (await repoResponse.json()) as {
      created_at: string;
    };

    const now = new Date();
    const repoCreatedAt = new Date(repoData.created_at);

    // Use repo creation date, but cap at 365 days for very old repos
    const maxDaysBack = 365;
    const maxStartTime = new Date(now);
    maxStartTime.setDate(maxStartTime.getDate() - maxDaysBack);

    const startTime = repoCreatedAt > maxStartTime ? repoCreatedAt : maxStartTime;
    const sinceISO = startTime.toISOString();

    // Fetch top 10 contributors
    const contributorsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contributors?per_page=10`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${token}`,
          'User-Agent': 'WebADE/1.0',
        },
      }
    );

    if (!contributorsResponse.ok) {
      throw new Error(`GitHub API error fetching contributors: ${contributorsResponse.status}`);
    }

    const contributors = (await contributorsResponse.json()) as Array<{
      login: string;
      contributions: number;
    }>;

    // Fetch commits for each contributor to this repo
    let allCommits: Array<{
      sha: string;
      commit: {
        author: {
          date: string;
        };
      };
    }> = [];

    let totalApiCalls = 0;

    for (const contributor of contributors) {
      // Fetch up to 3 pages (300 commits) per contributor
      const maxPagesPerContributor = 3;
      const perPage = 100;

      for (let page = 1; page <= maxPagesPerContributor; page++) {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${name}/commits?author=${contributor.login}&since=${sinceISO}&per_page=${perPage}&page=${page}`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `token ${token}`,
              'User-Agent': 'WebADE/1.0',
            },
          }
        );

        totalApiCalls++;

        if (!response.ok) {
          console.error(`Failed to fetch commits for ${contributor.login}: ${response.status}`);
          break;
        }

        const pageCommits = (await response.json()) as Array<{
          sha: string;
          commit: {
            author: {
              date: string;
            };
          };
        }>;

        // If we got no commits, we've reached the end for this contributor
        if (pageCommits.length === 0) {
          break;
        }

        allCommits = allCommits.concat(pageCommits);

        // If we got fewer than perPage commits, this is the last page for this contributor
        if (pageCommits.length < perPage) {
          break;
        }

        // Check if oldest commit is before our start time
        const oldestCommit = pageCommits[pageCommits.length - 1];
        if (oldestCommit && new Date(oldestCommit.commit.author.date) < startTime) {
          break;
        }
      }
    }

    const commits = allCommits;
    const pagesFetched = totalApiCalls;

    // Aggregate commits by day
    const dailyCounts: Record<string, number> = {};

    for (const commit of commits) {
      const date = commit.commit.author.date.split('T')[0] ?? ''; // Extract YYYY-MM-DD
      if (date) {
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      }
    }

    // Fill in all days from start to now
    const allDays: DailyContribution[] = [];
    const currentDate = new Date(startTime);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0] ?? '';
      if (dateStr) {
        const existing = dailyCounts[dateStr];
        allDays.push({
          date: dateStr,
          count: existing || 0,
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const result: RepoContributionsResponse = {
      contributions: allDays,
      timeRange: {
        start: startTime.toISOString(),
        end: now.toISOString(),
      },
      totalCommits: commits.length,
      pagesFetched,
      contributorsUsed: contributors.length,
    };

    const jsonResponse = NextResponse.json(result);

    // Cache for 5 minutes
    jsonResponse.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );

    return jsonResponse;
  } catch (error) {
    console.error('[repo-contributions] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
