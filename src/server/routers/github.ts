/**
 * GitHub Router
 *
 * Handles GitHub API operations with proper typing and error handling.
 * Migrated from /api/github/* routes for type safety.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';
import { trace } from '@opentelemetry/api';
import { gitTreeCache } from '@/lib/git-tree-cache';
import {
  getTreeFromS3Cache,
  storeTreeInS3Cache,
  storeTreeInS3CacheAsync,
  treeExistsInS3,
  getTreeS3PresignedUrl,
  type GitHubTreeResponse,
} from '@/lib/github-tree-s3-cache';
import {
  getCached,
  setCachedAsync,
  getRefShaCacheKey,
  getTreeCacheKey,
  getTourAvailabilityCacheKey,
} from '@/lib/redis-cache';
import { resolveIdentitiesByEmail } from '@/lib/repo-analysis/identity-cache';
import { mergeRepoIdentityMapInS3 } from '@/lib/repo-analysis/s3-cache';
import { PackageLayerModule } from '@principal-ai/codebase-composition';
import type { FileTree, FileInfo, DirectoryInfo } from '@principal-ai/repository-abstraction';
import { parseTour, type IntroductionTour } from '@principal-ai/file-city-builder';

// Get tracer for GitHub operations
const tracer = trace.getTracer('github-router', '1.0.0');

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Strip GitHub tree entries down to the fields the app actually consumes
 * (`path`, `type`, `size`), dropping the per-entry `mode`, `sha`, and `url`.
 *
 * GitHub's recursive tree for a monorepo like elastic/kibana is ~14.8MB
 * (52k+ entries), most of which is the per-entry `url` and `sha`. That blows
 * past the ~6MB AWS Amplify/Lambda SSR response cap — the client then receives
 * a truncated body and `response.json()` throws "Unexpected end of JSON input"
 * — and past Upstash's max request size, so it never even caches. Slimming
 * cuts kibana to ~5.7MB and lets every cache layer store it. Every consumer of
 * `github.getTree` reads only `path`/`type`/`size` plus the top-level `sha`.
 */
function slimTreeResponse(data: GitHubTreeResponse): GitHubTreeResponse {
  return {
    sha: data.sha,
    url: data.url,
    truncated: data.truncated,
    ...(data.fellBackToDefaultBranch
      ? { fellBackToDefaultBranch: true }
      : {}),
    tree: data.tree.map((e) => ({
      path: e.path,
      type: e.type,
      ...(e.size !== undefined ? { size: e.size } : {}),
    })),
  };
}

/**
 * Resolve `ref` to a commit SHA and guarantee the slimmed tree for that SHA is
 * in S3, fetching from GitHub only on a miss. Shared by `getTreeUrl`, which then
 * presigns the object instead of streaming the tree back through the SSR cap.
 *
 * Mirrors `getTree`'s ref-resolution and 422-fallback semantics: a `ref` that
 * points at a commit GitHub never received (an unpushed/GC'd trail SHA) answers
 * git/trees with 422, so we fall back to the repo's default branch — except for
 * a plain `HEAD` request, where a 422 is a real error worth surfacing.
 */
async function ensureTreeInS3(
  owner: string,
  repo: string,
  ref: string,
  userToken: string | null
): Promise<{ sha: string; fellBackToDefaultBranch: boolean }> {
  // Resolve ref -> commit SHA (Redis-cached), as in github.getTree.
  let resolvedSha: string;
  const refCacheKey = getRefShaCacheKey(owner, repo, ref);
  const cachedSha = await getCached<string>(refCacheKey);
  if (cachedSha) {
    resolvedSha = cachedSha;
  } else {
    try {
      const refData = await makeGitHubRequest<{ sha: string }>(
        `/repos/${owner}/${repo}/commits/${ref}`,
        userToken
      );
      resolvedSha = refData.sha;
      // A branch/HEAD ref is mutable — keep this short so a new commit is picked
      // up within ~1 min (content reads keyed by the resolved SHA are immutable
      // and cached hard downstream). A full-SHA ref is immutable: cache a day.
      setCachedAsync(
        refCacheKey,
        resolvedSha,
        /^[0-9a-f]{40}$/i.test(ref) ? 86400 : 60,
      );
    } catch {
      resolvedSha = ref;
    }
  }

  let fellBackToDefaultBranch = false;

  // Warm object: the SHA-keyed tree is already cached — nothing to fetch.
  if (await treeExistsInS3(owner, repo, resolvedSha)) {
    return { sha: resolvedSha, fellBackToDefaultBranch };
  }

  let treeData: GitHubTreeResponse;
  try {
    treeData = await makeGitHubRequest<GitHubTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${resolvedSha}?recursive=1`,
      userToken
    );
  } catch (err) {
    if (ref === 'HEAD') throw err;
    // Fall back to the default branch for a missing/unpushed ref.
    const headData = await makeGitHubRequest<{ sha: string }>(
      `/repos/${owner}/${repo}/commits/HEAD`,
      userToken
    );
    resolvedSha = headData.sha;
    fellBackToDefaultBranch = true;
    if (await treeExistsInS3(owner, repo, resolvedSha)) {
      return { sha: resolvedSha, fellBackToDefaultBranch };
    }
    treeData = await makeGitHubRequest<GitHubTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${resolvedSha}?recursive=1`,
      userToken
    );
  }

  // Slim before storing so the object the client fetches carries the reduced
  // shape (same as github.getTree). Awaited so the object exists before we
  // presign it.
  await storeTreeInS3Cache(owner, repo, resolvedSha, slimTreeResponse(treeData));
  return { sha: resolvedSha, fellBackToDefaultBranch };
}

/**
 * Get cache key for user profile
 */
function getUserProfileCacheKey(login: string): string {
  return `github:user-profile:${login.toLowerCase()}`;
}

/**
 * Get cached user profile data
 */
async function getCachedUserProfile(login: string): Promise<{ login: string; name: string | null; avatar_url: string } | null> {
  const cacheKey = getUserProfileCacheKey(login);
  return await getCached<{ login: string; name: string | null; avatar_url: string }>(cacheKey);
}

// ============================================================================
// Input Schemas
// ============================================================================

const readFileInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().min(1),
  ref: z.string().optional(),
});

const getTreeInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  ref: z.string().optional().default('HEAD'),
});

const getRepoInfoInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

// ============================================================================
// Output Schemas
// ============================================================================

const readFileOutputSchema = z.object({
  content: z.string(),
  sha: z.string(),
  size: z.number(),
  encoding: z.string(),
});

const treeEntrySchema = z.object({
  path: z.string(),
  // mode/sha/url are stripped by slimTreeResponse before this schema runs — see
  // its comment. Optional so both the raw GitHub shape and the slimmed one pass.
  mode: z.string().optional(),
  type: z.enum(['blob', 'tree', 'commit']), // 'commit' = git submodule
  sha: z.string().optional(),
  size: z.number().optional(),
  url: z.string().optional(), // Optional for submodules
});

const getTreeOutputSchema = z.object({
  sha: z.string(),
  url: z.string(),
  tree: z.array(treeEntrySchema),
  truncated: z.boolean(),
  // True when the requested ref was missing on GitHub (e.g. an unpushed trail
  // commit) and we fell back to the repo's default branch.
  fellBackToDefaultBranch: z.boolean().optional(),
});

