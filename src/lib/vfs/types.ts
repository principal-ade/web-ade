/**
 * Virtual File System Types
 *
 * These types define the interface for the VFS layer that sits between
 * panels and the underlying storage (GitHub API, local filesystem, etc.)
 */

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  /**
   * Optional token - not required when using API routes
   * that handle authentication via HTTP-only cookies.
   */
  token?: string;
}

export interface VFSConfig {
  mode: 'github' | 'local';
  github?: GitHubConfig;
  localHandle?: FileSystemDirectoryHandle;
}

export interface PendingFile {
  path: string;
  content: string;
  isNewFile: boolean;
  originalSha?: string;
  modifiedAt: Date;
}

export interface VFSStats {
  pendingCount: number;
  pendingPaths: string[];
  mountedAt: Date;
}

export interface FileMetadata {
  sha: string;
  size: number;
  encoding?: string;
}

/**
 * Configuration for creating a GitHubBackend instance
 */
export interface GitHubBackendConfig {
  owner: string;
  repo: string;
  branch: string;
  /**
   * Optional token getter - not required when using API routes
   * that handle authentication via HTTP-only cookies.
   */
  getToken?: () => string | null;
}

/**
 * Cached file entry in GitHubBackend
 */
export interface CachedFile {
  content: string;
  sha: string;
  size: number;
  fetchedAt: Date;
}
