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
import {
  createDrawContext,
  clearCanvas,
  drawDistricts,
  drawBuildings,
  RenderMode,
} from '@principal-ai/file-city-server';

// Type alias to handle canvas version mismatches between packages
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompatibleContext = any;

const BACKGROUND_COLOR = '#1a1a2e';

export interface RenderOptions {
  owner: string;
  repo: string;
  branch?: string;
  width?: number;
  height?: number;
}

/**
 * Fetch the file tree from GitHub API
 */
async function fetchGitHubTree(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeResponse> {
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const response = await fetch(treeUrl, {
    headers: {
      'User-Agent': 'web-ade',
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<GitHubTreeResponse>;
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
    branch = 'main',
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

  // 5. Create canvas and render
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as CompatibleContext;

  // Clear background
  clearCanvas(ctx, width, height, BACKGROUND_COLOR);

  // Create draw context with scaling
  const padding = Math.min(width, height) * 0.05; // 5% padding
  const drawContext = createDrawContext(ctx, width, height, cityData, padding);

  // Draw districts first (background)
  drawDistricts(
    RenderMode.HIGHLIGHT,
    ctx,
    cityData.districts,
    drawContext.worldToCanvas,
    drawContext.scale
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
