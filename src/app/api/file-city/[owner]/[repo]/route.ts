/**
 * File City Image Generation API
 *
 * GET /api/file-city/[owner]/[repo] - Generate File City PNG for a repository
 *
 * Query parameters:
 *   - branch: Git branch (default: "main")
 *   - width: Image width (default: 400)
 *   - height: Image height (default: 400)
 *
 * Returns a redirect to the cached S3 image URL.
 * Generates and caches the image on first request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderFileCityPng } from '@/lib/file-city/renderer';
import {
  generateFileCityS3Key,
  checkFileCityCache,
  uploadFileCityImage,
  getFileCityUrl,
} from '@/lib/file-city/s3-cache';

interface RouteParams {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const branch = searchParams.get('branch') || 'main';
    const width = parseInt(searchParams.get('width') || '400', 10);
    const height = parseInt(searchParams.get('height') || '400', 10);

    // Validate dimensions
    const maxDimension = 2000;
    const clampedWidth = Math.min(Math.max(width, 100), maxDimension);
    const clampedHeight = Math.min(Math.max(height, 100), maxDimension);

    // Generate S3 key
    const s3Key = generateFileCityS3Key(owner, repo, clampedWidth, clampedHeight);

    // Check for nocache flag
    const noCache = searchParams.get('nocache') === '1';

    // Check S3 cache (unless nocache is set)
    if (!noCache) {
      const cached = await checkFileCityCache(s3Key);

      if (cached) {
        // Cache hit - redirect to S3 URL
        const url = getFileCityUrl(s3Key);
        console.log('[File City] Cache hit:', { owner, repo, s3Key });
        return NextResponse.redirect(url, 302);
      }
    }

    // Cache miss (or nocache) - generate the image
    console.log('[File City] Cache miss, generating:', { owner, repo, branch });

    const buffer = await renderFileCityPng({
      owner,
      repo,
      branch,
      width: clampedWidth,
      height: clampedHeight,
    });

    // If nocache is set, return the image directly without caching
    // This ensures a fresh image is returned without browser/CDN cache interference
    if (noCache) {
      console.log('[File City] Returning fresh image (nocache):', { owner, repo });
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
    }

    // Upload to S3
    const url = await uploadFileCityImage(s3Key, buffer, {
      owner,
      repo,
      branch,
      width: clampedWidth.toString(),
      height: clampedHeight.toString(),
    });

    console.log('[File City] Cached to S3:', { owner, repo, s3Key });

    // Redirect to the newly cached image
    return NextResponse.redirect(url, 302);
  } catch (error) {
    console.error('Error generating File City image:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Failed to generate File City image', message },
      { status: 500 }
    );
  }
}
