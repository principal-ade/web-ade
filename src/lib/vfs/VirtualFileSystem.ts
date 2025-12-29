/**
 * VirtualFileSystem - Overlay filesystem with pending changes layer
 *
 * Provides a unified file operations API that:
 * - Checks pending (in-memory) layer first for reads
 * - Falls back to GitHub API for cache misses
 * - Writes always go to pending layer
 * - Tracks pending changes for commit
 *
 * Design constraints (for future multi-branch support):
 * - Backends stored in Map, not singleton
 * - Branch is parameterized, not hardcoded
 * - Path normalization preserves mount points
 */

import { GitHubBackend, FileNotFoundError, createGitHubBackend } from './GitHubBackend';
import type { VFSConfig, PendingFile, VFSStats, GitHubBackendConfig } from './types';

export class VirtualFileSystem {
  private config: VFSConfig;
  private backends: Map<string, GitHubBackend> = new Map();
  private pendingLayer: Map<string, PendingFile> = new Map();
  private initialized = false;
  private mountedAt: Date | null = null;
  private primaryBranch: string | null = null;

  constructor(config: VFSConfig) {
    this.config = config;
  }

  /**
   * Factory for creating GitHubBackend instances
   * Enables future multi-branch support
   */
  private createBackend(branch: string): GitHubBackend {
    if (!this.config.github) {
      throw new Error('GitHub config required');
    }

    const backendConfig: GitHubBackendConfig = {
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      branch,
      // Token is optional - our API routes handle auth via HTTP-only cookies
      getToken: this.config.github.token ? () => this.config.github?.token ?? null : undefined,
    };

    return createGitHubBackend(backendConfig);
  }

  /**
   * Get the primary branch backend
   */
  private getPrimaryBackend(): GitHubBackend | undefined {
    if (!this.primaryBranch) return undefined;
    return this.backends.get(this.primaryBranch);
  }

  /**
   * Initialize the filesystem
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.mode === 'github' && this.config.github) {
      const branch = this.config.github.branch;
      const backend = this.createBackend(branch);
      this.backends.set(branch, backend);
      this.primaryBranch = branch;
    }

    this.initialized = true;
    this.mountedAt = new Date();
  }

  /**
   * Ensure VFS is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('VirtualFileSystem not initialized. Call initialize() first.');
    }
  }

  /**
   * Normalize a path by removing leading/trailing slashes
   */
  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  /**
   * Read a file - checks pending layer first, then falls back to GitHub
   */
  async readFile(path: string): Promise<string> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    // Check pending layer first (overlay behavior)
    const pending = this.pendingLayer.get(normalPath);
    if (pending) {
      return pending.content;
    }

    // Fall back to GitHub backend
    const backend = this.getPrimaryBackend();
    if (!backend) {
      throw new Error('No backend available');
    }

