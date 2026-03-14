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
});

const getFeaturedReposOutputSchema = z.array(featuredRepoSchema);

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
   * Returns the recursive tree structure with in-memory caching by SHA
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

          // First resolve the ref to actual commit SHA to ensure cache freshness
          let resolvedSha: string;
          try {
            interface GitHubCommitResponse {
              sha: string;
            }
            const refData = await makeGitHubRequest<GitHubCommitResponse>(
              `/repos/${owner}/${repo}/commits/${ref}`,
              userToken
            );
            resolvedSha = refData.sha;
          } catch {
            // If we can't resolve the ref, fall back to using the ref directly
            resolvedSha = ref;
          }

          const cacheKey = `${owner}/${repo}/${resolvedSha}`;
          span.setAttribute('cache.key', cacheKey);

          // Check in-memory cache first using the resolved SHA
          interface GitHubTreeResponse {
            sha: string;
            url: string;
            tree: Array<{
              path: string;
              mode: string;
              type: 'blob' | 'tree' | 'commit'; // 'commit' = git submodule
              sha: string;
              size?: number;
              url?: string; // Optional for submodules
            }>;
            truncated: boolean;
          }

          const cachedTree = gitTreeCache.get<GitHubTreeResponse>(cacheKey);
          if (cachedTree) {
            const durationMs = Date.now() - startTime;

            // Emit cache hit event
            span.addEvent('repo.file-tree.cache.hit', {
              'cache.key': cacheKey,
              'tree.sha': cachedTree.sha,
              'tree.fileCount': cachedTree.tree.length,
              'cache.hit': true,
              'durationMs': durationMs,
            });

            span.setAttribute('cache.hit', true);
            span.setAttribute('tree.fileCount', cachedTree.tree.length);
            span.end();
            return cachedTree;
          }

          // Emit cache miss event
          span.addEvent('repo.file-tree.cache.miss', {
            'cache.key': cacheKey,
            'cache.hit': false,
          });
          span.setAttribute('cache.hit', false);

          // Not in cache, fetch from GitHub using the resolved SHA
          const treeData = await makeGitHubRequest<GitHubTreeResponse>(
            `/repos/${owner}/${repo}/git/trees/${resolvedSha}?recursive=1`,
            userToken
          );

          // Cache by both the cache key and the tree SHA
          if (treeData && treeData.sha) {
            gitTreeCache.set(cacheKey, treeData);
            gitTreeCache.set(treeData.sha, treeData);
          }

          const durationMs = Date.now() - startTime;

          // Emit fetch complete event
          span.addEvent('repo.file-tree.fetch.complete', {
            'tree.sha': treeData.sha,
            'tree.fileCount': treeData.tree.length,
            'tree.truncated': treeData.truncated,
            'durationMs': durationMs,
          });

          span.setAttribute('tree.fileCount', treeData.tree.length);
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
        const parentRepos = await Promise.all(
          forks.map((fork) =>
            limit(async () => {
              try {
                const fullRepo = await makeGitHubRequest<GitHubOrgRepo>(
                  `/repos/${fork.full_name}`,
                  userToken
                );
                return fullRepo.parent || null;
              } catch {
                return null;
              }
            })
          )
        );

        // Filter out nulls and dedupe by id
        const seen = new Set<number>();
        const uniqueParents = parentRepos
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
});

export type GitHubRouter = typeof githubRouter;
