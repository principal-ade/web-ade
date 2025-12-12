import { NextResponse } from 'next/server';
import {
  GitHubFileSystemAdapter,
  WorkspaceManager,
} from '@principal-ai/alexandria-core-library/github';

// Cache collections for 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;
let cachedCollections: {
  data: Awaited<ReturnType<typeof fetchCollections>> | null;
  timestamp: number;
} = { data: null, timestamp: 0 };

async function fetchCollections() {
  const adapter = new GitHubFileSystemAdapter({
    owner: 'principal-ai',
    repo: 'curated-collections',
    branch: 'main',
  });

  // Preload the workspace files
  await adapter.preload('/workspaces.json');
  await adapter.preload('/workspace-memberships.json');

  const manager = new WorkspaceManager('/', adapter);
  const workspaces = await manager.getWorkspaces();

  if (!workspaces) {
    return { collections: [], memberships: {} };
  }

  // Get memberships for each workspace
  const memberships: Record<string, string[]> = {};
  for (const workspace of workspaces) {
    const wsMemberships = await manager.getWorkspaceMemberships(workspace.id);
    memberships[workspace.id] = wsMemberships.map((m) => m.repositoryId);
  }

  return {
    collections: workspaces,
    memberships,
  };
}

export async function GET() {
  try {
    const now = Date.now();

    // Check cache
    if (cachedCollections.data && now - cachedCollections.timestamp < CACHE_DURATION) {
      return NextResponse.json(cachedCollections.data);
    }

    // Fetch fresh data
    const data = await fetchCollections();

    // Update cache
    cachedCollections = { data, timestamp: now };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
