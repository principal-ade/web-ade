import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { GitHubFileSystemAdapter } from '@principal-ai/alexandria-core-library/github';
import { CollectionManager } from '@/lib/collections/CollectionManager';

async function fetchCollection(id: string) {
  const adapter = new GitHubFileSystemAdapter({
    owner: 'principal-ai',
    repo: 'collections',
    branch: 'main',
    token: process.env.GITHUB_TOKEN,
  });

  await adapter.preload('/collections.json');
  await adapter.preload('/collection-memberships.json');

  const manager = new CollectionManager('/', adapter);
  const collections = await manager.getCollections();

  if (!collections) {
    return { error: 'No collections found', status: 404 };
  }

  const collection = collections.find((c) => c.id === id);
  if (!collection) {
    return { error: 'Collection not found', status: 404 };
  }

  const memberships = await manager.getCollectionMemberships(id);
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
