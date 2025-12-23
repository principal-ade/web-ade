import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { GitHubFileSystemAdapter } from '@principal-ai/alexandria-core-library/github';
import { CollectionManager } from '@/lib/collections/CollectionManager';

async function fetchCollections() {
  const adapter = new GitHubFileSystemAdapter({
    owner: 'principal-ai',
    repo: 'collections',
    branch: 'main',
    token: process.env.GITHUB_TOKEN,
  });

  // Preload the collection files
  await adapter.preload('/collections.json');
  await adapter.preload('/collection-memberships.json');

  const manager = new CollectionManager('/', adapter);
  const collections = await manager.getCollections();

  if (!collections) {
    return { collections: [], memberships: {} };
  }

  // Get memberships for each collection with full metadata
  interface RepositoryInfo {
    repositoryId: string;
    sourceRepository?: {
      owner: string;
      name: string;
    };
  }

  const memberships: Record<string, RepositoryInfo[]> = {};
  for (const collection of collections) {
    const colMemberships = await manager.getCollectionMemberships(collection.id);
    memberships[collection.id] = colMemberships.map((m) => ({
      repositoryId: m.repositoryId,
      sourceRepository: m.metadata?.sourceRepository as { owner: string; name: string } | undefined,
    }));
  }

  return {
    collections,
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