// `github.getTreeUrl` hands back a presigned S3 URL instead of the tree itself,
// so the client fetches the (potentially multi-MB) tree straight from S3 —
// bypassing the ~6MB SSR response cap. See `getTreeUrl` and `slimTreeResponse`.
const getTreeUrlOutputSchema = z.object({
  sha: z.string(),
  url: z.string(),
  fellBackToDefaultBranch: z.boolean().optional(),
});

const repoInfoOutputSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string(),
    type: z.string(),
  }),
  html_url: z.string(),
  description: z.string().nullable(),
  fork: z.boolean(),
  parent: z.object({
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      avatar_url: z.string(),
    }),
    name: z.string(),
  }).optional(),
  url: z.string(),
  clone_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  homepage: z.string().nullable(),
  size: z.number(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  language: z.string().nullable(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  default_branch: z.string(),
  topics: z.array(z.string()),
  visibility: z.string(),
  license: z.object({
    key: z.string(),
    name: z.string(),
    spdx_id: z.string(),
  }).nullable().optional(),
});

const repoContributorsOutputSchema = z.object({
  // Pre-sorted by commit count (GitHub's default order), bots filtered out.
  contributors: z.array(
    z.object({
      login: z.string(),
      id: z.number(),
      avatar_url: z.string(),
      html_url: z.string(),
      contributions: z.number(),
    }),
  ),
  // True when GitHub reported more contributors than we fetched (capped at 100),
  // so the UI can show a "+ many" affordance honestly.
  truncated: z.boolean(),
});

// ============================================================================
// Helpers
// ============================================================================

const MAX_CONCURRENT_REQUESTS = 5;

// Simple concurrency limiter
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

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit'; // 'commit' = git submodule
  sha: string;
  size?: number;
  url?: string; // Optional for submodules
}

interface GitHubTreeResponseRaw {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

function buildFileTree(
  tree: GitHubTreeResponseRaw,
  owner: string,
  name: string
): FileTree {
  // Strip external package reference directories (e.g. .repos/) so
  // PackageLayerModule doesn't pick up their manifests as repo packages.
  const EXCLUDED_PREFIXES = ['.repos/'];
  const filteredTree = tree.tree.filter(
    (item) => !EXCLUDED_PREFIXES.some((p) => item.path.startsWith(p)),
  );

  // Extract all files (blobs)
  const allFiles: FileInfo[] = filteredTree
    .filter((item) => item.type === 'blob')
    .map((item) => {
      const pathParts = item.path.split('/');
      const fileName = pathParts[pathParts.length - 1] ?? item.path;
      const extension = fileName.includes('.') ? (fileName.split('.').pop() ?? '') : '';

      return {
        path: `/${item.path}`,
        name: fileName,
        extension,
        size: item.size || 0,
        lastModified: new Date(),
        isDirectory: false,
        relativePath: item.path,
      };
    });

  // Build directory structure
  const dirMap = new Map<string, DirectoryInfo>();

  // Create directories from tree items
  filteredTree
    .filter((item) => item.type === 'tree')
    .forEach((item) => {
      const pathParts = item.path.split('/');
      const dirName = pathParts[pathParts.length - 1] ?? item.path;

      dirMap.set(item.path, {
        path: `/${item.path}`,
        name: dirName,
        children: [],
        fileCount: 0,
        totalSize: 0,
        depth: pathParts.length,
        relativePath: item.path,
      });
    });

  // Create implicit parent directories for files
  allFiles.forEach((file) => {
    const pathParts = file.relativePath.split('/');
    let currentPath = '';

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!dirMap.has(currentPath)) {
        dirMap.set(currentPath, {
          path: `/${currentPath}`,
          name: part,
          children: [],
          fileCount: 0,
          totalSize: 0,
          depth: i + 1,
          relativePath: currentPath,
        });
      }
    }
  });

  const allDirectories = Array.from(dirMap.values());
  let maxDepth = 0;
  let totalSize = 0;

  // Assign files to parent directories
  allFiles.forEach((file) => {
    const pathParts = file.relativePath.split('/');
    if (pathParts.length > 1) {
      const parentPath = pathParts.slice(0, -1).join('/');
      const parentDir = dirMap.get(parentPath);
      if (parentDir) {
        parentDir.children.push(file);
        parentDir.fileCount++;
        parentDir.totalSize += file.size;
      }
    }
    totalSize += file.size;
  });

  // Assign subdirectories to parent directories
  allDirectories.forEach((dir) => {
    maxDepth = Math.max(maxDepth, dir.depth);
    const pathParts = dir.relativePath.split('/');

    if (pathParts.length > 1) {
      const parentPath = pathParts.slice(0, -1).join('/');
      const parentDir = dirMap.get(parentPath);
      if (parentDir) {
        parentDir.children.push(dir);
      }
    }
  });

  // Build root directory
  const rootChildren: (FileInfo | DirectoryInfo)[] = [];

  allFiles.forEach((file) => {
    if (!file.relativePath.includes('/')) {
      rootChildren.push(file);
    }
  });

  allDirectories.forEach((dir) => {
    if (!dir.relativePath.includes('/')) {
      rootChildren.push(dir);
    }
  });

  const rootDir: DirectoryInfo = {
    path: `/${owner}/${name}`,
    name: name,
    children: rootChildren,
    fileCount: allFiles.length,
    totalSize,
    depth: 0,
    relativePath: '',
  };

  return {
    sha: tree.sha,
    root: rootDir,
    allFiles,
    allDirectories,
    stats: {
      totalFiles: allFiles.length,
      totalDirectories: allDirectories.length,
      totalSize,
      maxDepth,
    },
    metadata: {
      id: `github:${owner}/${name}:${tree.sha}`,
      timestamp: new Date(),
      sourceType: 'github',
      sourceSha: tree.sha,
      sourceInfo: {
        owner,
        name,
        provider: 'github',
      },
    },
  };
}

async function getGitHubToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub token from Bearer header or cookies
 * Used for mobile-friendly endpoints that accept both auth methods
 */
async function getGitHubTokenFromHeadersOrCookies(): Promise<string | null> {
  try {
    // Dynamic import to avoid issues in non-request contexts
    const { headers } = await import('next/headers');
    const headerStore = await headers();

    // Check for Bearer token in Authorization header
    const authHeader = headerStore.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7); // Remove 'Bearer ' prefix
    }

    // Fall back to cookies
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

