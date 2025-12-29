/**
 * GitHubBackend - Fetches files from GitHub API with caching
 *
 * This is a simple cache/fetch layer, not a full ZenFS backend.
 * It handles:
 * - Fetching file content from GitHub API
 * - Caching content and SHA for later use
 * - Branch-parameterized access for future multi-branch support
 */

import type { GitHubBackendConfig, CachedFile } from './types';

export class GitHubBackend {
  private config: GitHubBackendConfig;
  private cache: Map<string, CachedFile> = new Map();

  constructor(config: GitHubBackendConfig) {
    this.config = config;
  }

  get branch(): string {
    return this.config.branch;
  }

  get owner(): string {
    return this.config.owner;
  }

  get repo(): string {
    return this.config.repo;
  }

  /**
   * Normalize a path by removing leading/trailing slashes
   */
  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  /**
   * Check if a file is in the cache
   */
  has(path: string): boolean {
    return this.cache.has(this.normalizePath(path));
  }

  /**
   * Get cached file if available
   */
  getCached(path: string): CachedFile | undefined {
    return this.cache.get(this.normalizePath(path));
  }

  /**
   * Get the SHA for a cached file (needed for commits)
   */
  getSha(path: string): string | undefined {
    return this.cache.get(this.normalizePath(path))?.sha;
  }

  /**
   * Read a file from GitHub, using cache if available
   */
  async readFile(path: string): Promise<string> {
    const normalPath = this.normalizePath(path);

    // Check cache first
    const cached = this.cache.get(normalPath);
    if (cached) {
      return cached.content;
    }

    // Fetch from GitHub
    const result = await this.fetchFromGitHub(normalPath);
    return result.content;
  }

  /**
   * Check if a file exists on GitHub
   */
  async exists(path: string): Promise<boolean> {
    const normalPath = this.normalizePath(path);

    // Check cache first
    if (this.cache.has(normalPath)) {
      return true;
    }

    // Try to fetch from GitHub
    try {
      await this.fetchFromGitHub(normalPath);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Fetch file content from GitHub API
   * Note: Token is handled by HTTP-only cookies in our API routes,
   * so we don't need to pass it explicitly here.
   */
  private async fetchFromGitHub(path: string): Promise<CachedFile> {
    const { owner, repo, branch } = this.config;
    const url = `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(path)}&ref=${branch}`;

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies for authentication
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new FileNotFoundError(path);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    // Decode base64 content
    let content: string;
    if (data.encoding === 'base64') {
      content = decodeBase64(data.content);
    } else {
      content = data.content;
    }

    const cachedFile: CachedFile = {
      content,
      sha: data.sha,
      size: data.size || content.length,
      fetchedAt: new Date(),
    };

    // Cache the result
    this.cache.set(path, cachedFile);

    return cachedFile;
  }

  /**
   * Invalidate a specific path in the cache
   */
  invalidate(path: string): void {
    this.cache.delete(this.normalizePath(path));
  }

  /**
   * Clear entire cache (e.g., after branch switch or commit)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all cached paths
   */
  getCachedPaths(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Custom error for file not found
 */
export class FileNotFoundError extends Error {
  public readonly path: string;
  public readonly code = 'ENOENT';

  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = 'FileNotFoundError';
    this.path = path;
  }
}

/**
 * Decode base64 string, handling Unicode properly
 */
function decodeBase64(base64: string): string {
  // Remove any whitespace/newlines that GitHub might include
  const cleaned = base64.replace(/\s/g, '');

  // Use atob for browser, Buffer for Node
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    // Browser: decode and handle UTF-8
    const binary = window.atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } else {
    // Node.js
    return Buffer.from(cleaned, 'base64').toString('utf-8');
  }
}

/**
 * Factory function for creating GitHubBackend instances
 * Enables future multi-branch support
 */
export function createGitHubBackend(config: GitHubBackendConfig): GitHubBackend {
  return new GitHubBackend(config);
}
