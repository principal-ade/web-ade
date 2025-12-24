import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import type {
  Collection,
  CollectionMembership,
  CollectionsData,
  CollectionMembershipsData,
} from '@principal-ai/alexandria-collections';

const BASE_URL = 'https://raw.githubusercontent.com/principal-ai/web-ade-collections/main';

async function fetchCollections(): Promise<{
  collections: Collection[];
  memberships: CollectionMembership[];
}> {
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

  let memberships: CollectionMembership[] = [];
  if (membershipsResponse.ok) {
    const membershipsData: CollectionMembershipsData = await membershipsResponse.json();
    memberships = membershipsData.memberships || [];
  }

  return {
    collections: collectionsData.collections || [],
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
