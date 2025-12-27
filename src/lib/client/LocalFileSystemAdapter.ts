/**
 * Local Filesystem Adapter using the File System Access API
 *
 * This adapter provides file operations for a local directory selected via
 * showDirectoryPicker(). It implements async methods for reading/writing files
 * and building file trees.
 *
 * Note: Only works in Chrome/Edge browsers.
 */

// Default directories/files to ignore when building file tree
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.cache',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  'target', // Rust
  'vendor', // Go, PHP
];

export class LocalFileSystemAdapter {
  private rootHandle: FileSystemDirectoryHandle;
  private ignorePatterns: string[];

  constructor(
    rootHandle: FileSystemDirectoryHandle,
    ignorePatterns: string[] = DEFAULT_IGNORE
  ) {
    this.rootHandle = rootHandle;
    this.ignorePatterns = ignorePatterns;
  }

  /**
   * Get the root folder name
   */
  get folderName(): string {
    return this.rootHandle.name;
  }

  /**
   * Navigate to a handle at a given path
   * @param path - Path relative to root (e.g., "src/lib/file.ts")
   * @param createDirs - Whether to create missing directories
   * @returns Object with parent handle and file/dir name
   */
  private async navigateToPath(
    path: string,
    createDirs = false
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new Error('Invalid path');
    }

    const name = parts.pop()!;
    let current: FileSystemDirectoryHandle = this.rootHandle;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: createDirs });
    }

    return { parent: current, name };
  }

  /**
   * Check if a path exists
   */
  async existsAsync(path: string): Promise<boolean> {
    try {
      const { parent, name } = await this.navigateToPath(path);

      // Try as file first
      try {
        await parent.getFileHandle(name);
        return true;
      } catch {
        // Try as directory
        try {
          await parent.getDirectoryHandle(name);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  async isDirectoryAsync(path: string): Promise<boolean> {
    if (!path || path === '/' || path === '.') {
      return true;
    }

    try {
      const { parent, name } = await this.navigateToPath(path);
      await parent.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read file contents as text
   */
  async readFileAsync(path: string): Promise<string> {
    const { parent, name } = await this.navigateToPath(path);
    const fileHandle = await parent.getFileHandle(name);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  /**
   * Read file contents as binary
   */
  async readBinaryFileAsync(path: string): Promise<Uint8Array> {
    const { parent, name } = await this.navigateToPath(path);
    const fileHandle = await parent.getFileHandle(name);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Write content to a file (creates parent directories if needed)
   */
  async writeFileAsync(path: string, content: string): Promise<void> {
    const { parent, name } = await this.navigateToPath(path, true);
    const fileHandle = await parent.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * Write binary content to a file
   */
  async writeBinaryFileAsync(path: string, content: Uint8Array): Promise<void> {
    const { parent, name } = await this.navigateToPath(path, true);
    const fileHandle = await parent.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    // Convert Uint8Array to ArrayBuffer for proper typing with File System Access API
    const buffer = new ArrayBuffer(content.length);
    new Uint8Array(buffer).set(content);
    await writable.write(new Blob([buffer]));
    await writable.close();
  }

  /**
   * Delete a file
   */
  async deleteFileAsync(path: string): Promise<void> {
    const { parent, name } = await this.navigateToPath(path);
    await parent.removeEntry(name);
  }

  /**
   * Delete a directory (recursively)
   */
  async deleteDirAsync(path: string): Promise<void> {
    const { parent, name } = await this.navigateToPath(path);
    await parent.removeEntry(name, { recursive: true });
  }

  /**
   * List directory contents
   */
  async readDirAsync(path: string): Promise<string[]> {
    let dirHandle: FileSystemDirectoryHandle;

    if (!path || path === '/' || path === '.') {
      dirHandle = this.rootHandle;
    } else {
      const { parent, name } = await this.navigateToPath(path);
      dirHandle = await parent.getDirectoryHandle(name);
    }

    const entries: string[] = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry.name);
    }
    return entries;
  }

  /**
   * Create a directory (and parent directories if needed)
   */
  async createDirAsync(path: string): Promise<void> {
    await this.navigateToPath(path + '/_placeholder', true);
    // The directory is created as a side effect of navigating with createDirs=true
  }

  /**
   * Build complete file tree by walking the directory recursively
   * @returns Array of all file paths (relative to root)
   */
  async buildFileTree(): Promise<string[]> {
    const files: string[] = [];

    async function* walkDirectory(
      handle: FileSystemDirectoryHandle,
      path: string,
      ignore: string[]
    ): AsyncGenerator<string> {
      for await (const entry of handle.values()) {
        // Skip ignored directories/files
        if (ignore.includes(entry.name)) {
          continue;
        }

        const entryPath = path ? `${path}/${entry.name}` : entry.name;

        if (entry.kind === 'file') {
          yield entryPath;
        } else {
          // It's a directory
          const subHandle = await handle.getDirectoryHandle(entry.name);
          yield* walkDirectory(subHandle, entryPath, ignore);
        }
      }
    }

    for await (const filePath of walkDirectory(
      this.rootHandle,
      '',
      this.ignorePatterns
    )) {
      files.push(filePath);
    }

    return files.sort();
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
    return parts.join('/') || '.';
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

  /**
   * Get repository identifier for this local folder
   */
  getRepositoryId(): string {
    return `local/${this.rootHandle.name}`;
  }

  /**
   * Check if adapter supports write operations
   */
  canWrite(): boolean {
    return true;
  }
}
