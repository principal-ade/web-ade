import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import type {
  Collection,
} from '@principal-ai/alexandria-collections';

const RAW_BASE_URL = 'https://raw.githubusercontent.com/principal-ai/web-ade-collections/main/collections';

interface CollectionFile {
  version: string;
  collection: Collection;
}

async function fetchCollection(id: string): Promise<
  | { collection: Collection }
  | { error: string; status: number }
> {
  // Directly fetch the collection file by ID
  const response = await fetch(`${RAW_BASE_URL}/${id}.json`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return { error: 'Collection not found', status: 404 };
    }
    throw new Error(`Failed to fetch collection: ${response.status}`);
  }

  const data: CollectionFile = await response.json();
  return { collection: data.collection };
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
