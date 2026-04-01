/**
 * Line Counts API
 *
 * GET /api/line-counts/[owner]/[repo] - Fetch line counts for a repository
 * PUT /api/line-counts/[owner]/[repo] - Store line counts (from electron-app)
 *
 * Line counts are used to determine building heights in the File City 3D visualization.
 *
 * Constraints:
 * - Repos with >=2000 files require pre-computed cache (from electron-app)
 * - Repos with <2000 files can be computed on-demand (requires login)
 * - Without login, only cached data is available
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getLineCountsFromS3,
  storeLineCountsInS3,
  type LineCountsCache,
  type LineCountsResponse,
} from '@/lib/line-counts/s3-cache';

interface RouteParams {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

const GITHUB_API_BASE = 'https://api.github.com';
const MAX_FILES_FOR_COMPUTATION = 2000;
const MAX_CONCURRENT_BLOB_FETCHES = 10;

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'svg', 'bmp', 'tiff',
  'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'lock', 'min.js', 'min.css',
  'pyc', 'class', 'o', 'obj',
]);

/**
 * Get GitHub token from cookies (user auth) or env (server auth)
 */
async function getGitHubToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Check if a file should be counted (not binary)
 */
function shouldCountFile(path: string): boolean {
  const fileName = path.split('/').pop() || '';
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

  if (!ext) return true; // Files without extensions (README, Makefile, etc.)
  if (BINARY_EXTENSIONS.has(ext)) return false;
  if (fileName.endsWith('.min.js') || fileName.endsWith('.min.css')) return false;

  return true;
}

/**
 * Fetch file tree from GitHub
 */
async function fetchFileTree(
  owner: string,
  repo: string,
  token: string | null
): Promise<{ tree: Array<{ path: string; sha: string; size?: number; type: string }>; truncated: boolean } | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WebADE/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  } else if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers }
    );

    if (!response.ok) {
      console.error('[Line Counts] Failed to fetch tree:', response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('[Line Counts] Error fetching tree:', error);
    return null;
  }
}

/**
 * Fetch blob content and count lines
 */
