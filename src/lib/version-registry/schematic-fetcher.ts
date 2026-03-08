/**
 * GitHub Schematic Fetcher
 *
 * Fetches complete telemetry schematics (canvases + workflows + test traces)
 * from GitHub repositories at specific commits.
 *
 * A schematic is the complete CanvasDiscoveryResult for a service, including:
 * - All .otel.canvas files (event schemas) - filtered to exclude regular .canvas files
 * - All .workflow.json files (scenarios)
 * - All test traces/executions
 * - Complete storyboard structure
 * - Library metadata including owned-scopes for trace routing
 *
 * @otel canvas: .principal-views/version-registry/version-registry.otel.canvas
 */

import type { Span } from '@opentelemetry/api';
import { Octokit } from '@octokit/rest';
import { PathsFileTreeBuilder } from '@principal-ai/repository-abstraction';
import {
  CanvasDiscovery,
  type VersionSnapshot,
  type ComponentLibrary,
  type ResourceAttributes,
} from '@principal-ai/principal-view-core';
import { GitHubFileSystemAdapter } from '@/lib/server/GitHubFileSystemAdapter';
import { getGitHubToken } from '@/lib/auth/cookies';
import * as yaml from 'yaml';

/**
 * Extended schematic response that includes library.yaml content
 *
 * Adds library metadata and resource definitions to enable:
 * - Scope-to-storyboard matching for trace processing
 * - Service identification and routing
 */
export interface SchematicResponse extends VersionSnapshot {
  /** Library metadata from .principal-views/library.yaml */
  library?: {
    version: string;
    name: string;
    description?: string;
  };
  /** Resource definitions with owned-scopes for trace routing */
  resources?: Record<string, ResourceAttributes>;
}

/**
 * Fetches and parses library.yaml from a repository
 *
 * @param adapter - GitHub file system adapter
 * @returns Parsed ComponentLibrary or null if not found
 */
async function fetchLibraryYaml(
  adapter: GitHubFileSystemAdapter
): Promise<ComponentLibrary | null> {
  const libraryPath = '.principal-views/library.yaml';

  try {
    const content = await adapter.readFile(libraryPath);
    const parsed = yaml.parse(content) as ComponentLibrary;
    return parsed;
  } catch {
    // library.yaml is optional
    return null;
  }
}

/**
 * Fetches complete schematic from GitHub at specific commit
 *
 * Steps:
 * 1. Fetch repository tree at commit SHA (all file paths)
 * 2. Build FileTree from paths
 * 3. Create GitHubFileSystemAdapter for file content fetching
 * 4. Use CanvasDiscovery to find and parse all canvas/workflow files
 * 5. Filter to only include .otel.canvas storyboards (exclude regular .canvas)
 * 6. Fetch and include library.yaml content (for owned-scopes)
 * 7. Return complete SchematicResponse
 *
 * @param repositoryUrl - GitHub repository URL
 * @param commitSha - Git commit SHA (40-char hex)
 * @param providedToken - GitHub token (optional, from Authorization header)
 * @param span - OpenTelemetry span for instrumentation (optional)
 * @returns Complete schematic with library data
 * @throws Error if repository not found or schematic fetch fails
 */
export async function fetchSchematicFromGitHub(
  repositoryUrl: string,
  commitSha: string,
  providedToken?: string,
  span?: Span
): Promise<SchematicResponse> {
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
        return adapter.readFile(path);
      },
      includeContent: true, // Include parsed canvas/workflow content
    });

    // Filter to only include otel.canvas storyboards (exclude regular .canvas files)
    // Regular .canvas files are for documentation/architecture diagrams, not telemetry
    const otelStoryboards = schematic.storyboards.filter(
      (storyboard) => storyboard.canvas.type === 'otel'
    );

    const workflowCount = otelStoryboards.reduce((sum, sb) => sum + sb.workflows.length, 0);
    const otelCanvasCount = schematic.canvases.filter((c) => c.type === 'otel').length;

    console.log('[Schematic Fetcher] Schematic discovered:', {
      totalCanvases: schematic.canvases.length,
      otelCanvases: otelCanvasCount,
      totalStoryboards: schematic.storyboards.length,
      otelStoryboards: otelStoryboards.length,
      workflows: workflowCount,
      errors: schematic.errors.length,
    });

    // Generate schematic ID
    const schematicId = `${owner}/${repo}@${commitSha.substring(0, 12)}`;

    // Emit: version.registration.schematic.fetched
    span?.addEvent('version.registration.schematic.fetched', {
      'schematic.id': schematicId,
      'canvases.count': otelCanvasCount,
      'storyboards.count': otelStoryboards.length,
      'workflows.count': workflowCount,
      'errors.count': schematic.errors.length,
    });

    if (schematic.errors.length > 0) {
      console.warn('[Schematic Fetcher] Discovery errors:', schematic.errors);
    }

    // Fetch library.yaml for owned-scopes and service metadata
    const library = await fetchLibraryYaml(adapter);

    if (library) {
      console.log('[Schematic Fetcher] Library found:', {
        name: library.name,
        version: library.version,
        resourceCount: library.resources ? Object.keys(library.resources).length : 0,
      });
    }

    // Build response with library data for trace routing
    const response: SchematicResponse = {
      repositoryUrl,
      commitSha,
      storyboards: otelStoryboards,
      registeredAt: new Date().toISOString(),
    };

    // Include library metadata if available
    if (library) {
      response.library = {
        version: library.version,
        name: library.name,
        description: library.description,
      };

      // Include resources with owned-scopes for trace routing
      if (library.resources) {
        response.resources = library.resources;
      }
    }

    return response;
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
