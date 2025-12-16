import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

interface RepoInfo {
  repositoryId: string;
  name: string;
  fullName: string;
  description: string | null;
  fork: boolean;
  sourceRepository?: {
    owner: string;
    name: string;
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const { owner, repo } = await params;
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('github_access_token')?.value;

    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'web-ade',
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch repository' }, { status: response.status });
    }

    const data = await response.json();

    const repoInfo: RepoInfo = {
      repositoryId: `${owner}/${repo}`,
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      fork: data.fork,
    };

    // If it's a fork, include the source repository info
    if (data.fork && data.parent) {
      repoInfo.sourceRepository = {
        owner: data.parent.owner.login,
        name: data.parent.name,
      };
    }

    return NextResponse.json(repoInfo);
  } catch (error) {
    console.error('Error fetching repository:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repository info' },
      { status: 500 }
    );
  }
}