async function makeGitHubRequest<T>(
  endpoint: string,
  userToken?: string | null
): Promise<T> {
  const token = userToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CodeCity-App/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `GitHub resource not found: ${endpoint}`,
      });
    }
    if (response.status === 401) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'GitHub authentication failed',
      });
    }
    if (response.status === 403) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'GitHub rate limit exceeded or access denied',
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `GitHub API error: ${response.status} ${response.statusText}`,
    });
  }

  // Handle empty responses (e.g., 204 No Content or empty body)
  const text = await response.text();
  if (!text || text.trim() === '') {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `GitHub API returned empty response for: ${endpoint}`,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to parse GitHub API response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`,
    });
  }
}

// ============================================================================
// Router Definition
// ============================================================================

// Schema for featured repos response
const featuredRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  stargazers_count: z.number(),
  language: z.string().nullable(),
  license: z.object({
    spdx_id: z.string(),
  }).nullable().optional(),
  topics: z.array(z.string()).optional(),
  html_url: z.string(),
  created_at: z.string().optional(),
  forkOwner: z.string().optional(),
  forkName: z.string().optional(),
});

const getFeaturedReposOutputSchema = z.array(featuredRepoSchema);

// Schema for tour availability check
const checkTourAvailabilityInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const tourAvailabilitySchema = z.object({
  hasTour: z.boolean(),
  tourPath: z.string().nullable(),
  forkOwner: z.string().nullable(),
  forkRepo: z.string().nullable(),
  cached: z.boolean(),
});

// Organizations that host tour forks (lowercase for case-insensitive comparison)
const TOUR_ORGS = ['principal-forks', 'telementry-test', 'thekicker25', 'x-file-city'];
const TOUR_PATH = 'docs/tours/introduction.tour.json'; // Fallback for direct API checks
const TOUR_AVAILABILITY_TTL = 86400; // 24 hours

// Schema for caching a detected tour
const cacheTourAvailabilityInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  tourPath: z.string().min(1),
  tourId: z.string().optional(),
  tourName: z.string().optional(),
});

// ============================================================================
// Suggestion & Search Schemas
// ============================================================================

const suggestedUserSchema = z.object({
  login: z.string(),
  avatar_url: z.string(),
  name: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  source: z.enum(['following', 'org']),
  orgName: z.string().optional(),
});

const getSuggestedUsersOutputSchema = z.object({
  users: z.array(suggestedUserSchema),
});

const suggestedRepoSchema = z.object({
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable().optional(),
  stargazers_count: z.number(),
  language: z.string().nullable().optional(),
  source: z.enum(['starred', 'org']),
  orgName: z.string().optional(),
});

const getSuggestedReposOutputSchema = z.object({
  repos: z.array(suggestedRepoSchema),
});

const searchInputSchema = z.object({
  query: z.string().min(1),
  perPage: z.number().min(1).max(30).optional().default(10),
});

const searchUsersOutputSchema = z.object({
  users: z.array(
    z.object({
      login: z.string(),
      avatar_url: z.string(),
      type: z.enum(['User', 'Organization']),
      name: z.string().nullable().optional(), // Enriched from cache if available
    })
  ),
  total_count: z.number(),
});

const searchReposOutputSchema = z.object({
  repos: z.array(
    z.object({
      owner: z.string(),
      name: z.string(),
      full_name: z.string(),
      description: z.string().nullable().optional(),
      stargazers_count: z.number(),
      language: z.string().nullable().optional(),
      owner_avatar_url: z.string(),
    })
  ),
  total_count: z.number(),
});

const repoWithTourSchema = z.object({
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable().optional(),
  stargazers_count: z.number(),
  language: z.string().nullable().optional(),
  owner_avatar_url: z.string(),
  forkOwner: z.string(), // The tour org that has the fork
  forkRepo: z.string(), // The fork repo name
  tourPath: z.string(), // Path to tour file
});

const getReposWithToursOutputSchema = z.object({
  repos: z.array(repoWithTourSchema),
  cached: z.boolean(),
});

export const githubRouter = router({
  /**
   * Read a file from a GitHub repository
   * Returns decoded content (handles base64 decoding automatically)
   */
  readFile: publicProcedure
    .input(readFileInputSchema)
    .output(readFileOutputSchema)
    .query(async ({ input }) => {
      const { owner, repo, path, ref } = input;

      const userToken = await getGitHubToken();

      // Build endpoint with optional ref
      let endpoint = `/repos/${owner}/${repo}/contents/${path}`;
      if (ref) {
        endpoint += `?ref=${encodeURIComponent(ref)}`;
      }

      interface GitHubFileResponse {
        content: string;
        encoding: string;
        sha: string;
        size: number;
      }

      const data = await makeGitHubRequest<GitHubFileResponse>(
        endpoint,
        userToken
      );

      // Decode base64 content
      let content = data.content;
      if (data.encoding === 'base64') {
        // Remove newlines that GitHub adds and decode
        content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      }

      return {
        content,
        sha: data.sha,
        size: data.size,
        encoding: 'utf-8', // Always return decoded content
      };
    }),

  /**
   * Get the file tree for a GitHub repository
   * Returns the recursive tree structure with multi-layer caching
   *
   * Cache strategy (in order of speed):
   * 1. In-memory cache (~0ms) - warm Lambda instances
   * 2. Redis cache (~5-10ms) - shared across Lambda instances, 20 min TTL
   * 3. S3 cache (~50ms) - persists across Lambda invocations, 7 day TTL
   * 4. GitHub API (500-3000ms) - source of truth
   *
   * Also caches ref→SHA mapping in Redis (20 min TTL) to avoid GitHub API calls
   */
  getTree: publicProcedure
    .input(getTreeInputSchema)
    .output(getTreeOutputSchema)
    .query(async ({ input }) => {
      const { owner, repo, ref } = input;

      return tracer.startActiveSpan('repo.file-tree.load', async (span) => {
        const startTime = Date.now();

        span.setAttribute('repo.owner', owner);
        span.setAttribute('repo.name', repo);
        span.setAttribute('repo.ref', ref);

        try {
          const userToken = await getGitHubTokenFromHeadersOrCookies();

          // 1. Check in-memory cache first (fastest)
          const memCacheKey = `${owner}/${repo}/${ref}`;
          const cachedTree = gitTreeCache.get<GitHubTreeResponse>(memCacheKey);
          if (cachedTree) {
            span.addEvent('repo.file-tree.cache.hit', {
              'cache.key': memCacheKey,
              'cache.type': 'memory',
              'tree.fileCount': cachedTree.tree.length,
            });
            span.setAttribute('cache.hit', true);
            span.setAttribute('cache.type', 'memory');
            span.end();
            return cachedTree;
          }

          // 2. Resolve ref to actual commit SHA (check Redis first)
          let resolvedSha: string;
          const refCacheKey = getRefShaCacheKey(owner, repo, ref);
          const cachedSha = await getCached<string>(refCacheKey);

          if (cachedSha) {
            resolvedSha = cachedSha;
            span.addEvent('repo.ref.cache.hit', { 'cache.type': 'redis' });
          } else {
            try {
              interface GitHubCommitResponse {
                sha: string;
              }
              const refData = await makeGitHubRequest<GitHubCommitResponse>(
                `/repos/${owner}/${repo}/commits/${ref}`,
                userToken
              );
              resolvedSha = refData.sha;
              // Mutable branch/HEAD ref: short TTL so new commits appear within
              // ~1 min. Immutable full-SHA ref: cache for a day.
              setCachedAsync(
                refCacheKey,
                resolvedSha,
                /^[0-9a-f]{40}$/i.test(ref) ? 86400 : 60,
              );
            } catch {
              resolvedSha = ref;
            }
          }

          // 3. Check in-memory cache with resolved SHA
          const shaCacheKey = `${owner}/${repo}/${resolvedSha}`;
          const cachedBySha = gitTreeCache.get<GitHubTreeResponse>(shaCacheKey);
          if (cachedBySha) {
            gitTreeCache.set(memCacheKey, cachedBySha);
            span.addEvent('repo.file-tree.cache.hit', {
              'cache.key': shaCacheKey,
              'cache.type': 'memory-sha',
              'tree.fileCount': cachedBySha.tree.length,
            });
            span.setAttribute('cache.hit', true);
            span.setAttribute('cache.type', 'memory-sha');
            span.end();
            return cachedBySha;
          }

          // 4. Check Redis cache (faster than S3, shared across Lambdas)
          const treeCacheKey = getTreeCacheKey(owner, repo, resolvedSha);
          const redisRaw = await getCached<GitHubTreeResponse>(treeCacheKey);
          if (redisRaw) {
            // Slim on read: entries written before slimming shipped (or by an
            // older deploy) may still be the full shape. This also keeps the
            // in-memory copies we seed below slim.
            const redisCached = slimTreeResponse(redisRaw);
            gitTreeCache.set(shaCacheKey, redisCached);
            gitTreeCache.set(memCacheKey, redisCached);

            const durationMs = Date.now() - startTime;
            span.addEvent('repo.file-tree.cache.hit', {
              'cache.key': treeCacheKey,
              'cache.type': 'redis',
              'tree.fileCount': redisCached.tree.length,
              'durationMs': durationMs,
            });
            span.setAttribute('cache.hit', true);
            span.setAttribute('cache.type', 'redis');
            span.end();
            return redisCached;
          }

          // 5. Check S3 cache (persists across Lambda invocations)
          const s3Raw = await getTreeFromS3Cache(owner, repo, resolvedSha);
          if (s3Raw) {
            // Slim on read too: entries cached before slimming shipped are still
            // the full ~14.8MB shape, which would break the response all over.
            const s3Cached = slimTreeResponse(s3Raw);
            // Store in memory and Redis for subsequent requests
            gitTreeCache.set(shaCacheKey, s3Cached);
            gitTreeCache.set(memCacheKey, s3Cached);
            setCachedAsync(treeCacheKey, s3Cached, 1200); // 20 min in Redis

            const durationMs = Date.now() - startTime;
            span.addEvent('repo.file-tree.cache.hit', {
              'cache.key': shaCacheKey,
              'cache.type': 's3',
              'tree.fileCount': s3Cached.tree.length,
              'durationMs': durationMs,
            });
            span.setAttribute('cache.hit', true);
            span.setAttribute('cache.type', 's3');
            span.end();
            return s3Cached;
          }

          // 6. Fetch from GitHub API (slowest)
          let treeData: GitHubTreeResponse;
          let fellBackToDefaultBranch = false;
          try {
            treeData = await makeGitHubRequest<GitHubTreeResponse>(
              `/repos/${owner}/${repo}/git/trees/${resolvedSha}?recursive=1`,
              userToken
            );
          } catch (err) {
            // The requested ref can point at a commit that never reached
            // GitHub — an author published a trail against a local commit they
            // hadn't pushed (or it was later rebased/GC'd away). GitHub answers
            // git/trees for such a SHA with 422 ("SHA must identify a commit or
            // a tree"). Rather than fail the whole trail, fall back to the
            // repo's default branch so it still renders; markers may have
            // drifted a few lines, which the client surfaces to the viewer.
            if (ref === 'HEAD') throw err;

            span.addEvent('repo.file-tree.ref.fallback', {
              'requested.ref': ref,
              'error.message': err instanceof Error ? err.message : String(err),
            });

            interface GitHubCommitResponse {
              sha: string;
            }
            const headData = await makeGitHubRequest<GitHubCommitResponse>(
              `/repos/${owner}/${repo}/commits/HEAD`,
              userToken
            );
            resolvedSha = headData.sha;
            treeData = await makeGitHubRequest<GitHubTreeResponse>(
              `/repos/${owner}/${repo}/git/trees/${resolvedSha}?recursive=1`,
              userToken
            );
            fellBackToDefaultBranch = true;
          }

          // Slim before caching/returning so every cache layer (memory, Redis,
          // S3) and the wire payload carry the reduced shape.
          treeData = slimTreeResponse(treeData);

          // Store in all caches. The fellBackToDefaultBranch flag is scoped to
          // the requested ref, so it only rides along on the ref-keyed entry —
          // the SHA-keyed / Redis / S3 entries are keyed by the real default
          // SHA and shared with legitimate HEAD requests, which must not see
          // the drift warning.
          if (treeData && treeData.sha) {
            // In-memory (sync)
            gitTreeCache.set(shaCacheKey, treeData);
            gitTreeCache.set(treeData.sha, treeData);

            // Redis (async - faster cross-Lambda access)
            setCachedAsync(treeCacheKey, treeData, 1200); // 20 min

            // S3 (async - long-term persistence)
            storeTreeInS3CacheAsync(owner, repo, resolvedSha, treeData);

            gitTreeCache.set(
              memCacheKey,
              fellBackToDefaultBranch
                ? { ...treeData, fellBackToDefaultBranch: true }
                : treeData
            );
          }

          if (fellBackToDefaultBranch && treeData) {
            treeData = { ...treeData, fellBackToDefaultBranch: true };
          }

          const durationMs = Date.now() - startTime;
          span.addEvent('repo.file-tree.fetch.complete', {
            'tree.sha': treeData.sha,
            'tree.fileCount': treeData.tree.length,
            'tree.truncated': treeData.truncated,
            'durationMs': durationMs,
          });

          span.setAttribute('tree.fileCount', treeData.tree.length);
          span.setAttribute('cache.hit', false);
          span.end();
          return treeData;
        } catch (error) {
          span.addEvent('repo.file-tree.error', {
            'error.message': error instanceof Error ? error.message : String(error),
          });
          span.end();
          throw error;
        }
      });
    }),

  /**
   * Get a presigned S3 URL for the repository's file tree.
   *
   * `getTree` streams the whole tree back through the tRPC/SSR response, which
   * caps at ~6MB on Amplify/Lambda — a monorepo like elastic/kibana (~14.8MB
   * raw, ~5.7MB slimmed) truncates and the client's JSON parse throws, surfacing
   * "This repository is too large to load right now." This procedure instead
   * ensures the slimmed tree is in S3 and returns a short-lived presigned GET
   * URL, so the client fetches the tree directly from S3 with no size cap.
   */
  getTreeUrl: publicProcedure
    .input(getTreeInputSchema)
    .output(getTreeUrlOutputSchema)
    .query(async ({ input }) => {
      const { owner, repo, ref } = input;

      return tracer.startActiveSpan('repo.file-tree.url', async (span) => {
        span.setAttribute('repo.owner', owner);
        span.setAttribute('repo.name', repo);
        span.setAttribute('repo.ref', ref);
        try {
          const userToken = await getGitHubTokenFromHeadersOrCookies();
          const { sha, fellBackToDefaultBranch } = await ensureTreeInS3(
            owner,
            repo,
            ref,
            userToken
          );
          const url = await getTreeS3PresignedUrl(owner, repo, sha);

          span.setAttribute('tree.sha', sha);
          span.setAttribute('tree.fellBackToDefaultBranch', fellBackToDefaultBranch);
          span.end();
          return {
            sha,
            url,
            ...(fellBackToDefaultBranch
              ? { fellBackToDefaultBranch: true }
              : {}),
          };
        } catch (error) {
          span.addEvent('repo.file-tree.url.error', {
            'error.message':
              error instanceof Error ? error.message : String(error),
          });
          span.end();
          throw error;
        }
      });
    }),

  /**
   * Get repository info (metadata, stars, description, etc.)
   */
  getRepoInfo: publicProcedure
    .input(getRepoInfoInputSchema)
    .output(repoInfoOutputSchema)
    .query(async ({ input }) => {
      const { owner, repo } = input;
      const userToken = await getGitHubToken();

      interface GitHubRepoInfoResponse {
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        owner: {
          login: string;
          id: number;
          avatar_url: string;
          type: string;
        };
        html_url: string;
        description: string | null;
        fork: boolean;
        parent?: {
          full_name: string;
          owner: {
            login: string;
            avatar_url: string;
          };
          name: string;
        };
        url: string;
        clone_url: string;
        created_at: string;
        updated_at: string;
        pushed_at: string;
        homepage: string | null;
        size: number;
        stargazers_count: number;
        watchers_count: number;
        language: string | null;
        forks_count: number;
        open_issues_count: number;
        default_branch: string;
        topics: string[];
        visibility: string;
        license?: {
          key: string;
          name: string;
          spdx_id: string;
        } | null;
      }

      return makeGitHubRequest<GitHubRepoInfoResponse>(
        `/repos/${owner}/${repo}`,
        userToken
      );
    }),

  /**
   * Get a repository's contributors, pre-sorted by commit count. Capped at the
   * first page (100) — enough for the avatar row + "all contributors" modal,
   * and avoids paginating through thousands on large repos.
   *
   * Soft-fails on GitHub 403/rate-limit/access errors: returns an empty list
   * (HTTP 200) instead of tRPC FORBIDDEN. Mega-repos (torvalds/linux) and
   * shared-token rate limits hit this often; the About row already falls back
   * to repo-analysis top owners when this list is empty.
   */
  getRepoContributors: publicProcedure
    .input(getRepoInfoInputSchema) // Same owner/repo input as getRepoInfo
    .output(repoContributorsOutputSchema)
    .query(async ({ input }) => {
      const { owner, repo } = input;
      const userToken = await getGitHubToken();

      interface GitHubContributorResponse {
        login: string;
        id: number;
        avatar_url: string;
        html_url: string;
        type: string;
        contributions: number;
      }

      const PER_PAGE = 100;
      let raw: GitHubContributorResponse[];
      try {
        raw = await makeGitHubRequest<GitHubContributorResponse[]>(
          `/repos/${owner}/${repo}/contributors?per_page=${PER_PAGE}`,
          userToken
        );
      } catch (err) {
        // Rate limit / access denied / transient GitHub errors — don't surface
        // as a red 403 in the browser Network tab; callers treat empty as
        // "use analysis fallback."
        if (
          err instanceof TRPCError &&
          (err.code === 'FORBIDDEN' ||
            err.code === 'UNAUTHORIZED' ||
            err.code === 'NOT_FOUND' ||
            err.code === 'INTERNAL_SERVER_ERROR')
        ) {
          console.warn(
            `[getRepoContributors] GitHub unavailable for ${owner}/${repo}: ${err.message}`,
          );
          return { contributors: [], truncated: false };
        }
        throw err;
      }

      // Drop bot accounts (e.g. dependabot[bot]) so the row reflects people.
      const contributors = raw
        .filter((c) => c.type !== 'Bot' && !c.login.endsWith('[bot]'))
        .map((c) => ({
          login: c.login,
          id: c.id,
          avatar_url: c.avatar_url,
          html_url: c.html_url,
          contributions: c.contributions,
        }));

      return { contributors, truncated: raw.length >= PER_PAGE };
    }),

  /**
   * Resolve commit emails → the GitHub account that authored them.
   *
   * The contributor list is built from the blame map (emails), and we overlay a
   * GitHub avatar/login where one exists. GitHub already links a commit email to
   * whatever account has it verified, so we read that link back: `GET /commits?
   * author={email}` returns commits by that email, each with a top-level `author`
   * (the linked account, or null when unattributed). One request per email.
   *
   * Only called for emails we can't decode locally (noreply emails embed the
   * login/id already), so the call set is small. Cached per email — including
   * negative results, so an unattributed email isn't re-queried each visit.
   */
  getCommitAuthorsByEmail: publicProcedure
    .input(
      z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        emails: z.array(z.string().min(1)).max(80),
      })
    )
    .query(async ({ input }) => {
      const { owner, repo, emails } = input;
      const userToken = await getGitHubToken();

      // Resolve against the account-global Redis cache (shared across repos and
      // reloads), GitHub for true misses. See identity-cache.ts.
      const out = await resolveIdentitiesByEmail(owner, repo, emails, userToken);

      // Persist what we just resolved into the repo's S3 identity map so the GET
      // route can embed it next visit — turning this client fan-out into a
      // one-time warm. Awaited (not fire-and-forget) so it actually lands before
      // the serverless handler freezes; ~one S3 read+write on top of a resolve
      // the client is already awaiting. No-ops when nothing new resolved.
      await mergeRepoIdentityMapInS3(owner, repo, out);

      return out;
    }),

  /**
   * Get packages for a repository (detects monorepos, dependencies, etc.)
   */
  getRepoPackages: publicProcedure
    .input(getRepoInfoInputSchema) // Same input as getRepoInfo
    .query(async ({ input }) => {
      const { owner, repo } = input;
      const userToken = await getGitHubToken();

      try {
        // Fetch the repository tree
        const treeData = await makeGitHubRequest<GitHubTreeResponseRaw>(
          `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
          userToken
        );

        // For very large repos, GitHub truncates the tree - return empty packages
        if (treeData.truncated) {
          console.warn(`[getRepoPackages] Tree truncated for ${owner}/${repo}, skipping package discovery`);
          return {
            packages: [],
            summary: {
              isMonorepo: false,
              rootPackageName: undefined,
              totalPackages: 0,
              workspacePackages: [],
              totalDependencies: 0,
              totalDevDependencies: 0,
              availableScripts: [],
              truncated: true,
            },
            treeSha: treeData.sha,
          };
        }

        // Build FileTree structure
        const fileTree = buildFileTree(treeData, owner, repo);

        // Create a file reader that fetches from GitHub with concurrency limiting
        const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
        const fileReader = async (filePath: string): Promise<string> => {
          // Normalize path (remove leading slash if present)
          const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

          return limit(async () => {
            interface GitHubFileContent {
              content: string;
              encoding: string;
            }

            const fileData = await makeGitHubRequest<GitHubFileContent>(
              `/repos/${owner}/${repo}/contents/${normalizedPath}`,
              userToken
            );

            if (fileData.content && fileData.encoding === 'base64') {
              return Buffer.from(fileData.content, 'base64').toString('utf-8');
            }

            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Unable to read file: ${filePath}`,
            });
          });
        };

        // Use PackageLayerModule to discover packages
        const packageModule = new PackageLayerModule();
        const packages = await packageModule.discoverPackages(fileTree, fileReader);

        // Calculate summary
        const summary = {
          isMonorepo: packages.some(p => p.packageData?.isMonorepoRoot) || packages.length > 1,
          rootPackageName: packages.find(p => p.packageData?.isMonorepoRoot)?.packageData?.name,
          totalPackages: packages.length,
          workspacePackages: packages
            .filter(p => p.packageData?.isWorkspace)
            .map(p => ({
              name: p.packageData?.name,
              path: p.packageData?.path,
            })),
          totalDependencies: packages.reduce(
            (sum, p) => sum + Object.keys(p.packageData?.dependencies || {}).length,
            0
          ),
          totalDevDependencies: packages.reduce(
            (sum, p) => sum + Object.keys(p.packageData?.devDependencies || {}).length,
            0
          ),
          availableScripts: [
            ...new Set(
              packages.flatMap(p =>
                (p.packageData?.availableCommands || []).map(c => c.name)
              )
            ),
          ],
        };

        return {
          packages,
          summary,
          treeSha: treeData.sha,
        };
      } catch (error) {
        // For any error (timeout, rate limit, etc.), return empty packages gracefully
        console.error(`[getRepoPackages] Error fetching packages for ${owner}/${repo}:`, error);
        return {
          packages: [],
          summary: {
            isMonorepo: false,
            rootPackageName: undefined,
            totalPackages: 0,
            workspacePackages: [],
            totalDependencies: 0,
            totalDevDependencies: 0,
            availableScripts: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          treeSha: undefined,
        };
      }
    }),

  /**
   * Check if a repository has a tour available
   *
   * For tour org forks: checks if tour exists and caches under parent repo
   * For any repo: checks cache to see if a tour is available from a fork
   */
  checkTourAvailability: publicProcedure
    .input(checkTourAvailabilityInputSchema)
    .output(tourAvailabilitySchema)
    .query(async ({ input }) => {
      const { owner, repo } = input;
      const userToken = await getGitHubToken();
      const isTourOrg = TOUR_ORGS.includes(owner.toLowerCase());

      console.log(`[checkTourAvailability] Checking ${owner}/${repo}, isTourOrg=${isTourOrg}`);

      // If viewing a tour org fork, check if it has a tour and cache under parent
      if (isTourOrg) {
        // Check if tour file exists via HEAD request to raw.githubusercontent.com
        try {
          // First get repo info to find default branch
          const repoInfo = await makeGitHubRequest<{
            default_branch: string;
            fork: boolean;
            parent?: {
              owner: { login: string };
              name: string;
              full_name: string;
            };
          }>(`/repos/${owner}/${repo}`, userToken);

          const branch = repoInfo.default_branch || 'main';
          const tourUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${TOUR_PATH}`;

          console.log(`[checkTourAvailability] Checking tour URL: ${tourUrl}`);
          const response = await fetch(tourUrl, { method: 'HEAD' });
          const hasTour = response.ok;
          console.log(`[checkTourAvailability] Tour exists: ${hasTour}, fork: ${repoInfo.fork}, hasParent: ${!!repoInfo.parent}`);

          // If tour exists and repo is a fork, cache under parent
          if (hasTour && repoInfo.fork && repoInfo.parent) {
            const parentOwner = repoInfo.parent.owner.login;
            const parentRepo = repoInfo.parent.name;
            const cacheKey = getTourAvailabilityCacheKey(parentOwner, parentRepo);

            console.log(`[checkTourAvailability] Caching tour for parent ${parentOwner}/${parentRepo} under key: ${cacheKey}`);
            setCachedAsync(cacheKey, {
              hasTour: true,
              tourPath: TOUR_PATH,
              forkOwner: owner,
              forkRepo: repo,
              checkedAt: new Date().toISOString(),
            }, TOUR_AVAILABILITY_TTL);
          }

          // Return tour availability (even if we couldn't cache it)
          return {
            hasTour,
            tourPath: hasTour ? TOUR_PATH : null,
            forkOwner: hasTour ? owner : null,
            forkRepo: hasTour ? repo : null,
            cached: false,
          };
        } catch (error) {
          console.error(`[checkTourAvailability] Error checking tour for ${owner}/${repo}:`, error);
          return {
            hasTour: false,
            tourPath: null,
            forkOwner: null,
            forkRepo: null,
            cached: false,
          };
        }
      }

      // For non-tour-org repos, check if there's cached tour availability
      const cacheKey = getTourAvailabilityCacheKey(owner, repo);
      console.log(`[checkTourAvailability] Checking cache for ${owner}/${repo} with key: ${cacheKey}`);
      const cached = await getCached<{
        hasTour: boolean;
        tourPath: string;
        forkOwner: string;
        forkRepo: string;
        checkedAt: string;
      }>(cacheKey);

      console.log(`[checkTourAvailability] Cache result:`, cached);

      if (cached) {
        return {
          hasTour: cached.hasTour,
          tourPath: cached.tourPath,
          forkOwner: cached.forkOwner,
          forkRepo: cached.forkRepo,
          cached: true,
        };
      }

      // No cached info - tour not known to be available
      return {
        hasTour: false,
        tourPath: null,
        forkOwner: null,
        forkRepo: null,
        cached: false,
      };
    }),

  /**
   * Cache tour availability when UI detects a tour
   * Called when File City panel successfully loads a tour from the file tree
   * Caches under parent repo so other users can discover the tour
   */
  cacheTourAvailability: publicProcedure
    .input(cacheTourAvailabilityInputSchema)
    .output(z.object({ cached: z.boolean(), parentRepo: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const { owner, repo, tourPath, tourId, tourName } = input;
      const userToken = await getGitHubToken();
      const isTourOrg = TOUR_ORGS.includes(owner.toLowerCase());

      console.log(`[cacheTourAvailability] Tour detected at ${owner}/${repo}/${tourPath}, isTourOrg=${isTourOrg}`);

      // Only cache if this is a tour org fork
      if (!isTourOrg) {
        console.log(`[cacheTourAvailability] Not a tour org, skipping cache`);
        return { cached: false, parentRepo: null };
      }

      try {
        // Get repo info to find parent
        const repoInfo = await makeGitHubRequest<{
          fork: boolean;
          parent?: {
            owner: { login: string };
            name: string;
            full_name: string;
          };
        }>(`/repos/${owner}/${repo}`, userToken);

        if (!repoInfo.fork || !repoInfo.parent) {
          console.log(`[cacheTourAvailability] Not a fork or no parent, skipping cache`);
          return { cached: false, parentRepo: null };
        }

        const parentOwner = repoInfo.parent.owner.login;
        const parentRepo = repoInfo.parent.name;
        const cacheKey = getTourAvailabilityCacheKey(parentOwner, parentRepo);

        console.log(`[cacheTourAvailability] Caching tour for parent ${parentOwner}/${parentRepo} under key: ${cacheKey}`);
        setCachedAsync(cacheKey, {
          hasTour: true,
          tourPath,
          tourId: tourId || null,
          tourName: tourName || null,
          forkOwner: owner,
          forkRepo: repo,
          checkedAt: new Date().toISOString(),
        }, TOUR_AVAILABILITY_TTL);

        return { cached: true, parentRepo: `${parentOwner}/${parentRepo}` };
      } catch (error) {
        console.error(`[cacheTourAvailability] Error caching tour for ${owner}/${repo}:`, error);
        return { cached: false, parentRepo: null };
      }
    }),

  /**
   * Get featured repositories (fork parents from X-File-City org)
   * Fetches repos forked by X-File-City and returns their parent repos
   */
  getFeaturedRepos: publicProcedure
    .output(getFeaturedReposOutputSchema)
    .query(async () => {
      const userToken = await getGitHubToken();

      interface GitHubOrgRepo {
        id: number;
        name: string;
        full_name: string;
        fork: boolean;
        description: string | null;
        owner: {
          login: string;
          avatar_url: string;
        };
        stargazers_count: number;
        language: string | null;
        license?: {
          spdx_id: string;
        } | null;
        topics?: string[];
        html_url: string;
        parent?: {
          id: number;
          name: string;
          full_name: string;
          description: string | null;
          owner: {
            login: string;
            avatar_url: string;
          };
          stargazers_count: number;
          language: string | null;
          license?: {
            spdx_id: string;
          } | null;
          topics?: string[];
          html_url: string;
          created_at?: string;
        };
      }

      try {
        // Fetch repos from X-File-City org
        const orgRepos = await makeGitHubRequest<GitHubOrgRepo[]>(
          '/orgs/X-File-City/repos?per_page=100&sort=updated',
          userToken
        );

        // Filter for forks only
        const forks = orgRepos.filter((repo) => repo.fork);

        // Fetch full repo info for each fork to get parent data
        const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
        const reposWithForkInfo = await Promise.all(
          forks.map((fork) =>
            limit(async () => {
              try {
                const fullRepo = await makeGitHubRequest<GitHubOrgRepo>(
                  `/repos/${fork.full_name}`,
                  userToken
                );
                if (!fullRepo.parent) return null;
                // Return parent repo with fork info attached
                // Use fork's name and owner for navigation (fork may have different name than parent)
                return {
                  ...fullRepo.parent,
                  forkOwner: fork.owner.login,
                  forkName: fork.name,
                };
              } catch {
                return null;
              }
            })
          )
        );

        // Filter out nulls and dedupe by id
        const seen = new Set<number>();
        const uniqueParents = reposWithForkInfo
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });

        return uniqueParents;
      } catch (error) {
        console.error('[getFeaturedRepos] Error fetching featured repos:', error);
        return [];
      }
    }),

  // ==========================================================================
  // Suggestion Endpoints (for mobile feed customization)
  // ==========================================================================

  /**
   * Get suggested users for feed customization
   * Aggregates: users the authenticated user follows + members of their orgs
   * Requires authentication
   */
  getSuggestedUsers: publicProcedure
    .output(getSuggestedUsersOutputSchema)
    .query(async () => {
      const userToken = await getGitHubTokenFromHeadersOrCookies();
      if (!userToken) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required to get suggestions. Provide Bearer token or sign in.',
        });
      }

      const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
      const userMap = new Map<string, z.infer<typeof suggestedUserSchema>>();

      // Fetch following and orgs in parallel
      interface GitHubFollowingUser {
        login: string;
        avatar_url: string;
        name?: string | null;
        bio?: string | null;
      }

      interface GitHubOrg {
        login: string;
      }

      interface GitHubOrgMember {
        login: string;
        avatar_url: string;
      }

      const [followingResult, orgsResult] = await Promise.allSettled([
        makeGitHubRequest<GitHubFollowingUser[]>('/user/following?per_page=100', userToken),
        makeGitHubRequest<GitHubOrg[]>('/user/orgs?per_page=100', userToken),
      ]);

      // Process following
      if (followingResult.status === 'fulfilled') {
        for (const user of followingResult.value) {
          userMap.set(user.login.toLowerCase(), {
            login: user.login,
            avatar_url: user.avatar_url,
            name: user.name,
            bio: user.bio,
            source: 'following',
          });
        }
      }

      // Process org members
      if (orgsResult.status === 'fulfilled') {
        const orgMemberPromises = orgsResult.value.map((org) =>
          limit(async () => {
            try {
              const members = await makeGitHubRequest<GitHubOrgMember[]>(
                `/orgs/${org.login}/members?per_page=100`,
                userToken
              );
              return { org: org.login, members };
            } catch {
              // Skip orgs we can't access (private membership, etc.)
              return { org: org.login, members: [] };
            }
          })
        );

        const orgResults = await Promise.all(orgMemberPromises);

        for (const { org, members } of orgResults) {
          for (const member of members) {
            const key = member.login.toLowerCase();
            // Don't overwrite if already added from following
            if (!userMap.has(key)) {
              userMap.set(key, {
                login: member.login,
                avatar_url: member.avatar_url,
                source: 'org',
                orgName: org,
              });
            }
          }
        }
      }

      return {
        users: Array.from(userMap.values()),
      };
    }),

  /**
   * Get suggested repos for feed customization
   * Aggregates: starred repos + repos from user's orgs
   * Requires authentication
   */
  getSuggestedRepos: publicProcedure
    .output(getSuggestedReposOutputSchema)
    .query(async () => {
      const userToken = await getGitHubTokenFromHeadersOrCookies();
      if (!userToken) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required to get suggestions. Provide Bearer token or sign in.',
        });
      }

      const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
      const repoMap = new Map<string, z.infer<typeof suggestedRepoSchema>>();

      interface GitHubStarredRepo {
        id: number;
        name: string;
        full_name: string;
        description?: string | null;
        stargazers_count: number;
        language?: string | null;
        owner: {
          login: string;
        };
      }

      interface GitHubOrg {
        login: string;
      }

      interface GitHubOrgRepo {
        id: number;
        name: string;
        full_name: string;
        description?: string | null;
        stargazers_count: number;
        language?: string | null;
        owner: {
          login: string;
        };
      }

      // Fetch starred repos and orgs in parallel
      const [starredResult, orgsResult] = await Promise.allSettled([
        makeGitHubRequest<GitHubStarredRepo[]>(
          '/user/starred?per_page=100&sort=updated',
          userToken
        ),
        makeGitHubRequest<GitHubOrg[]>('/user/orgs?per_page=100', userToken),
      ]);

      // Process starred repos
      if (starredResult.status === 'fulfilled') {
        for (const repo of starredResult.value) {
          repoMap.set(repo.full_name.toLowerCase(), {
            owner: repo.owner.login,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            stargazers_count: repo.stargazers_count,
            language: repo.language,
            source: 'starred',
          });
        }
      }

      // Process org repos
      if (orgsResult.status === 'fulfilled') {
        const orgRepoPromises = orgsResult.value.map((org) =>
          limit(async () => {
            try {
              const repos = await makeGitHubRequest<GitHubOrgRepo[]>(
                `/orgs/${org.login}/repos?per_page=100&sort=updated`,
                userToken
              );
              return { org: org.login, repos };
            } catch {
              // Skip orgs we can't access
              return { org: org.login, repos: [] };
            }
          })
        );

        const orgResults = await Promise.all(orgRepoPromises);

        for (const { org, repos } of orgResults) {
          for (const repo of repos) {
            const key = repo.full_name.toLowerCase();
            // Don't overwrite if already added from starred
            if (!repoMap.has(key)) {
              repoMap.set(key, {
                owner: repo.owner.login,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                stargazers_count: repo.stargazers_count,
                language: repo.language,
                source: 'org',
                orgName: org,
              });
            }
          }
        }
      }

      return {
        repos: Array.from(repoMap.values()),
      };
    }),

  // ==========================================================================
  // Search Endpoints
  // ==========================================================================

  /**
   * Search GitHub users
   * Enriches results with cached user profiles (names) when available
   */
  searchUsers: publicProcedure
    .input(searchInputSchema)
    .output(searchUsersOutputSchema)
    .query(async ({ input }) => {
      // Search works without auth but benefits from higher rate limits when authenticated
      const userToken = await getGitHubTokenFromHeadersOrCookies();

      interface GitHubSearchUsersResponse {
        total_count: number;
        items: Array<{
          login: string;
          avatar_url: string;
          type: 'User' | 'Organization';
        }>;
      }

      const data = await makeGitHubRequest<GitHubSearchUsersResponse>(
        `/search/users?q=${encodeURIComponent(input.query)}&per_page=${input.perPage}`,
        userToken
      );

      // Enrich with cached user profiles (fetch all in parallel)
      const enrichedUsers = await Promise.all(
        data.items.map(async (u) => {
          const cached = await getCachedUserProfile(u.login);
          return {
            login: u.login,
            avatar_url: u.avatar_url,
            type: u.type,
            name: cached?.name || null,
          };
        })
      );

      return {
        users: enrichedUsers,
        total_count: data.total_count,
      };
    }),

  /**
   * Search GitHub repositories
   */
  searchRepos: publicProcedure
    .input(searchInputSchema)
    .output(searchReposOutputSchema)
    .query(async ({ input }) => {
      // Search works without auth but benefits from higher rate limits when authenticated
      const userToken = await getGitHubTokenFromHeadersOrCookies();

      interface GitHubSearchReposResponse {
        total_count: number;
        items: Array<{
          name: string;
          full_name: string;
          description?: string | null;
          stargazers_count: number;
          language?: string | null;
          owner: {
            login: string;
            avatar_url: string;
          };
        }>;
      }

      const data = await makeGitHubRequest<GitHubSearchReposResponse>(
        `/search/repositories?q=${encodeURIComponent(input.query)}&per_page=${input.perPage}`,
        userToken
      );

      return {
        repos: data.items.map((r) => ({
          owner: r.owner.login,
          name: r.name,
          full_name: r.full_name,
          description: r.description,
          stargazers_count: r.stargazers_count,
          language: r.language,
          owner_avatar_url: r.owner.avatar_url,
        })),
        total_count: data.total_count,
      };
    }),

  /**
   * Get all repositories that have tours available
   * Fetches repos from tour organizations and returns parent repo info
   * Cached for 24 hours
   */
  getReposWithTours: publicProcedure
    .output(getReposWithToursOutputSchema)
    .query(async () => {
      const cacheKey = 'github:repos-with-tours:v6';

      // Check cache first
      const cached = await getCached<z.infer<typeof getReposWithToursOutputSchema>>(cacheKey);
      if (cached) {
        console.log('[getReposWithTours] Cache hit');
        return { ...cached, cached: true };
      }

      console.log('[getReposWithTours] Cache miss, fetching from GitHub');

      const userToken = await getGitHubTokenFromHeadersOrCookies();
      const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
      const reposWithTours: z.infer<typeof repoWithTourSchema>[] = [];

      interface GitHubRepo {
        id: number;
        name: string;
        full_name: string;
        description?: string | null;
        stargazers_count: number;
        language?: string | null;
        fork: boolean;
        owner: {
          login: string;
        };
        parent?: {
          owner: {
            login: string;
            avatar_url: string;
          };
          name: string;
          full_name: string;
          description?: string | null;
          stargazers_count: number;
          language?: string | null;
        };
        default_branch: string;
      }

      // Fetch repos from all tour orgs in parallel
      // Use /users endpoint which works for both users and organizations
      const orgRepoPromises = TOUR_ORGS.map((org) =>
        limit(async () => {
          try {
            const repos = await makeGitHubRequest<GitHubRepo[]>(
              `/users/${org}/repos?per_page=100&type=forks`,
              userToken
            );
            return { org, repos };
          } catch (error) {
            console.error(`[getReposWithTours] Error fetching repos for ${org}:`, error);
            return { org, repos: [] };
          }
        })
      );

      const orgResults = await Promise.all(orgRepoPromises);

      console.log('[getReposWithTours] Org results:', orgResults.map(r => ({ org: r.org, count: r.repos.length, forks: r.repos.filter(repo => repo.fork).length })));

      // Check each fork for tour file by fetching root tree
      const tourCheckPromises: Promise<void>[] = [];

      for (const { org, repos } of orgResults) {
        const forks = repos.filter(r => r.fork);
        console.log(`[getReposWithTours] Found ${forks.length} forks in ${org}`);

        for (const repo of forks) {
          tourCheckPromises.push(
            limit(async () => {
              try {
                // Fetch full repo details to get parent info
                const fullRepo = await makeGitHubRequest<GitHubRepo>(
                  `/repos/${org}/${repo.name}`,
                  userToken
                );

                if (!fullRepo.parent) {
                  console.log(`[getReposWithTours] ${fullRepo.full_name} has no parent info`);
                  return;
                }

                console.log(`[getReposWithTours] Checking fork ${org}/${repo.name} (parent: ${fullRepo.parent.full_name}) for tour files`);

                // Get root tree to find .tour.json files
                interface TreeItem {
                  path: string;
                  type: string;
                }
                interface TreeResponse {
                  tree: TreeItem[];
                }

                const tree = await makeGitHubRequest<TreeResponse>(
                  `/repos/${org}/${repo.name}/git/trees/${fullRepo.default_branch}`,
                  userToken
                );

                // Look for any .tour.json file in root
                const tourFile = tree.tree.find(
                  (item) => item.type === 'blob' && item.path.endsWith('.tour.json')
                );

                if (tourFile) {
                  reposWithTours.push({
                    owner: fullRepo.parent.owner.login,
                    name: fullRepo.parent.name,
                    full_name: fullRepo.parent.full_name,
                    description: fullRepo.parent.description,
                    stargazers_count: fullRepo.parent.stargazers_count,
                    language: fullRepo.parent.language,
                    owner_avatar_url: fullRepo.parent.owner.avatar_url,
                    forkOwner: org,
                    forkRepo: repo.name,
                    tourPath: tourFile.path,
                  });
                  console.log(`[getReposWithTours] ✅ Found tour for ${fullRepo.parent.full_name} in ${org}/${repo.name} at ${tourFile.path}`);
                }
              } catch (error) {
                console.error(`[getReposWithTours] Error checking tour for ${org}/${repo.name}:`, error);
              }
            })
          );
        }
      }

      await Promise.all(tourCheckPromises);

      console.log(`[getReposWithTours] Found ${reposWithTours.length} repos with tours`);

      const result = {
        repos: reposWithTours,
        cached: false,
      };

      // Cache for 24 hours
      setCachedAsync(cacheKey, result, TOUR_AVAILABILITY_TTL);

      return result;
    }),

  /**
   * Get tour JSON for a repository
   * Fetches the tour file from GitHub and parses it
   */
  getTour: publicProcedure
    .input(
      z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        tourPath: z.string().min(1),
        branch: z.string().optional().default('main'),
      })
    )
    .output(
      z.object({
        tour: z.any(), // IntroductionTour type from file-city-builder
        cached: z.boolean(),
      })
    )
    .query(async ({ input }) => {
      const { owner, repo, tourPath, branch } = input;

      // Cache key for this tour
      const cacheKey = `github:tour:${owner}/${repo}:${tourPath}:${branch}`;

      // Check cache first
      const cached = await getCached<{ tour: IntroductionTour }>(cacheKey);
      if (cached) {
        console.log(`[getTour] Cache hit for ${owner}/${repo}/${tourPath}`);
        return { ...cached, cached: true };
      }

      console.log(`[getTour] Cache miss, fetching from GitHub: ${owner}/${repo}/${tourPath}`);

      try {
        // Fetch tour JSON from raw.githubusercontent.com
        const tourUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${tourPath}`;
        const response = await fetch(tourUrl);

        if (!response.ok) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Tour file not found: ${tourPath}`,
          });
        }

        const tourJson = await response.text();

        // Parse and validate tour
        const parseResult = parseTour(tourJson);

        if (!parseResult.success) {
          const errorMessages = parseResult.errors?.map(e => e.message).join(', ') || 'Unknown error';
          console.error(`[getTour] Tour validation failed for ${owner}/${repo}/${tourPath}:`, errorMessages);
          console.error(`[getTour] First 500 chars of tour JSON:`, tourJson.substring(0, 500));
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid tour file: ${errorMessages}`,
          });
        }

        const result = { tour: parseResult.tour!, cached: false };

        // Cache for 24 hours
        setCachedAsync(cacheKey, { tour: parseResult.tour! }, TOUR_AVAILABILITY_TTL);

        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error(`[getTour] Error fetching tour:`, error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch tour: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});
