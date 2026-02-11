/**
 * GitHub Schematic Fetcher
 *
 * Fetches complete telemetry schematics (canvases + workflows + test traces)
 * from GitHub repositories at specific commits.
 *
 * A schematic is the complete CanvasDiscoveryResult for a service, including:
 * - All .otel.canvas files (event schemas)
 * - All .workflow.json files (scenarios)
 * - All test traces/executions
 * - Complete storyboard structure
 */

import { Octokit } from '@octokit/rest';
import { PathsFileTreeBuilder } from '@principal-ai/repository-abstraction';
import { CanvasDiscovery, type VersionSnapshot } from '@principal-ai/principal-view-core';
import { GitHubFileSystemAdapter } from '@/lib/server/GitHubFileSystemAdapter';
import { getGitHubToken } from '@/lib/auth/cookies';

/**
 * Fetches complete schematic from GitHub at specific commit
 *
 * Steps:
 * 1. Fetch repository tree at commit SHA (all file paths)
 * 2. Build FileTree from paths
 * 3. Create GitHubFileSystemAdapter for file content fetching
 * 4. Use CanvasDiscovery to find and parse all canvas/workflow files
 * 5. Return complete VersionSnapshot (the schematic)
 *
 * @param repositoryUrl - GitHub repository URL
 * @param commitSha - Git commit SHA (40-char hex)
 * @param providedToken - GitHub token (optional, from Authorization header)
 * @returns Complete schematic (VersionSnapshot with content)
 * @throws Error if repository not found or schematic fetch fails
 */
export async function fetchSchematicFromGitHub(
  repositoryUrl: string,
  commitSha: string,
  providedToken?: string
): Promise<VersionSnapshot> {
  // Parse owner/repo from URL
  const match = repositoryUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }

  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, '');

  console.log('[Schematic Fetcher] Fetching schematic:', {
    owner,
    repo,
    commitSha: commitSha.substring(0, 12),
  });

  // Get GitHub token (use provided token from Authorization header, or fall back to cookies/env)
  const userToken = providedToken || (await getGitHubToken());
  const token = userToken || process.env.GITHUB_PUBLIC_PAT || process.env.GITHUB_TOKEN;

  const octokit = new Octokit({ auth: token });

  try {
    // Step 1: Fetch repository tree at commit SHA
    // Use recursive=true to get ALL files in the repository
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: commitSha,
      recursive: '1', // Get complete file tree (recursive flag)
    });

    if (tree.truncated) {
      console.warn('[Schematic Fetcher] Repository tree is large and may be truncated');
    }

    // Extract file paths from tree (filter out directories)
    const filePaths = tree.tree
      .filter((item) => item.type === 'blob') // Only files, not trees/subdirs
      .map((item) => item.path!)
      .filter((path) => path); // Remove any undefined paths

    console.log('[Schematic Fetcher] Repository contains', filePaths.length, 'files');

    // Step 2: Build FileTree from paths
    const fileTreeBuilder = new PathsFileTreeBuilder();
    const fileTree = fileTreeBuilder.build({
      files: filePaths,
      rootPath: '',
    });

    console.log('[Schematic Fetcher] FileTree built:', {
      files: fileTree.allFiles.length,
      directories: fileTree.allDirectories.length,
    });

    // Step 3: Create GitHubFileSystemAdapter for reading file contents
    // Use commitSha as "branch" to fetch files at specific commit
    const adapter = new GitHubFileSystemAdapter(owner, repo, commitSha, token || undefined);

    // Step 4: Use CanvasDiscovery to find all canvases/workflows
    const discovery = new CanvasDiscovery();
    const schematic = await discovery.discover(fileTree, {
      fileReader: async (path: string) => {
        // Read file content from GitHub at the specific commit
        return adapter.readFileAsync(path);
      },
      includeContent: true, // Include parsed canvas/workflow content
    });

    console.log('[Schematic Fetcher] Schematic discovered:', {
      canvases: schematic.canvases.length,
      storyboards: schematic.storyboards.length,
      workflows: schematic.storyboards.reduce((sum, sb) => sum + sb.workflows.length, 0),
      errors: schematic.errors.length,
    });

    if (schematic.errors.length > 0) {
      console.warn('[Schematic Fetcher] Discovery errors:', schematic.errors);
    }

    // Return as VersionSnapshot format
    return {
      repositoryUrl,
      commitSha,
      storyboards: schematic.storyboards,
      registeredAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Schematic Fetcher] Failed to fetch schematic:', {
      owner,
      repo,
      commitSha: commitSha.substring(0, 12),
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Generates a unique schematic ID from repository and commit
 *
 * Format: owner/repo@shortSha
 * Example: "acme/backend-monorepo@abc123def456"
 */
export function generateSchematicId(repositoryUrl: string, commitSha: string): string {
  const match = repositoryUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
  if (!match) {
    throw new Error('Invalid repository URL');
  }

  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, '');

  return `${owner}/${repo}@${commitSha.substring(0, 12)}`;
}
