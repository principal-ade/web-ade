/**
 * GitHub Collections Sync API
 *
 * GET  - Check if collections repo exists and fetch collections
 * POST - Create collections repo and/or save collections
 * PUT  - Update collections in existing repo
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

const REPO_NAME = 'web-ade-collections';
const COLLECTIONS_FILE = 'collections.json';

interface GitHubUser {
  login: string;
}

interface GitHubContentResponse {
  content: string;
  sha: string;
  encoding: string;
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  repositories: string[];
  createdAt: number;
  updatedAt: number;
}

interface CollectionsData {
  version: number;
  collections: Collection[];
  updatedAt: number;
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
      auto_init: true, // Creates README so we have a commit to work with
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { success: false, error: error.message || 'Failed to create repository' };
  }

  return { success: true };
}

async function getCollectionsFile(
  token: string,
  owner: string
): Promise<{ data: CollectionsData | null; sha: string | null; error?: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${REPO_NAME}/contents/${COLLECTIONS_FILE}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (response.status === 404) {
    // File doesn't exist yet
    return { data: null, sha: null };
  }

  if (!response.ok) {
    return { data: null, sha: null, error: 'Failed to fetch collections' };
  }

  const content: GitHubContentResponse = await response.json();

  try {
    const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
    const data: CollectionsData = JSON.parse(decoded);
    return { data, sha: content.sha };
  } catch {
    return { data: null, sha: content.sha, error: 'Failed to parse collections' };
  }
}

async function saveCollectionsFile(
  token: string,
  owner: string,
  collections: CollectionsData,
  sha?: string | null
): Promise<{ success: boolean; error?: string }> {
  const content = Buffer.from(JSON.stringify(collections, null, 2)).toString('base64');

  const body: Record<string, unknown> = {
    message: `Update collections - ${new Date().toISOString()}`,
    content,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${REPO_NAME}/contents/${COLLECTIONS_FILE}`,
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
    return { success: false, error: error.message || 'Failed to save collections' };
  }

  return { success: true };
}

/**
 * GET /api/github/collections
 *
 * Check if the collections repo exists and fetch collections if it does.
 * Returns: { exists: boolean, collections: CollectionsData | null }
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
        repoUrl: null,
      });
    }

    const { data, error } = await getCollectionsFile(token, user.login);

    if (error) {
      return NextResponse.json(
        { error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      exists: true,
      collections: data,
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
 * Create the collections repo if it doesn't exist, then save collections.
 * Body: { collections: Collection[] }
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

    // Check if repo exists
    const exists = await checkRepoExists(token, user.login);

    if (!exists) {
      // Create the repo
      const createResult = await createRepo(token);
      if (!createResult.success) {
        return NextResponse.json(
          { error: createResult.error },
          { status: 500 }
        );
      }

      // Wait a moment for GitHub to initialize the repo
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get existing file SHA if it exists
    const { sha } = await getCollectionsFile(token, user.login);

    // Save collections
    const collectionsData: CollectionsData = {
      version: 1,
      collections,
      updatedAt: Date.now(),
    };

    const saveResult = await saveCollectionsFile(token, user.login, collectionsData, sha);

    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error },
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
 * Update collections in existing repo (fails if repo doesn't exist).
 * Body: { collections: Collection[] }
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

    // Check if repo exists
    const exists = await checkRepoExists(token, user.login);

    if (!exists) {
      return NextResponse.json(
        { error: 'Collections repo does not exist. Use POST to create it.' },
        { status: 404 }
      );
    }

    // Get existing file SHA
    const { sha, error: getError } = await getCollectionsFile(token, user.login);

    if (getError) {
      return NextResponse.json(
        { error: getError },
        { status: 500 }
      );
    }

    // Save collections
    const collectionsData: CollectionsData = {
      version: 1,
      collections,
      updatedAt: Date.now(),
    };

    const saveResult = await saveCollectionsFile(token, user.login, collectionsData, sha);

    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error },
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
