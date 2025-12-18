import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import {
  GitHubFileSystemAdapter,
  WorkspaceManager,
} from '@principal-ai/alexandria-core-library/github';

async function fetchCollections() {
  const adapter = new GitHubFileSystemAdapter({
    owner: 'principal-ai',
    repo: 'curated-collections',
    branch: 'main',
    token: process.env.GITHUB_TOKEN,
  });

  // Preload the workspace files
  await adapter.preload('/workspaces.json');
  await adapter.preload('/workspace-memberships.json');

  const manager = new WorkspaceManager('/', adapter);
  const workspaces = await manager.getWorkspaces();

  if (!workspaces) {
    return { collections: [], memberships: {} };
  }

  // Get memberships for each workspace with full metadata
  interface RepositoryInfo {
    repositoryId: string;
    sourceRepository?: {
      owner: string;
      name: string;
    };
  }

  const memberships: Record<string, RepositoryInfo[]> = {};
  for (const workspace of workspaces) {
    const wsMemberships = await manager.getWorkspaceMemberships(workspace.id);
    memberships[workspace.id] = wsMemberships.map((m) => ({
      repositoryId: m.repositoryId,
      sourceRepository: m.metadata?.sourceRepository as { owner: string; name: string } | undefined,
    }));
  }

  return {
    collections: workspaces,
    memberships,
  };
}

// Use Next.js data cache - persists across serverless instances
const getCachedCollections = unstable_cache(
  async () => fetchCollections(),
  ['curated-collections'],
  {
    revalidate: 300, // 5 minutes
    tags: ['collections'],
  }
);

export async function GET() {
  try {
    const data = await getCachedCollections();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
