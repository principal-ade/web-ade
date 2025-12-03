import { Octokit } from '@octokit/rest';
import type { FileSystemAdapter } from '@principal-ai/alexandria-core-library';

/**
 * Server-side GitHub FileSystem Adapter for alexandria-core-library
 * Uses Octokit to fetch files from GitHub repositories
 * All operations are async and work properly with the library
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

  // File operations (synchronous interface, but backed by cache from async operations)
  exists(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `exists:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as boolean;
    }

    // If not in cache, return false (must be pre-fetched)
    return false;
  }

  readFile(path: string): string {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `file:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as string;
    }

    throw new Error(`File not in cache: ${path}. Must be pre-fetched using async methods.`);
  }

  writeFile(): void {
    throw new Error('GitHubFileSystemAdapter is read-only');
  }

  deleteFile(): void {
    throw new Error('GitHubFileSystemAdapter is read-only');
  }

  readBinaryFile(): Uint8Array {
    throw new Error('Binary file operations not implemented');
  }

  writeBinaryFile(): void {
    throw new Error('GitHubFileSystemAdapter is read-only');
  }

  createDir(): void {
    throw new Error('GitHubFileSystemAdapter is read-only');
  }

  readDir(path: string): string[] {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `dir:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as string[];
    }

    throw new Error(`Directory not in cache: ${path}. Must be pre-fetched using async methods.`);
  }

  deleteDir(): void {
    throw new Error('GitHubFileSystemAdapter is read-only');
  }

  isDirectory(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const cacheKey = `isdir:${normalizedPath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as boolean;
    }

    return false;
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

  // Async methods for pre-fetching data
  async existsAsync(path: string): Promise<boolean> {
    try {
      await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: this.normalizePath(path),
        ref: this.branch,
      });

      const normalizedPath = this.normalizePath(path);
      this.cache.set(`exists:${normalizedPath}`, true);
      return true;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        const normalizedPath = this.normalizePath(path);
        this.cache.set(`exists:${normalizedPath}`, false);
        return false;
      }
      throw error;
    }
  }

  async readFileAsync(path: string): Promise<string> {
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

  async readDirAsync(path: string): Promise<string[]> {
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

  async isDirectoryAsync(path: string): Promise<boolean> {
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

  // Helper to normalize paths for GitHub API
  private normalizePath(path: string): string {
    // Remove leading slash for GitHub API
    return path.replace(/^\/+/, '');
  }

  clearCache(): void {
    this.cache.clear();
  }
}
