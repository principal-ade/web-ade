import { Octokit } from '@octokit/rest';
import type { FileSystemAdapter } from '@backlog-md/core';

/**
 * Server-side GitHub FileSystem Adapter for @backlog-md/core
 * Supports reading existing files and writing new task files
 */
export class GitHubBacklogAdapter implements FileSystemAdapter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;
  private fileCache: Map<string, string> = new Map();
  private dirCache: Set<string> = new Set();
  private writtenFiles: Map<string, string> = new Map(); // Track files written during this session

  constructor(owner: string, repo: string, branch: string = 'main', token: string) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Get all files that were written during this session (for committing)
   */
  getWrittenFiles(): Map<string, string> {
    return this.writtenFiles;
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);

    // Check if written in this session
    if (this.writtenFiles.has(normalized)) {
      return true;
    }

    // Check cache
    if (this.fileCache.has(normalized) || this.dirCache.has(normalized)) {
      return true;
    }

    // Check GitHub
    try {
      await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalized,
        ref: this.branch,
      });
      return true;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    const normalized = this.normalizePath(path);

    // Check if written in this session
    if (this.writtenFiles.has(normalized)) {
      return this.writtenFiles.get(normalized)!;
    }

    // Check cache
    if (this.fileCache.has(normalized)) {
      return this.fileCache.get(normalized)!;
    }

    // Fetch from GitHub
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalized,
        ref: this.branch,
      });

      if ('content' in data && data.type === 'file') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        this.fileCache.set(normalized, content);
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
    const normalized = this.normalizePath(path);

    // Store in memory - we'll commit all files together later
    this.writtenFiles.set(normalized, content);
    this.fileCache.set(normalized, content);

    // Add parent directories to dir cache
    const parts = normalized.split('/');
    for (let i = 1; i < parts.length; i++) {
      this.dirCache.add(parts.slice(0, i).join('/'));
    }
  }

  async deleteFile(_path: string): Promise<void> {
    throw new Error('Delete operations not implemented');
  }

  async createDir(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    this.dirCache.add(normalized);
    // GitHub doesn't have empty directories, so this is a no-op
  }

  async readDir(path: string): Promise<string[]> {
    const normalized = this.normalizePath(path);
    const prefix = normalized ? `${normalized}/` : '';

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalized,
        ref: this.branch,
      });

      if (Array.isArray(data)) {
        const entries = data.map(item => item.name);

        // Also include any written files in this directory
        for (const filePath of this.writtenFiles.keys()) {
          if (filePath.startsWith(prefix)) {
            const remaining = filePath.slice(prefix.length);
            const nextSlash = remaining.indexOf('/');
            const entry = nextSlash === -1 ? remaining : remaining.slice(0, nextSlash);
            if (entry && !entries.includes(entry)) {
              entries.push(entry);
            }
          }
        }

        return entries;
      }

      throw new Error(`Path ${path} is not a directory`);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        // Directory doesn't exist yet, return only written files
        const entries = new Set<string>();
        for (const filePath of this.writtenFiles.keys()) {
          if (filePath.startsWith(prefix)) {
            const remaining = filePath.slice(prefix.length);
            const nextSlash = remaining.indexOf('/');
            const entry = nextSlash === -1 ? remaining : remaining.slice(0, nextSlash);
            if (entry) {
              entries.add(entry);
            }
          }
        }
        return Array.from(entries);
      }
      throw error;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);

    // Check cache
    if (this.dirCache.has(normalized)) {
      return true;
    }

    // Check if it's a written file (then it's not a directory)
    if (this.writtenFiles.has(normalized) || this.fileCache.has(normalized)) {
      return false;
    }

    // Check GitHub
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalized,
        ref: this.branch,
      });

      const isDir = Array.isArray(data);
      if (isDir) {
        this.dirCache.add(normalized);
      }
      return isDir;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  async rename(_from: string, _to: string): Promise<void> {
    throw new Error('Rename operations not implemented');
  }

  async stat(path: string): Promise<{ mtime: Date; isDirectory: boolean; size: number }> {
    const normalized = this.normalizePath(path);
    const isDir = await this.isDirectory(normalized);
    const exists = await this.exists(normalized);

    if (!exists) {
      throw new Error(`Path not found: ${path}`);
    }

    let size = 0;
    if (!isDir) {
      const content = await this.readFile(normalized);
      size = Buffer.byteLength(content, 'utf-8');
    }

    return {
      mtime: new Date(),
      isDirectory: isDir,
      size,
    };
  }

  // Path utilities

  join(...paths: string[]): string {
    return paths
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\//, '');
  }

  dirname(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  basename(path: string, ext?: string): string {
    const base = path.split('/').pop() || '';
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }
    return base;
  }

  extname(path: string): string {
    const base = this.basename(path);
    const dotIndex = base.lastIndexOf('.');
    return dotIndex === -1 ? '' : base.slice(dotIndex);
  }

  relative(from: string, to: string): string {
    const fromParts = from.split('/').filter(Boolean);
    const toParts = to.split('/').filter(Boolean);

    let commonLength = 0;
    while (
      commonLength < fromParts.length &&
      commonLength < toParts.length &&
      fromParts[commonLength] === toParts[commonLength]
    ) {
      commonLength++;
    }

    const upCount = fromParts.length - commonLength;
    const relativeParts = [
      ...Array(upCount).fill('..'),
      ...toParts.slice(commonLength),
    ];

    return relativeParts.join('/') || '.';
  }

  isAbsolute(path: string): boolean {
    return path.startsWith('/');
  }

  normalize(path: string): string {
    return this.normalizePath(path);
  }

  homedir(): string {
    return '';
  }

  private normalizePath(path: string): string {
    return path
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/');
  }
}
