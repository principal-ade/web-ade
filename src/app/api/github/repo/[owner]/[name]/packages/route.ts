/**
 * GET /api/github/repo/[owner]/[name]/packages
 *
 * Detects and returns package information for a GitHub repository.
 * Uses @principal-ai/codebase-composition for comprehensive package detection
 * including monorepo workspaces, dependencies, and config files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/request';
import { PackageLayerModule } from '@principal-ai/codebase-composition';
import type { FileTree, FileInfo, DirectoryInfo } from '@principal-ai/repository-abstraction';

const GITHUB_API_BASE = 'https://api.github.com';
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
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

async function makeGitHubRequest(endpoint: string, token?: string | null) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Principal-ADE/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function buildFileTree(
  tree: GitHubTreeResponse,
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const userToken = await getGitHubToken();

    // Fetch the repository tree
    const treeData: GitHubTreeResponse = await makeGitHubRequest(
      `/repos/${owner}/${name}/git/trees/HEAD?recursive=1`,
      userToken
    );

    // Build FileTree structure
    const fileTree = buildFileTree(treeData, owner, name);

    // Create a file reader that fetches from GitHub with concurrency limiting
    const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
    const fileReader = async (filePath: string): Promise<string> => {
      // Normalize path (remove leading slash if present)
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

      return limit(async () => {
        try {
          const fileData = await makeGitHubRequest(
            `/repos/${owner}/${name}/contents/${normalizedPath}`,
            userToken
          );

          if (fileData.content && fileData.encoding === 'base64') {
            return Buffer.from(fileData.content, 'base64').toString('utf-8');
          }

          throw new Error(`Unable to read file: ${filePath}`);
        } catch (error) {
          console.error(`[packages] Failed to read file ${filePath}:`, error);
          throw error;
        }
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

    return NextResponse.json({
      packages,
      summary,
      treeSha: treeData.sha,
    });
  } catch (error) {
    console.error('[packages] Error detecting packages:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to detect packages',
        packages: [],
        summary: {
          isMonorepo: false,
          totalPackages: 0,
          workspacePackages: [],
          totalDependencies: 0,
          totalDevDependencies: 0,
          availableScripts: [],
        },
      },
      { status: 500 }
    );
  }
}
