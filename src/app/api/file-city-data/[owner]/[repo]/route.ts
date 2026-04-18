/**
 * File City Data API
 *
 * GET /api/file-city-data/[owner]/[repo] - Get city data as JSON
 *
 * Query parameters:
 *   - ref: Git ref/branch (default: "HEAD")
 *   - commit: Optional single commit SHA to include changed files
 *   - commits: Optional comma-separated commit SHAs
 *
 * Returns JSON with city data and optional commit highlights.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CodeCityBuilderWithGrid,
  getFilesFromGitHubTree,
  buildFileSystemTreeFromFileInfoList,
  type GitHubTreeResponse,
} from '@principal-ai/file-city-builder';
import { gitTreeCache } from '@/lib/git-tree-cache';
import { getCached, setCachedAsync, getCommitDetailCacheKey } from '@/lib/redis-cache';
import type { GitHubCommitDetailResponse } from '@/types/api';

interface RouteParams {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

const CACHE_TTL_24H = 86400; // 24 hours in seconds

/**
 * Get headers for GitHub API requests
 */
function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'web-ade',
    Accept: 'application/vnd.github.v3+json',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  return headers;
}

/**
 * Get the default branch for a repository
 */
async function getDefaultBranch(
  owner: string,
  repo: string
): Promise<string> {
  const headers = getGitHubHeaders();
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error fetching repo: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

/**
 * Fetch GitHub tree with caching
 */
async function fetchGitHubTree(
  owner: string,
  repo: string,
  ref: string
): Promise<GitHubTreeResponse> {
  const headers = getGitHubHeaders();

  // If ref is HEAD, resolve to the actual default branch name
  const branch = ref === 'HEAD' ? await getDefaultBranch(owner, repo) : ref;

  // Check cache first
  const cacheKey = `${owner}/${repo}/${branch}`;
  const cached = gitTreeCache.get<GitHubTreeResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  // Cache miss - fetch from GitHub
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(treeUrl, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  const treeData = await response.json() as GitHubTreeResponse;

  // Cache by both the lookup key and the tree SHA (immutable)
  gitTreeCache.set(cacheKey, treeData);
  gitTreeCache.set(treeData.sha, treeData);

  return treeData;
}

/**
 * Fetch commit details with Redis caching
 */
async function fetchCommitDetails(
  owner: string,
  repo: string,
  sha: string
): Promise<GitHubCommitDetailResponse | null> {
  // Check Redis cache first
  const cacheKey = getCommitDetailCacheKey(owner, repo, sha);
  const cached = await getCached<GitHubCommitDetailResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from GitHub
  const headers = getGitHubHeaders();

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      { headers }
    );

    if (!response.ok) {
      console.warn('[File City Data] Failed to fetch commit:', response.status);
      return null;
    }

    const commit: GitHubCommitDetailResponse = await response.json();

    // Cache in Redis (commits are immutable)
    setCachedAsync(cacheKey, commit, CACHE_TTL_24H);

    return commit;
  } catch (err) {
    console.warn('[File City Data] Error fetching commit:', err);
    return null;
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const ref = searchParams.get('ref') || 'HEAD';
    const commitSha = searchParams.get('commit');
    const commitsSha = searchParams.get('commits');

    // Parse commit SHAs (support both single 'commit' and multiple 'commits')
    const commitShas: string[] = [];
    if (commitSha) {
      commitShas.push(commitSha);
    }
    if (commitsSha) {
      commitShas.push(...commitsSha.split(',').map(s => s.trim()).filter(Boolean));
    }

    // 1. Fetch GitHub tree (uses same cache as PNG endpoint)
    const tree = await fetchGitHubTree(owner, repo, ref);

    // 2. Convert to file info array
    const files = getFilesFromGitHubTree(tree);

    if (files.length === 0) {
      throw new Error(`No files found in ${owner}/${repo}`);
    }

    // 3. Build file system tree
    const fileTree = buildFileSystemTreeFromFileInfoList(files, tree.sha);

    // 4. Build city layout
    const builder = new CodeCityBuilderWithGrid();
    const cityData = builder.buildCityFromFileSystem(fileTree, '', {
      paddingTop: 2,
      paddingBottom: 2,
      paddingLeft: 2,
      paddingRight: 2,
    });

    // 5. Fetch commit details if requested
    let highlightFiles: Array<{ path: string; status: 'added' | 'modified' | 'removed' }> | undefined;

    if (commitShas.length > 0) {
      // Fetch all commits in parallel
      const commitPromises = commitShas.map(sha => fetchCommitDetails(owner, repo, sha));
      const commitResults = await Promise.all(commitPromises);

      // Merge all changed files (deduplicate by path)
      const fileMap = new Map<string, 'added' | 'modified' | 'removed'>();
      for (const commitDetails of commitResults) {
        if (commitDetails?.files) {
          for (const f of commitDetails.files) {
            const status = f.status === 'added' ? 'added'
              : f.status === 'removed' ? 'removed'
              : 'modified';
            // If file already exists, prefer 'modified' (file touched in multiple commits)
            const existing = fileMap.get(f.filename);
            if (!existing) {
              fileMap.set(f.filename, status);
            } else if (existing !== status) {
              // If same file has different statuses, mark as modified
              fileMap.set(f.filename, 'modified');
            }
          }
        }
      }

      if (fileMap.size > 0) {
        highlightFiles = Array.from(fileMap.entries()).map(([path, status]) => ({ path, status }));
      }
    }

    // 6. Return JSON response
    return NextResponse.json({
      cityData,
      highlightFiles: highlightFiles || [],
      treeSha: tree.sha,
      truncated: tree.truncated || false,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error) {
    console.error('Error generating File City data:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Failed to generate File City data', message },
      { status: 500 }
    );
  }
}
