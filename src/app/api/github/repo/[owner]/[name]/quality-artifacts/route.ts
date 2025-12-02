import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getGitHubToken } from '@/lib/auth/cookies';
import {
  GitHubArtifactService,
  type QualityArtifactResponse,
  type ArtifactInfo,
} from '@/lib/server/GitHubArtifactService';

function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, OPTIONS',
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  );
  return response;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}

// Cache duration for artifact data (5 minutes)
const CACHE_DURATION = 300;

/**
 * GET /api/github/repo/[owner]/[name]/quality-artifacts
 *
 * Query parameters:
 * - action: 'list' | 'latest' | 'commit' (default: 'latest')
 * - commit: commit SHA (required when action='commit')
 * - branch: branch name (default: 'main', used when action='latest')
 * - limit: number of artifacts to return (default: 10, used when action='list')
 *
 * Returns quality metrics from GitHub Actions artifacts produced by quality-lens-cli
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'latest';

    // Get user's GitHub token from HTTP-only cookie
    const userToken = await getGitHubToken();

    if (!userToken) {
      return addCorsHeaders(
        NextResponse.json(
          { error: 'Authentication required. Please log in with GitHub.' },
          { status: 401 }
        )
      );
    }

    const service = new GitHubArtifactService(userToken);

    let data: QualityArtifactResponse | ArtifactInfo[] | null;

    switch (action) {
      case 'list': {
        const limit = parseInt(searchParams.get('limit') || '10', 10);

        // Cache the list request
        const cacheKey = `quality-artifacts-list-${owner}-${name}-${limit}`;
        data = await unstable_cache(
          async () => service.listQualityArtifacts(owner, name, { limit }),
          [cacheKey],
          { revalidate: CACHE_DURATION, tags: ['github-artifacts', cacheKey] }
        )();
        break;
      }

      case 'commit': {
        const commit = searchParams.get('commit');
        if (!commit) {
          return addCorsHeaders(
            NextResponse.json(
              { error: 'commit parameter required when action=commit' },
              { status: 400 }
            )
          );
        }

        // Cache by commit SHA (artifacts are immutable per commit)
        const cacheKey = `quality-artifacts-commit-${owner}-${name}-${commit}`;
        data = await unstable_cache(
          async () => service.getQualityMetricsForCommit(owner, name, commit),
          [cacheKey],
          { revalidate: CACHE_DURATION * 2, tags: ['github-artifacts', cacheKey] }
        )();
        break;
      }

      case 'latest':
      default: {
        const branch = searchParams.get('branch') || 'main';

        // Shorter cache for latest since it changes with new commits
        const cacheKey = `quality-artifacts-latest-${owner}-${name}-${branch}`;
        data = await unstable_cache(
          async () => service.getLatestQualityMetrics(owner, name, branch),
          [cacheKey],
          { revalidate: CACHE_DURATION, tags: ['github-artifacts', cacheKey] }
        )();
        break;
      }
    }

    if (data === null) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: 'No quality artifacts found',
            message: 'Run quality-lens-cli in your CI/CD pipeline to generate artifacts',
          },
          { status: 404 }
        )
      );
    }

    const response = NextResponse.json(data);
    response.headers.set(
      'Cache-Control',
      `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${CACHE_DURATION * 2}`
    );

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Quality artifacts API error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('401') || message.includes('403') ? 403 : 500;

    return addCorsHeaders(
      NextResponse.json({ error: message }, { status })
    );
  }
}
