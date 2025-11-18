import { NextRequest, NextResponse } from 'next/server';
import { GitHubAlexandria } from '@/lib/server/GitHubAlexandria';

/**
 * GET /api/github/repo/[owner]/[name]/codebase-views
 * Fetch CodebaseViews from a GitHub repository using alexandria-core-library
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const { searchParams } = new URL(request.url);
    const branch = searchParams.get('branch') || 'main';

    const github = new GitHubAlexandria();
    const views = await github.getCodebaseViews(owner, name, branch);

    return NextResponse.json({
      views,
      count: views.length,
    });
  } catch (error: unknown) {
    console.error('[API] Failed to fetch codebase views:', error);

    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return NextResponse.json(
        { error: 'Repository or .alexandria directory not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch codebase views',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
