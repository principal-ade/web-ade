import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import type {
  Collection,
  CollectionMembership,
  CollectionsData,
  CollectionMembershipsData,
} from '@principal-ai/alexandria-collections';

const BASE_URL = 'https://raw.githubusercontent.com/principal-ai/web-ade-collections/main';

async function fetchCollection(id: string): Promise<
  | { collection: Collection; memberships: CollectionMembership[] }
  | { error: string; status: number }
> {
  const [collectionsResponse, membershipsResponse] = await Promise.all([
    fetch(`${BASE_URL}/collections.json`, {
      headers: { Accept: 'application/json' },
    }),
    fetch(`${BASE_URL}/collection-memberships.json`, {
      headers: { Accept: 'application/json' },
    }),
  ]);

  if (!collectionsResponse.ok) {
    throw new Error(`Failed to fetch collections: ${collectionsResponse.status}`);
  }

  const collectionsData: CollectionsData = await collectionsResponse.json();
  const collection = collectionsData.collections?.find((c) => c.id === id);

  if (!collection) {
    return { error: 'Collection not found', status: 404 };
  }

  let memberships: CollectionMembership[] = [];
  if (membershipsResponse.ok) {
    const membershipsData: CollectionMembershipsData = await membershipsResponse.json();
    memberships = (membershipsData.memberships || []).filter(
      (m) => m.collectionId === id
    );
  }

  return { collection, memberships };
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

    if ('error' in result && 'status' in result) {
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
