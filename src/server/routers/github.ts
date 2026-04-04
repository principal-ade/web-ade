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
  storeTreeInS3CacheAsync,
  type GitHubTreeResponse,
} from '@/lib/github-tree-s3-cache';
import {
  getCached,
  setCachedAsync,
  getRefShaCacheKey,
  getTreeCacheKey,
  getTourAvailabilityCacheKey,
} from '@/lib/redis-cache';
import { PackageLayerModule } from '@principal-ai/codebase-composition';
import type { FileTree, FileInfo, DirectoryInfo } from '@principal-ai/repository-abstraction';

// Get tracer for GitHub operations
const tracer = trace.getTracer('github-router', '1.0.0');

const GITHUB_API_BASE = 'https://api.github.com';

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
  mode: z.string(),
  type: z.enum(['blob', 'tree', 'commit']), // 'commit' = git submodule
  sha: z.string(),
  size: z.number().optional(),
  url: z.string().optional(), // Optional for submodules
});

const getTreeOutputSchema = z.object({
  sha: z.string(),
  url: z.string(),
  tree: z.array(treeEntrySchema),
  truncated: z.boolean(),
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
  // Extract all files (blobs)
  const allFiles: FileInfo[] = tree.tree
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
  tree.tree
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
    })
  ),
  total_count: z.number(),
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
          const userToken = await getGitHubToken();

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
              // Cache ref→SHA mapping for 20 min
              setCachedAsync(refCacheKey, resolvedSha, 1200);
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
          const redisCached = await getCached<GitHubTreeResponse>(treeCacheKey);
          if (redisCached) {
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
          const s3Cached = await getTreeFromS3Cache(owner, repo, resolvedSha);
          if (s3Cached) {
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
          const treeData = await makeGitHubRequest<GitHubTreeResponse>(
            `/repos/${owner}/${repo}/git/trees/${resolvedSha}?recursive=1`,
            userToken
          );

          // Store in all caches
          if (treeData && treeData.sha) {
            // In-memory (sync)
            gitTreeCache.set(shaCacheKey, treeData);
            gitTreeCache.set(memCacheKey, treeData);
            gitTreeCache.set(treeData.sha, treeData);

            // Redis (async - faster cross-Lambda access)
            setCachedAsync(treeCacheKey, treeData, 1200); // 20 min

            // S3 (async - long-term persistence)
            storeTreeInS3CacheAsync(owner, repo, resolvedSha, treeData);
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

      return {
        users: data.items.map((u) => ({
          login: u.login,
          avatar_url: u.avatar_url,
          type: u.type,
        })),
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
        })),
        total_count: data.total_count,
      };
    }),
});

export type GitHubRouter = typeof githubRouter;
