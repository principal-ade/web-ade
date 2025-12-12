import { NextResponse } from 'next/server';
import {
  GitHubFileSystemAdapter,
  WorkspaceManager,
} from '@principal-ai/alexandria-core-library/github';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const adapter = new GitHubFileSystemAdapter({
      owner: 'principal-ai',
      repo: 'curated-collections',
      branch: 'main',
    });

    await adapter.preload('/workspaces.json');
    await adapter.preload('/workspace-memberships.json');

    const manager = new WorkspaceManager('/', adapter);
    const workspaces = await manager.getWorkspaces();

    if (!workspaces) {
      return NextResponse.json({ error: 'No collections found' }, { status: 404 });
    }

    const collection = workspaces.find((w) => w.id === id);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const memberships = await manager.getWorkspaceMemberships(id);
    const repositories = memberships.map((m) => m.repositoryId);

    return NextResponse.json({
      collection,
      repositories,
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collection' },
      { status: 500 }
    );
  }
}
