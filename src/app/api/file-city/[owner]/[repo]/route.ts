/**
 * File City Image Generation API
 *
 * GET /api/file-city/[owner]/[repo] - Generate File City PNG for a repository
 *
 * Query parameters:
 *   - branch: Git branch (default: "main")
 *   - width: Image width (default: 400)
 *   - height: Image height (default: 400)
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderFileCityPng } from '@/lib/file-city/renderer';

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

    // Generate the image
    const buffer = await renderFileCityPng({
      owner,
      repo,
      branch,
      width: clampedWidth,
      height: clampedHeight,
    });

    // Return PNG with caching headers
    // Convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // 1 hour browser cache
        'Content-Length': buffer.length.toString(),
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
