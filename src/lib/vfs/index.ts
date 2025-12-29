/**
 * Virtual File System Module
 *
 * Provides a unified file operations API with overlay/pending changes support.
 *
 * Usage:
 * ```typescript
 * import { createVirtualFileSystem } from '@/lib/vfs';
 *
 * const vfs = createVirtualFileSystem({
 *   mode: 'github',
 *   github: { owner, repo, branch, token }
 * });
 *
 * await vfs.initialize();
 * const content = await vfs.readFile('src/file.ts');
 * await vfs.writeFile('src/file.ts', newContent);
 * ```
 */

// Types
export type {
  VFSConfig,
  GitHubConfig,
  PendingFile,
  VFSStats,
  FileMetadata,
  GitHubBackendConfig,
  CachedFile,
} from './types';

// Classes
export { VirtualFileSystem, createVirtualFileSystem } from './VirtualFileSystem';
export { GitHubBackend, FileNotFoundError, createGitHubBackend } from './GitHubBackend';
