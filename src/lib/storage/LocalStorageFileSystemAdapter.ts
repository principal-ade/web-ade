/**
 * LocalStorage implementation of FileSystemAdapter
 *
 * This adapter uses browser localStorage to store workspace data.
 * It enables using localStorage as a storage backend for user collections,
 * with the same interface as GitHubFileSystemAdapter for easy swapping.
 *
 * Key format: Path like `/workspaces.json` maps to localStorage key `user-workspaces`
 */
import type { FileSystemAdapter } from '@principal-ai/alexandria-core-library/github';

// Map file paths to localStorage keys
const PATH_TO_KEY: Record<string, string> = {
  '/workspaces.json': 'user-workspaces',
  '/workspace-memberships.json': 'user-workspace-memberships',
};

// Default content for files that don't exist yet
const DEFAULT_CONTENT: Record<string, string> = {
  '/workspaces.json': JSON.stringify({ version: '1.0', workspaces: [] }),
  '/workspace-memberships.json': JSON.stringify({ version: '1.0', memberships: [] }),
};

/**
 * LocalStorage implementation of FileSystemAdapter
 */
export class LocalStorageFileSystemAdapter implements FileSystemAdapter {
  private getStorageKey(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const key = PATH_TO_KEY[normalizedPath];
    if (!key) {
      throw new Error(`Unknown path: ${path}. Only /workspaces.json and /workspace-memberships.json are supported.`);
    }
    return key;
  }

  private getDefaultContent(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return DEFAULT_CONTENT[normalizedPath] || '{}';
  }

  // Async methods (primary API for browser use)

  async existsAsync(path: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const key = this.getStorageKey(path);
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  async readFileAsync(path: string): Promise<string> {
    if (typeof window === 'undefined') {
      return this.getDefaultContent(path);
    }
    try {
      const key = this.getStorageKey(path);
      const content = localStorage.getItem(key);
      return content ?? this.getDefaultContent(path);
    } catch {
      return this.getDefaultContent(path);
    }
  }

  async writeFileAsync(path: string, content: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const key = this.getStorageKey(path);
      localStorage.setItem(key, content);
    } catch (error) {
      console.error('Failed to write to localStorage:', error);
      throw error;
    }
  }

  async deleteFileAsync(path: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const key = this.getStorageKey(path);
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to delete from localStorage:', error);
    }
  }

  async readDirAsync(_path: string): Promise<string[]> {
    // Return the known files
    return ['workspaces.json', 'workspace-memberships.json'];
  }

  async isDirectoryAsync(path: string): Promise<boolean> {
    return path === '/' || path === '';
  }

  // Preload methods (no-op for localStorage since it's synchronous)

  async preload(_path: string): Promise<void> {
    // No-op - localStorage is synchronous
  }

  async preloadDirectory(_path?: string): Promise<void> {
    // No-op - localStorage is synchronous
  }

  // Sync methods (implement FileSystemAdapter interface)

  exists(path: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const key = this.getStorageKey(path);
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  readFile(path: string): string {
    if (typeof window === 'undefined') {
      return this.getDefaultContent(path);
    }
    try {
      const key = this.getStorageKey(path);
      const content = localStorage.getItem(key);
      return content ?? this.getDefaultContent(path);
    } catch {
      return this.getDefaultContent(path);
    }
  }

  writeFile(path: string, content: string): void {
    if (typeof window === 'undefined') return;
    try {
      const key = this.getStorageKey(path);
      localStorage.setItem(key, content);
    } catch (error) {
      console.error('Failed to write to localStorage:', error);
    }
  }

  deleteFile(path: string): void {
    if (typeof window === 'undefined') return;
    try {
      const key = this.getStorageKey(path);
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to delete from localStorage:', error);
    }
  }

  readBinaryFile(_path: string): Uint8Array {
    throw new Error('Binary files not supported in localStorage adapter');
  }

  writeBinaryFile(_path: string, _content: Uint8Array): void {
    throw new Error('Binary files not supported in localStorage adapter');
  }

  createDir(_path: string): void {
    // No-op - directories don't exist in localStorage
  }

  readDir(_path: string): string[] {
    return ['workspaces.json', 'workspace-memberships.json'];
  }

  deleteDir(_path: string): void {
    // No-op - directories don't exist in localStorage
  }

  isDirectory(path: string): boolean {
    return path === '/' || path === '';
  }

  // Path utilities

  join(...paths: string[]): string {
    return paths
      .map((p, i) => {
        if (i === 0) return p.replace(/\/+$/, '');
        return p.replace(/^\/+|\/+$/g, '');
      })
      .filter(Boolean)
      .join('/');
  }

  dirname(path: string): string {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }

  basename(filePath: string, ext?: string): string {
    const base = filePath.split('/').pop() || '';
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }
    return base;
  }

  extname(filePath: string): string {
    const base = filePath.split('/').pop() || '';
    const dotIndex = base.lastIndexOf('.');
    return dotIndex > 0 ? base.slice(dotIndex) : '';
  }

  isAbsolute(path: string): boolean {
    return path.startsWith('/');
  }

  relative(_from: string, to: string): string {
    // Simple implementation - just return the target path
    return to;
  }

  normalizeRepositoryPath(inputPath: string): string {
    return inputPath.startsWith('/') ? inputPath : `/${inputPath}`;
  }

  findProjectRoot(_inputPath: string): string {
    return '/';
  }

  getRepositoryName(_repositoryPath: string): string {
    return 'user-collections';
  }

  // Additional utility methods

  clearCache(): void {
    // Clear all user collection data from localStorage
    if (typeof window === 'undefined') return;
    Object.values(PATH_TO_KEY).forEach(key => {
      localStorage.removeItem(key);
    });
  }

  getCacheStats(): { files: number; directories: number; exists: number } {
    if (typeof window === 'undefined') {
      return { files: 0, directories: 0, exists: 0 };
    }
    const fileCount = Object.values(PATH_TO_KEY).filter(
      key => localStorage.getItem(key) !== null
    ).length;
    return { files: fileCount, directories: 1, exists: fileCount };
  }

  getRepositoryId(): string {
    return 'local/user-collections';
  }

  canWrite(): boolean {
    return typeof window !== 'undefined';
  }
}
