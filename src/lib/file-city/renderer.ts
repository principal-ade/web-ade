/**
 * File City PNG renderer for GitHub repositories.
 *
 * Fetches a repository's file tree from GitHub API and renders
 * a treemap-style visualization as a PNG image.
 */

import { createCanvas } from 'canvas';
import {
  CodeCityBuilderWithGrid,
  buildFileSystemTreeFromFileInfoList,
  getFilesFromGitHubTree,
  type GitHubTreeResponse,
} from '@principal-ai/file-city-builder';
import { gitTreeCache } from '@/lib/git-tree-cache';
import {
  createDrawContext,
  drawDistricts,
  drawBuildings,
  RenderMode,
} from '@principal-ai/file-city-server';

// Type alias to handle canvas version mismatches between packages
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompatibleContext = any;

const DEFAULT_DIRECTORY_COLOR = '#111827';

export interface RenderOptions {
  owner: string;
  repo: string;
  branch?: string;
  width?: number;
  height?: number;
}

/**
 * Get headers for GitHub API requests
 */
function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'web-ade',
    Accept: 'application/vnd.github.v3+json',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  return headers;
}

/**
 * Get the default branch for a repository
 */
async function getDefaultBranch(
  owner: string,
  repo: string
): Promise<string> {
  const headers = getGitHubHeaders();
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error fetching repo: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

/**
 * Fetch the file tree from GitHub API (with caching)
 * Uses the shared gitTreeCache to avoid redundant API calls
 */
async function fetchGitHubTree(
  owner: string,
  repo: string,
  ref: string
): Promise<GitHubTreeResponse> {
  const headers = getGitHubHeaders();

  // If ref is HEAD, resolve to the actual default branch name
  const branch = ref === 'HEAD' ? await getDefaultBranch(owner, repo) : ref;

  // Check cache first
  const cacheKey = `${owner}/${repo}/${branch}`;
  const cached = gitTreeCache.get<GitHubTreeResponse>(cacheKey);
  if (cached) {
    console.log('[File City] Tree cache hit:', cacheKey);
    return cached;
  }

  // Cache miss - fetch from GitHub
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(treeUrl, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  const treeData = await response.json() as GitHubTreeResponse;

  // Cache by both the lookup key and the tree SHA (immutable)
  gitTreeCache.set(cacheKey, treeData);
  gitTreeCache.set(treeData.sha, treeData);
  console.log('[File City] Tree cached:', cacheKey, 'sha:', treeData.sha);

  return treeData;
}

/**
 * Render a File City PNG for a GitHub repository.
 *
 * @param options - Rendering options including owner, repo, dimensions
 * @returns PNG image as a Buffer
 */
export async function renderFileCityPng(options: RenderOptions): Promise<Buffer> {
  const {
    owner,
    repo,
    branch = 'HEAD',
    width = 400,
    height = 400,
  } = options;

  // 1. Fetch GitHub tree
  const tree = await fetchGitHubTree(owner, repo, branch);

  // 2. Convert to file info array
  const files = getFilesFromGitHubTree(tree);

  if (files.length === 0) {
    throw new Error(`No files found in ${owner}/${repo}`);
  }

  // 3. Build file system tree
  const fileTree = buildFileSystemTreeFromFileInfoList(files, tree.sha);

  // 4. Build city layout
  const builder = new CodeCityBuilderWithGrid();
  const cityData = builder.buildCityFromFileSystem(fileTree, '', {
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 2,
    paddingRight: 2,
  });

  // 5. Create canvas and render (transparent background)
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as CompatibleContext;

  // Create draw context with scaling
  const padding = Math.min(width, height) * 0.05; // 5% padding
  const drawContext = createDrawContext(ctx, width, height, cityData, padding);

  // Draw districts first (background)
  drawDistricts(
    RenderMode.HIGHLIGHT,
    ctx,
    cityData.districts,
    drawContext.worldToCanvas,
    drawContext.scale,
    undefined, // highlightedDirectories
    undefined, // hoveredDirectories
    undefined, // hoveredDistrict
    true, // fullSize
    undefined, // selectedPaths
    undefined, // changedFiles
    undefined, // theme
    undefined, // customColorFn
    DEFAULT_DIRECTORY_COLOR, // defaultDirectoryColor
    false // showDirectoryLabels
  );

  // Draw buildings on top
  drawBuildings(
    'highlight',
    ctx,
    cityData.buildings,
    drawContext.worldToCanvas,
    drawContext.scale,
    undefined, // highlightedPaths
    undefined, // selectedPaths
    undefined, // focusDirectory
    undefined, // hoveredBuilding
    undefined, // theme
    undefined, // customColorFn
    false, // showFileNames - disabled for smaller images
    true // fullSize
  );

  // 6. Return PNG buffer
  return canvas.toBuffer('image/png');
}
