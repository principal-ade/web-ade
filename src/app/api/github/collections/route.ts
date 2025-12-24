/**
 * GitHub Collections Sync API
 *
 * GET  - Check if collections repo exists and fetch collections + memberships
 * POST - Create collections repo and/or save collections + memberships
 * PUT  - Update collections + memberships in existing repo
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import type {
  Collection,
  CollectionMembership,
  CollectionsData,
  CollectionMembershipsData,
} from '@principal-ai/alexandria-collections';

const REPO_NAME = 'web-ade-collections';
const COLLECTIONS_FILE = 'collections.json';
const MEMBERSHIPS_FILE = 'collection-memberships.json';

interface GitHubUser {
  login: string;
}

interface GitHubContentResponse {
  content: string;
  sha: string;
  encoding: string;
}

async function getAuthenticatedUser(token: string): Promise<GitHubUser | null> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function checkRepoExists(token: string, owner: string): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${REPO_NAME}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  return response.ok;
}

async function createRepo(token: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: REPO_NAME,
      description: 'My web-ade collections - synced repository collections',
      public: true,
      auto_init: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { success: false, error: error.message || 'Failed to create repository' };
  }

  return { success: true };
}

async function getFile<T>(
  token: string,
  owner: string,
  filename: string
): Promise<{ data: T | null; sha: string | null; error?: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${REPO_NAME}/contents/${filename}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (response.status === 404) {
    return { data: null, sha: null };
  }

  if (!response.ok) {
    return { data: null, sha: null, error: `Failed to fetch ${filename}` };
  }

  const content: GitHubContentResponse = await response.json();

  try {
    const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
    const data: T = JSON.parse(decoded);
    return { data, sha: content.sha };
  } catch {
    return { data: null, sha: content.sha, error: `Failed to parse ${filename}` };
  }
}

async function saveFile(
  token: string,
  owner: string,
  filename: string,
  content: unknown,
  sha?: string | null,
  retries = 3
): Promise<{ success: boolean; error?: string }> {
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

  const body: Record<string, unknown> = {
    message: `Update ${filename} - ${new Date().toISOString()}`,
    content: encoded,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${REPO_NAME}/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.json();

    // Handle SHA conflict (409) by refetching SHA and retrying
    if (response.status === 409 && retries > 0) {
      const currentFile = await getFile<unknown>(token, owner, filename);
      if (currentFile.sha) {
        return saveFile(token, owner, filename, content, currentFile.sha, retries - 1);
      }
    }

    return { success: false, error: error.message || `Failed to save ${filename}` };
  }

  return { success: true };
}

/**
 * GET /api/github/collections
 *
 * Check if the collections repo exists and fetch collections + memberships if it does.
 */
export async function GET() {
  try {
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await getAuthenticatedUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to get user info' },
        { status: 401 }
      );
    }

    const exists = await checkRepoExists(token, user.login);

    if (!exists) {
      return NextResponse.json({
        exists: false,
        collections: null,
        memberships: null,
        repoUrl: null,
      });
    }

    const [collectionsResult, membershipsResult] = await Promise.all([
      getFile<CollectionsData>(token, user.login, COLLECTIONS_FILE),
      getFile<CollectionMembershipsData>(token, user.login, MEMBERSHIPS_FILE),
    ]);

    if (collectionsResult.error) {
      return NextResponse.json(
        { error: collectionsResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      exists: true,
      collections: collectionsResult.data?.collections || [],
      memberships: membershipsResult.data?.memberships || [],
      repoUrl: `https://github.com/${user.login}/${REPO_NAME}`,
    });
  } catch (error) {
    console.error('GitHub collections GET error:', error);
    return NextResponse.json(
      { error: 'Failed to check collections' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/github/collections
 *
 * Create the collections repo if it doesn't exist, then save collections + memberships.
 * Body: { collections: Collection[], memberships: CollectionMembership[] }
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await getAuthenticatedUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to get user info' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const collections: Collection[] = body.collections || [];
    const memberships: CollectionMembership[] = body.memberships || [];

    // Check if repo exists
    const exists = await checkRepoExists(token, user.login);

    if (!exists) {
      const createResult = await createRepo(token);
      if (!createResult.success) {
        return NextResponse.json(
          { error: createResult.error },
          { status: 500 }
        );
      }

      // Wait for GitHub to initialize the repo
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get existing file SHAs (files may not exist yet for new repos)
    const [collectionsResult, membershipsResult] = await Promise.all([
      getFile<CollectionsData>(token, user.login, COLLECTIONS_FILE),
      getFile<CollectionMembershipsData>(token, user.login, MEMBERSHIPS_FILE),
    ]);

    // Save files sequentially to avoid race conditions
    const collectionsData: CollectionsData = {
      version: '1.0',
      collections,
    };

    const membershipsData: CollectionMembershipsData = {
      version: '1.0',
      memberships,
    };

    // Save collections first
    const collectionsResult2 = await saveFile(
      token, user.login, COLLECTIONS_FILE, collectionsData, collectionsResult.sha
    );
    if (!collectionsResult2.success) {
      return NextResponse.json(
        { error: collectionsResult2.error },
        { status: 500 }
      );
    }

    // Then save memberships
    const membershipsResult2 = await saveFile(
      token, user.login, MEMBERSHIPS_FILE, membershipsData, membershipsResult.sha
    );
    if (!membershipsResult2.success) {
      return NextResponse.json(
        { error: membershipsResult2.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      repoUrl: `https://github.com/${user.login}/${REPO_NAME}`,
    });
  } catch (error) {
    console.error('GitHub collections POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save collections' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/github/collections
 *
 * Update collections + memberships in existing repo (fails if repo doesn't exist).
 * Body: { collections: Collection[], memberships: CollectionMembership[] }
 */
export async function PUT(request: NextRequest) {
  try {
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await getAuthenticatedUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to get user info' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const collections: Collection[] = body.collections || [];
    const memberships: CollectionMembership[] = body.memberships || [];

    // Check if repo exists
    const exists = await checkRepoExists(token, user.login);

    if (!exists) {
      return NextResponse.json(
        { error: 'Collections repo does not exist. Use POST to create it.' },
        { status: 404 }
      );
    }

    // Get existing file SHAs
    const [collectionsResult, membershipsResult] = await Promise.all([
      getFile<CollectionsData>(token, user.login, COLLECTIONS_FILE),
      getFile<CollectionMembershipsData>(token, user.login, MEMBERSHIPS_FILE),
    ]);

    if (collectionsResult.error) {
      return NextResponse.json(
        { error: collectionsResult.error },
        { status: 500 }
      );
    }

    // Save files sequentially to avoid race conditions
    const collectionsData: CollectionsData = {
      version: '1.0',
      collections,
    };

    const membershipsData: CollectionMembershipsData = {
      version: '1.0',
      memberships,
    };

    // Save collections first
    const collectionsResult2 = await saveFile(
      token, user.login, COLLECTIONS_FILE, collectionsData, collectionsResult.sha
    );
    if (!collectionsResult2.success) {
      return NextResponse.json(
        { error: collectionsResult2.error },
        { status: 500 }
      );
    }

    // Then save memberships
    const membershipsResult2 = await saveFile(
      token, user.login, MEMBERSHIPS_FILE, membershipsData, membershipsResult.sha
    );
    if (!membershipsResult2.success) {
      return NextResponse.json(
        { error: membershipsResult2.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('GitHub collections PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update collections' },
      { status: 500 }
    );
  }
}