async function fetchBlobLineCount(
  owner: string,
  repo: string,
  sha: string,
  token: string | null
): Promise<number> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WebADE/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  } else if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs/${sha}`,
      { headers }
    );

    if (!response.ok) {
      return 0;
    }

    const blob = await response.json();

    // Decode base64 content
    if (blob.encoding === 'base64' && blob.content) {
      const content = Buffer.from(blob.content, 'base64').toString('utf-8');
      // Count lines (number of newlines + 1 if content doesn't end with newline)
      const lines = content.split('\n').length;
      return content.endsWith('\n') ? lines - 1 : lines;
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Simple concurrency limiter for batch blob fetches
 */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/**
 * Compute line counts for a repository by fetching blobs
 */
async function computeLineCounts(
  owner: string,
  repo: string,
  token: string | null
): Promise<LineCountsCache | null> {
  console.log('[Line Counts] Computing for', owner, repo);

  const treeData = await fetchFileTree(owner, repo, token);
  if (!treeData) {
    return null;
  }

  // Filter to just blobs (files)
  const files = treeData.tree.filter(
    (item) => item.type === 'blob' && shouldCountFile(item.path)
  );

  console.log('[Line Counts] Files to count:', files.length);

  // Fetch blob contents with concurrency limit
  const limiter = createLimiter(MAX_CONCURRENT_BLOB_FETCHES);
  const lineCounts: Record<string, number> = {};

  await Promise.all(
    files.map((file) =>
      limiter(async () => {
        const count = await fetchBlobLineCount(owner, repo, file.sha, token);
        if (count > 0) {
          lineCounts[file.path] = count;
        }
      })
    )
  );

  const result: LineCountsCache = {
    owner,
    repo,
    generatedAt: new Date().toISOString(),
    generatedBy: 'web-ade',
    fileCount: files.length,
    lineCounts,
  };

  return result;
}

/**
 * GET /api/line-counts/[owner]/[repo]
 *
 * Fetch line counts for a repository.
 * - Returns cached data if available
 * - Computes on-demand for small repos (<2000 files) if user is logged in
 * - Returns unavailable status for large repos without cache
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<LineCountsResponse>> {
  const { owner, repo } = await params;
  const searchParams = request.nextUrl.searchParams;
  const forceCompute = searchParams.get('compute') === '1';

  console.log('[Line Counts] GET request:', { owner, repo, forceCompute });

  // 1. Check S3 cache first
  const cached = await getLineCountsFromS3(owner, repo);
  if (cached && !forceCompute) {
    console.log('[Line Counts] Cache hit:', { owner, repo, fileCount: cached.fileCount });
    return NextResponse.json({
      available: true,
      data: cached,
    });
  }

  // 2. Check if user is logged in (required for computation)
  const userToken = await getGitHubToken();
  if (!userToken) {
    console.log('[Line Counts] No auth, returning unavailable');
    return NextResponse.json({
      available: false,
      reason: 'auth-required',
      message: 'Log in to compute line counts, or use the desktop app for large repositories.',
    });
  }

  // 3. Fetch tree to check file count
  const treeData = await fetchFileTree(owner, repo, userToken);
  if (!treeData) {
    return NextResponse.json({
      available: false,
      reason: 'not-cached',
      message: 'Failed to fetch repository data.',
    });
  }

  const fileCount = treeData.tree.filter((item) => item.type === 'blob').length;

  // 4. Check if repo is too large for on-demand computation
  if (fileCount >= MAX_FILES_FOR_COMPUTATION) {
    console.log('[Line Counts] Repo too large:', { owner, repo, fileCount });
    return NextResponse.json({
      available: false,
      reason: 'too-large',
      fileCount,
      message: `This repository has ${fileCount.toLocaleString()} files. Download the desktop app to generate line counts for large repositories.`,
    });
  }

  // 5. Compute line counts
  console.log('[Line Counts] Computing on-demand:', { owner, repo, fileCount });
  const computed = await computeLineCounts(owner, repo, userToken);

  if (!computed) {
    return NextResponse.json({
      available: false,
      reason: 'not-cached',
      message: 'Failed to compute line counts.',
    });
  }

  // 6. Store in S3 cache (async, don't block response)
  storeLineCountsInS3(computed).catch((err) => {
    console.error('[Line Counts] Failed to cache:', err);
  });

  return NextResponse.json({
    available: true,
    data: computed,
  });
}

/**
 * PUT /api/line-counts/[owner]/[repo]
 *
 * Store line counts from electron-app.
 * Requires API key authentication.
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { owner, repo } = await params;

  // 1. Validate API key
  const authHeader = request.headers.get('Authorization');
  const apiKey = process.env.LINE_COUNTS_API_KEY;

  if (!apiKey) {
    console.error('[Line Counts] LINE_COUNTS_API_KEY not configured');
    return NextResponse.json(
      { error: 'API not configured' },
      { status: 503 }
    );
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing authorization header' },
      { status: 401 }
    );
  }

  const providedKey = authHeader.slice(7); // Remove 'Bearer ' prefix
  if (providedKey !== apiKey) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  // 2. Parse and validate request body
  let body: Partial<LineCountsCache>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!body.lineCounts || typeof body.lineCounts !== 'object') {
    return NextResponse.json(
      { error: 'Missing or invalid lineCounts field' },
      { status: 400 }
    );
  }

  // 3. Build cache data
  const cacheData: LineCountsCache = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    generatedAt: new Date().toISOString(),
    generatedBy: 'electron-app',
    fileCount: body.fileCount || Object.keys(body.lineCounts).length,
    lineCounts: body.lineCounts,
  };

  // 4. Store in S3
  try {
    await storeLineCountsInS3(cacheData);
    console.log('[Line Counts] PUT success:', { owner, repo, fileCount: cacheData.fileCount });

    return NextResponse.json({
      success: true,
      fileCount: cacheData.fileCount,
    });
  } catch (error) {
    console.error('[Line Counts] PUT failed:', error);
    return NextResponse.json(
      { error: 'Failed to store line counts' },
      { status: 500 }
    );
  }
}
