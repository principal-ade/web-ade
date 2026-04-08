/**
 * File City Image Generation API
 *
 * GET /api/file-city/[owner]/[repo] - Generate File City PNG for a repository
 *
 * Query parameters:
 *   - branch: Git branch (default: "HEAD")
 *   - width: Image width (default: 400)
 *   - height: Image height (default: 400)
 *   - commit: Optional single commit SHA to highlight changed files
 *   - commits: Optional comma-separated commit SHAs to highlight (for multi-commit cards)
 *
 * Returns the generated PNG image.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderFileCityPng } from '@/lib/file-city/renderer';
import {
  generateFileCityS3Key,
  uploadFileCityImage,
} from '@/lib/file-city/s3-cache';
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
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WebADE/1.0',
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      { headers }
    );

    if (!response.ok) {
      console.warn('[File City] Failed to fetch commit:', response.status);
      return null;
    }

    const commit: GitHubCommitDetailResponse = await response.json();

    // Cache in Redis (commits are immutable)
    setCachedAsync(cacheKey, commit, CACHE_TTL_24H);

    return commit;
  } catch (err) {
    console.warn('[File City] Error fetching commit:', err);
    return null;
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const branch = searchParams.get('branch') || 'HEAD';
    const width = parseInt(searchParams.get('width') || '400', 10);
    const height = parseInt(searchParams.get('height') || '400', 10);
    const commitSha = searchParams.get('commit');
    const commitsSha = searchParams.get('commits'); // comma-separated SHAs

    // Validate dimensions
    const maxDimension = 2000;
    const clampedWidth = Math.min(Math.max(width, 100), maxDimension);
    const clampedHeight = Math.min(Math.max(height, 100), maxDimension);

    // Parse commit SHAs (support both single 'commit' and multiple 'commits')
    const commitShas: string[] = [];
    if (commitSha) {
      commitShas.push(commitSha);
    }
    if (commitsSha) {
      commitShas.push(...commitsSha.split(',').map(s => s.trim()).filter(Boolean));
    }

    // Generate S3 key (include commits hash if present for unique caching)
    let s3Key: string;
    if (commitShas.length > 0) {
      // For multiple commits, use a hash of all SHAs
      const commitsKey = commitShas.length === 1
        ? commitShas[0]!.slice(0, 7)
        : `multi-${commitShas.length}-${commitShas.map(s => s.slice(0, 4)).join('')}`;
      s3Key = `file-city/${owner}/${repo}/${clampedWidth}x${clampedHeight}-${commitsKey}.png`;
    } else {
      s3Key = generateFileCityS3Key(owner, repo, clampedWidth, clampedHeight);
    }

    // Check for nocache flag
    const noCache = searchParams.get('nocache') === '1';

    // Fetch commit details for all SHAs (for highlight files)
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

    const buffer = await renderFileCityPng({
      owner,
      repo,
      branch,
      width: clampedWidth,
      height: clampedHeight,
      highlightFiles,
    });

    // If nocache is set, return the image directly without caching
    // This ensures a fresh image is returned without browser/CDN cache interference
    if (noCache) {
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
    }

    // Try to upload to S3 for future caching (don't block on failure)
    uploadFileCityImage(s3Key, buffer, {
      owner,
      repo,
      branch,
      width: clampedWidth.toString(),
      height: clampedHeight.toString(),
    }).catch((err) => {
      console.warn('[File City] S3 cache failed (non-blocking):', err);
    });

    // Return the image directly instead of redirecting to S3
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error generating File City image:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Failed to generate File City image', message },
      { status: 500 }
    );
  }
}