    try {
      return await backend.readFile(normalPath);
    } catch (e) {
      if (e instanceof FileNotFoundError) {
        throw new Error(`File not found: ${path}`);
      }
      throw e;
    }
  }

  /**
   * Write a file - always goes to pending layer
   */
  async writeFile(path: string, content: string): Promise<void> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    // Check if file exists (for tracking isNewFile)
    let isNewFile = true;
    let originalSha: string | undefined;

    // First check pending layer
    const existingPending = this.pendingLayer.get(normalPath);
    if (existingPending) {
      // Updating an already-pending file
      isNewFile = existingPending.isNewFile;
      originalSha = existingPending.originalSha;
    } else {
      // Check if file exists on GitHub
      const backend = this.getPrimaryBackend();
      if (backend) {
        try {
          await backend.readFile(normalPath);
          isNewFile = false;
          originalSha = backend.getSha(normalPath);
        } catch {
          // File doesn't exist on GitHub - it's new
        }
      }
    }

    // Store in pending layer
    this.pendingLayer.set(normalPath, {
      path: normalPath,
      content,
      isNewFile,
      originalSha,
      modifiedAt: new Date(),
    });
  }

  /**
   * Check if a file exists (in pending layer or on GitHub)
   */
  async exists(path: string): Promise<boolean> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    // Check pending layer
    if (this.pendingLayer.has(normalPath)) {
      return true;
    }

    // Check GitHub
    const backend = this.getPrimaryBackend();
    if (backend) {
      return backend.exists(normalPath);
    }

    return false;
  }

  /**
   * Delete a file (marks as deleted in pending layer)
   */
  async unlink(path: string): Promise<void> {
    this.ensureInitialized();
    const normalPath = this.normalizePath(path);

    const backend = this.getPrimaryBackend();
    const originalSha = backend?.getSha(normalPath);

    // Track deletion as pending change with empty content
    this.pendingLayer.set(normalPath, {
      path: normalPath,
      content: '', // Empty content signals deletion
      isNewFile: false,
      originalSha,
      modifiedAt: new Date(),
    });
  }

  /**
   * Get all pending changes for commit
   */
  getPendingChanges(): PendingFile[] {
    return Array.from(this.pendingLayer.values());
  }

  /**
   * Check if there are pending changes
   */
  hasPendingChanges(): boolean {
    return this.pendingLayer.size > 0;
  }

  /**
   * Get pending change for a specific path
   */
  getPendingChange(path: string): PendingFile | undefined {
    return this.pendingLayer.get(this.normalizePath(path));
  }

  /**
   * Check if a specific path has pending changes
   */
  hasPendingChange(path: string): boolean {
    return this.pendingLayer.has(this.normalizePath(path));
  }

  /**
   * Clear specific pending changes (after successful commit)
   */
  clearPendingChanges(paths: string[]): void {
    for (const path of paths) {
      const normalPath = this.normalizePath(path);
      this.pendingLayer.delete(normalPath);

      // Also invalidate the GitHub cache for this path
      // so next read fetches fresh content
      const backend = this.getPrimaryBackend();
      backend?.invalidate(normalPath);
    }
  }

  /**
   * Clear all pending changes (discard all)
   */
  clearAllPendingChanges(): void {
    this.pendingLayer.clear();
  }

  /**
   * Get VFS statistics
   */
  getStats(): VFSStats {
    return {
      pendingCount: this.pendingLayer.size,
      pendingPaths: Array.from(this.pendingLayer.keys()),
      mountedAt: this.mountedAt ?? new Date(),
    };
  }

  /**
   * Refresh from remote (clear caches)
   */
  async refresh(): Promise<void> {
    for (const backend of this.backends.values()) {
      backend.clearCache();
    }
  }

  /**
   * Get the current branch
   */
  getCurrentBranch(): string | null {
    return this.primaryBranch;
  }

  /**
   * Check if VFS is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================
  // Future: Multi-branch support methods
  // ============================================

  /**
   * Mount an additional branch for comparison (future)
   */
  async mountBranch(branch: string): Promise<void> {
    if (!this.config.github) {
      throw new Error('GitHub config required for branch mounting');
    }

    if (this.backends.has(branch)) {
      return; // Already mounted
    }

    const backend = this.createBackend(branch);
    this.backends.set(branch, backend);
  }

  /**
   * Unmount a comparison branch (future)
   */
  unmountBranch(branch: string): void {
    // Don't allow unmounting the primary branch
    if (branch === this.primaryBranch) {
      throw new Error('Cannot unmount primary branch');
    }
    this.backends.delete(branch);
  }

  /**
   * Read file from a specific branch (future)
   */
  async readFileFromBranch(path: string, branch: string): Promise<string> {
    this.ensureInitialized();

    // Mount branch if not already mounted
    await this.mountBranch(branch);

    const backend = this.backends.get(branch);
    if (!backend) {
      throw new Error(`Branch not mounted: ${branch}`);
    }

    return backend.readFile(this.normalizePath(path));
  }

  /**
   * Compare file across branches (future)
   */
  async compareFile(
    path: string,
    baseBranch: string,
    headBranch: string
  ): Promise<{ base: string | null; head: string | null; differs: boolean }> {
    const [base, head] = await Promise.all([
      this.readFileFromBranch(path, baseBranch).catch(() => null),
      this.readFileFromBranch(path, headBranch).catch(() => null),
    ]);

    return {
      base,
      head,
      differs: base !== head,
    };
  }

  /**
   * Get list of mounted branches
   */
  getMountedBranches(): string[] {
    return Array.from(this.backends.keys());
  }
}

/**
 * Create a new VirtualFileSystem instance
 */
export function createVirtualFileSystem(config: VFSConfig): VirtualFileSystem {
  return new VirtualFileSystem(config);
}
