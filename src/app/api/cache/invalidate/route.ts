/**
 * POST /api/cache/invalidate
 *
 * Invalidates cached GitHub API data by tag.
 * Requires admin authentication via ADMIN_SECRET env var.
 *
 * Usage:
 *   POST /api/cache/invalidate
 *   Body: { "tags": ["github-commits", "commits:owner/repo"] }
 *
 * Available tags:
 *   - github-api: All GitHub API cache entries
 *   - github-commits: All commit data
 *   - github-repos: All repo info
 *   - github-user: All user-specific data
 *   - github-featured: Featured repos data
 *   - commits:{owner}/{repo}: Specific repo commits
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/github-cache';

export async function POST(request: NextRequest) {
  // Simple admin authentication
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get('Authorization');

  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tags = body.tags as string[] | undefined;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json(
        {
          error: 'Missing tags array',
          availableTags: Object.values(CACHE_TAGS),
        },
        { status: 400 }
      );
    }

    // Invalidate each tag
    const invalidated: string[] = [];
    for (const tag of tags) {
      revalidateTag(tag);
      invalidated.push(tag);
    }

    return NextResponse.json({
      success: true,
      invalidated,
      message: `Invalidated ${invalidated.length} cache tag(s)`,
    });
  } catch (error) {
    console.error('[cache/invalidate] Error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

/**
 * GET /api/cache/invalidate
 *
 * Returns available cache tags for reference
 */
export async function GET() {
  return NextResponse.json({
    availableTags: {
      ...CACHE_TAGS,
      'commits:{owner}/{repo}': 'Specific repo commits (e.g., commits:facebook/react)',
    },
    usage: {
      method: 'POST',
      body: '{ "tags": ["github-commits"] }',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {ADMIN_SECRET}',
      },
    },
  });
}
