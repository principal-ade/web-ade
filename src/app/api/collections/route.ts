import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import type {
  Collection,
} from '@principal-ai/alexandria-collections';

const GITHUB_API_URL = 'https://api.github.com/repos/principal-ai/principal-ai-collections/contents/collections';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/principal-ai/principal-ai-collections/main/collections';

interface GitHubFileEntry {
  name: string;
  path: string;
  type: string;
  download_url: string;
}

interface CollectionFile {
  version: string;
  collection: Collection;
}

async function fetchCollections(): Promise<Collection[]> {
  // Fetch the collections directory listing from GitHub API
  const dirResponse = await fetch(GITHUB_API_URL, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (!dirResponse.ok) {
    throw new Error(`Failed to fetch collections directory: ${dirResponse.status}`);
  }

  const files: GitHubFileEntry[] = await dirResponse.json();
  const collectionFiles = files.filter(f => f.type === 'file' && f.name.endsWith('.json'));

  // Fetch all collection files in parallel
  const collectionPromises = collectionFiles.map(async (file) => {
    const response = await fetch(`${RAW_BASE_URL}/${file.name}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${file.name}: ${response.status}`);
      return null;
    }

    const data: CollectionFile = await response.json();
    return data.collection;
  });

  const collectionsResults = await Promise.all(collectionPromises);
  return collectionsResults.filter((c): c is Collection => c !== null);
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
    const collections = await getCachedCollections();

    return NextResponse.json({ collections }, {
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
