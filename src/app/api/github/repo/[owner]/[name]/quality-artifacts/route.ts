import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { getGitHubToken } from '@/lib/auth/cookies';
import {
  GitHubArtifactService,
  type QualityArtifactResponse,
  type ArtifactInfo,
} from '@/lib/server/GitHubArtifactService';

const gzipAsync = promisify(gzip);

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
 * - full: 'true' to include rawResults (WARNING: can exceed Lambda 6MB limit)
 *
 * By default, rawResults is omitted to keep response under Lambda limits.
 * fileMetrics is always included.
 * Response is gzip compressed when Accept-Encoding includes gzip and response > 100KB.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'latest';

    // Get user's GitHub token from HTTP-only cookie, fall back to server token for public repos
    const userToken = await getGitHubToken();
    const token = userToken || process.env.GITHUB_TOKEN;

    if (!token) {
      return addCorsHeaders(
        NextResponse.json(
          { error: 'No GitHub token available. Please log in or set GITHUB_TOKEN environment variable.' },
          { status: 401 }
        )
      );
    }

    const service = new GitHubArtifactService(token);

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

    // By default, strip rawResults to keep under Lambda 6MB limit
    // Use ?full=true to include rawResults (for debug panel)
    const includeFull = searchParams.get('full') === 'true';
    let responseData = data;

    if (!includeFull && !Array.isArray(data)) {
      // For QualityArtifactResponse, remove rawResults (keeps fileMetrics)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rawResults, ...compactData } = data as QualityArtifactResponse;
      responseData = compactData;
    }

    const jsonString = JSON.stringify(responseData);

    // Check if client accepts gzip
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    const supportsGzip = acceptEncoding.includes('gzip');

    // Gzip compress if supported and response is large (> 100KB)
    if (supportsGzip && jsonString.length > 100 * 1024) {
      const compressed = await gzipAsync(Buffer.from(jsonString));
      const response = new NextResponse(compressed, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Cache-Control': `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${CACHE_DURATION * 2}`,
        },
      });
      return addCorsHeaders(response);
    }

    const response = NextResponse.json(responseData);
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
