import { Octokit } from '@octokit/rest';
import type { FileSystemAdapter, FileStats } from '@principal-ai/repository-abstraction';

/**
 * Server-side GitHub FileSystem Adapter for repository-abstraction
 * Uses Octokit to fetch files from GitHub repositories
 * All operations are async
 */
export class GitHubFileSystemAdapter implements FileSystemAdapter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;
  private cache: Map<string, string | boolean | string[]> = new Map();

  constructor(owner: string, repo: string, branch: string = 'main', token?: string) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
  }

  // Async file operations
  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `exists:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as boolean;
    }

    try {
      await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        ref: this.branch,
      });

      this.cache.set(cacheKey, true);
      return true;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        this.cache.set(cacheKey, false);
        return false;
      }
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `file:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as string;
    }

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        ref: this.branch,
      });

      if ('content' in data && data.type === 'file') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        this.cache.set(cacheKey, content);
        this.cache.set(`exists:${normalizedPath}`, true);
        return content;
      }

      throw new Error(`Path ${path} is not a file`);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);

    try {
      // Check if file exists to get SHA for update
      let sha: string | undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: normalizedPath,
          ref: this.branch,
        });

        if ('sha' in data && data.type === 'file') {
          sha = data.sha;
        }
      } catch (error: unknown) {
        // File doesn't exist - will create new file
        if (!(error && typeof error === 'object' && 'status' in error && error.status === 404)) {
          throw error;
        }
      }

      // Build request options
      const requestOptions: Parameters<typeof this.octokit.repos.createOrUpdateFileContents>[0] = {
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        message: `Update ${normalizedPath}`,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        branch: this.branch,
      };

      // Only include SHA for existing files
      if (sha) {
        requestOptions.sha = sha;
      }

      await this.octokit.repos.createOrUpdateFileContents(requestOptions);

      // Update cache
      this.cache.set(`file:${normalizedPath}`, content);
      this.cache.set(`exists:${normalizedPath}`, true);
    } catch (error: unknown) {
      throw new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);

    try {
      // Get current file SHA (required for deletion)
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        ref: this.branch,
      });

      if (!('sha' in data) || data.type !== 'file') {
        throw new Error(`Path ${path} is not a file`);
      }

      await this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        message: `Delete ${normalizedPath}`,
        sha: data.sha,
        branch: this.branch,
      });

      // Update cache
      this.cache.delete(`file:${normalizedPath}`);
      this.cache.set(`exists:${normalizedPath}`, false);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`Failed to delete file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async readBinaryFile(_path: string): Promise<Uint8Array> {
    throw new Error('Binary file operations not implemented');
  }

  async writeBinaryFile(_path: string, _content: Uint8Array): Promise<void> {
    throw new Error('Binary file operations not implemented');
  }

  async createDir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    // GitHub doesn't have empty directories, they're created implicitly with files
    // No-op for GitHub
  }

  async readDir(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `dir:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as string[];
    }

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        ref: this.branch,
      });

      if (!Array.isArray(data)) {
        throw new Error(`Path ${path} is not a directory`);
      }

      const files = data.map(item => item.name);
      this.cache.set(cacheKey, files);
      this.cache.set(`exists:${normalizedPath}`, true);
      this.cache.set(`isdir:${normalizedPath}`, true);
      return files;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        this.cache.set(`exists:${normalizedPath}`, false);
        return [];
      }
      throw error;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `isdir:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as boolean;
    }

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        ref: this.branch,
      });

      const isDir = Array.isArray(data);
      this.cache.set(cacheKey, isDir);
      this.cache.set(`exists:${normalizedPath}`, true);
      return isDir;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        this.cache.set(`exists:${normalizedPath}`, false);
        this.cache.set(cacheKey, false);
        return false;
      }
      throw error;
    }
  }

  async deleteDir(_path: string): Promise<void> {
    throw new Error('Directory deletion not supported for GitHub adapter');
  }

  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error('Rename operation not supported for GitHub adapter');
  }

  async stat(path: string): Promise<FileStats> {
    const normalizedPath = this.normalizePath(path);

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedPath,
        ref: this.branch,
      });

      if (Array.isArray(data)) {
        return {
          mtime: new Date(),
          isDirectory: true,
          size: 0,
        };
      }

      return {
        mtime: new Date(),
        isDirectory: false,
        size: data.size || 0,
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        throw new Error(`Path not found: ${path}`);
      }
      throw error;
    }
  }

  // Path operations
  join(...paths: string[]): string {
    return paths
      .filter(p => p)
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }

  relative(from: string, to: string): string {
    const fromParts = from.split('/').filter(p => p);
    const toParts = to.split('/').filter(p => p);

    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
      common++;
    }

    const upCount = fromParts.length - common;
    const upParts = new Array(upCount).fill('..');
    const remainingParts = toParts.slice(common);

    return [...upParts, ...remainingParts].join('/') || '.';
  }

  dirname(path: string): string {
    const parts = path.split('/').filter(p => p);
    parts.pop();
    return parts.join('/') || '/';
  }

  basename(path: string): string {
    const parts = path.split('/').filter(p => p);
    return parts[parts.length - 1] || '';
  }

  extname(path: string): string {
    const base = this.basename(path);
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0) return '';
    return base.slice(lastDot);
  }

  isAbsolute(path: string): boolean {
    return path.startsWith('/');
  }

  normalizeRepositoryPath(): string {
    return `${this.owner}/${this.repo}`;
  }

  findProjectRoot(): string {
    return `${this.owner}/${this.repo}`;
  }

  getRepositoryName(): string {
    return this.repo;
  }

  // Sync path helper methods
  normalize(path: string): string {
    return this.normalizePath(path);
  }

  homedir(): string {
    return '/';
  }

  // Helper to normalize paths for GitHub API
  private normalizePath(path: string): string {
    // Remove leading slash for GitHub API
    return path.replace(/^\/+/, '');
  }

  clearCache(): void {
    this.cache.clear();
  }
}
