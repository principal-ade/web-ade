import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import {
  GitHubFileSystemAdapter,
  WorkspaceManager,
} from '@principal-ai/alexandria-core-library/github';

async function fetchCollection(id: string) {
  const adapter = new GitHubFileSystemAdapter({
    owner: 'principal-ai',
    repo: 'curated-collections',
    branch: 'main',
    token: process.env.GITHUB_TOKEN,
  });

  await adapter.preload('/workspaces.json');
  await adapter.preload('/workspace-memberships.json');

  const manager = new WorkspaceManager('/', adapter);
  const workspaces = await manager.getWorkspaces();

  if (!workspaces) {
    return { error: 'No collections found', status: 404 };
  }

  const collection = workspaces.find((w) => w.id === id);
  if (!collection) {
    return { error: 'Collection not found', status: 404 };
  }

  const memberships = await manager.getWorkspaceMemberships(id);
  const repositories = memberships.map((m) => m.repositoryId);

  return { collection, repositories };
}

// Use Next.js data cache - persists across serverless instances
const getCachedCollection = unstable_cache(
  async (id: string) => fetchCollection(id),
  ['curated-collection'],
  {
    revalidate: 300, // 5 minutes
    tags: ['collections'],
  }
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await getCachedCollection(id);

    if ('error' in result && result.status) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collection' },
      { status: 500 }
    );
  }
}
