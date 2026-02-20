import { GitHubFileSystemAdapter } from './GitHubFileSystemAdapter';
import type { CodebaseView } from '@principal-ai/alexandria-core-library';

/**
 * GitHub helper for fetching Alexandria data from GitHub repositories
 * Uses alexandria-core-library with GitHubFileSystemAdapter
 */
export class GitHubAlexandria {
  private token?: string;

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN;
  }

  /**
   * Fetch codebase views from .alexandria/views directory
   * Returns the full CodebaseView objects
   */
  async getCodebaseViews(
    owner: string,
    name: string,
    branch: string = 'main'
  ): Promise<CodebaseView[]> {
    const adapter = new GitHubFileSystemAdapter(owner, name, branch, this.token);

    try {
      // Check if .alexandria directory exists
      const hasAlexandria = await adapter.exists('.alexandria');
      if (!hasAlexandria) {
        return [];
      }

      // Check if views directory exists
      const viewsPath = '.alexandria/views';
      const hasViews = await adapter.isDirectory(viewsPath);
      if (!hasViews) {
        return [];
      }

      // Read all JSON files in the views directory
      const viewFiles = await adapter.readDir(viewsPath);
      const jsonFiles = viewFiles.filter((f: string) => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return [];
      }

      // Parse each view file directly (MemoryPalace doesn't work with non-filesystem paths)
      const views: CodebaseView[] = [];
      for (const file of jsonFiles) {
        try {
          const viewPath = adapter.join(viewsPath, file);
          const content = await adapter.readFile(viewPath);
          const view = JSON.parse(content) as CodebaseView;
          views.push(view);
        } catch (error: unknown) {
          console.error(`Failed to parse view file ${file}:`, error);
          // Continue with other files even if one fails
        }
      }

      return views;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        // No .alexandria directory
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific codebase view by ID
   */
  async getCodebaseView(
    owner: string,
    name: string,
    viewId: string,
    branch: string = 'main'
  ): Promise<CodebaseView | null> {
    const adapter = new GitHubFileSystemAdapter(owner, name, branch, this.token);

    try {
      // Fetch and parse the specific view file
      const viewPath = `.alexandria/views/${viewId}.json`;
      const content = await adapter.readFile(viewPath);
      const view = JSON.parse(content) as CodebaseView;

      return view;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}
