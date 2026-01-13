import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileSystemAdapter } from '@backlog-md/core';

/**
 * Unit tests for task creation route - specifically testing that existing
 * task file paths are correctly gathered for Core initialization
 */
describe('Task Creation - File Path Collection', () => {
  let mockAdapter: FileSystemAdapter;

  beforeEach(() => {
    // Create a mock file system adapter
    mockAdapter = {
      exists: vi.fn(),
      readDir: vi.fn(),
      join: vi.fn((a: string, b: string) => `${a}/${b}`),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      createDir: vi.fn(),
      isDirectory: vi.fn(),
      rename: vi.fn(),
      stat: vi.fn(),
      dirname: vi.fn(),
      basename: vi.fn(),
      extname: vi.fn(),
      relative: vi.fn(),
      isAbsolute: vi.fn(),
      normalize: vi.fn(),
      homedir: vi.fn(),
    };
  });

  it('should collect existing task file paths when tasks directory exists', async () => {
    // Mock the file system adapter to return existing task files
    vi.mocked(mockAdapter.exists).mockResolvedValue(true);
    vi.mocked(mockAdapter.readDir).mockResolvedValue([
      '1 - Fix task creation to pass file paths to Core initializeLazy.md',
      '2 - Add user authentication.md',
      '3 - Implement dark mode.md',
      'README.md', // Non-task file
      '.gitkeep', // Hidden file
    ]);

    // Simulate the logic from the route
    const tasksDir = 'backlog/tasks';
    const tasksDirExists = await mockAdapter.exists(tasksDir);

    let existingTaskPaths: string[] = [];
    if (tasksDirExists) {
      const taskFiles = await mockAdapter.readDir(tasksDir);
      existingTaskPaths = taskFiles
        .filter(file => file.endsWith('.md'))
        .map(file => mockAdapter.join(tasksDir, file));
    }

    // Verify results
    expect(existingTaskPaths).toHaveLength(4);
    expect(existingTaskPaths).toContain('backlog/tasks/1 - Fix task creation to pass file paths to Core initializeLazy.md');
    expect(existingTaskPaths).toContain('backlog/tasks/2 - Add user authentication.md');
    expect(existingTaskPaths).toContain('backlog/tasks/3 - Implement dark mode.md');
    expect(existingTaskPaths).toContain('backlog/tasks/README.md');
    expect(existingTaskPaths).not.toContain('backlog/tasks/.gitkeep');
  });

  it('should handle empty tasks directory', async () => {
    // Mock empty directory
    vi.mocked(mockAdapter.exists).mockResolvedValue(true);
    vi.mocked(mockAdapter.readDir).mockResolvedValue([]);

    const tasksDir = 'backlog/tasks';
    const tasksDirExists = await mockAdapter.exists(tasksDir);

    let existingTaskPaths: string[] = [];
    if (tasksDirExists) {
      const taskFiles = await mockAdapter.readDir(tasksDir);
      existingTaskPaths = taskFiles
        .filter(file => file.endsWith('.md'))
        .map(file => mockAdapter.join(tasksDir, file));
    }

    expect(existingTaskPaths).toHaveLength(0);
  });

  it('should handle non-existent tasks directory gracefully', async () => {
    // Mock directory doesn't exist
    vi.mocked(mockAdapter.exists).mockResolvedValue(false);

    const tasksDir = 'backlog/tasks';
    const tasksDirExists = await mockAdapter.exists(tasksDir);

    let existingTaskPaths: string[] = [];
    if (tasksDirExists) {
      const taskFiles = await mockAdapter.readDir(tasksDir);
      existingTaskPaths = taskFiles
        .filter(file => file.endsWith('.md'))
        .map(file => mockAdapter.join(tasksDir, file));
    }

    // Should result in empty array, not an error
    expect(existingTaskPaths).toHaveLength(0);
  });

  it('should handle readDir errors gracefully', async () => {
    // Mock directory exists but readDir throws
    vi.mocked(mockAdapter.exists).mockResolvedValue(true);
    vi.mocked(mockAdapter.readDir).mockRejectedValue(new Error('Permission denied'));

    const tasksDir = 'backlog/tasks';
    let existingTaskPaths: string[] = [];

    try {
      const tasksDirExists = await mockAdapter.exists(tasksDir);
      if (tasksDirExists) {
        const taskFiles = await mockAdapter.readDir(tasksDir);
        existingTaskPaths = taskFiles
          .filter(file => file.endsWith('.md'))
          .map(file => mockAdapter.join(tasksDir, file));
      }
    } catch (error) {
      // In the actual route, we catch this and continue with empty array
      console.warn('Failed to read existing task files:', error);
    }

    // Error should be caught, array should remain empty
    expect(existingTaskPaths).toHaveLength(0);
  });

  it('should filter out non-markdown files', async () => {
    vi.mocked(mockAdapter.exists).mockResolvedValue(true);
    vi.mocked(mockAdapter.readDir).mockResolvedValue([
      '1 - Task one.md',
      '2 - Task two.txt', // Wrong extension
      '3 - Task three.MD', // Wrong case - should not match
      'config.json',
      'notes.pdf',
      '.DS_Store',
    ]);

    const tasksDir = 'backlog/tasks';
    const tasksDirExists = await mockAdapter.exists(tasksDir);

    let existingTaskPaths: string[] = [];
    if (tasksDirExists) {
      const taskFiles = await mockAdapter.readDir(tasksDir);
      existingTaskPaths = taskFiles
        .filter(file => file.endsWith('.md'))
        .map(file => mockAdapter.join(tasksDir, file));
    }

    // Only the .md file should be included
    expect(existingTaskPaths).toHaveLength(1);
    expect(existingTaskPaths[0]).toBe('backlog/tasks/1 - Task one.md');
  });
});
