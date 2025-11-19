'use client';

/**
 * Panel Context Provider for web-ade
 * Implements panel-framework-core v0.1.1 context and event system
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { PanelEventBus } from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  DataSlice,
  WorkspaceMetadata,
  RepositoryMetadata,
} from '@principal-ade/panel-framework-core';
import type { ExtendedMarkdownFile } from '@industry-theme/alexandria-docs-panel/dist/types';
import type { CodebaseView } from '@principal-ai/alexandria-core-library/types';

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url?: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface PanelProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
}

interface PanelProviderValue {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
}

const PanelContext = createContext<PanelProviderValue | null>(null);

export function PanelProvider({ children, workspace, repository, githubRepo }: PanelProviderProps) {
  // Initialize event bus once
  const events = useMemo(() => new PanelEventBus(), []);

  // State for active file (README) content
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownLoading, setMarkdownLoading] = useState(false);
  const [markdownError, setMarkdownError] = useState<Error | null>(null);

  // State for markdown files list with associated files
  const [markdownFiles, setMarkdownFiles] = useState<ExtendedMarkdownFile[]>([]);
  const [markdownFilesLoading, setMarkdownFilesLoading] = useState(false);
  const [markdownFilesError, setMarkdownFilesError] = useState<Error | null>(null);

  // State for codebase views
  const [codebaseViews, setCodebaseViews] = useState<CodebaseView[]>([]);
  const [codebaseViewsLoading, setCodebaseViewsLoading] = useState(false);
  const [codebaseViewsError, setCodebaseViewsError] = useState<Error | null>(null);

  // State for file tree
  const [fileTree, setFileTree] = useState<{ root: string; files: Array<{ path: string; size: number; lines: number }> } | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // Fetch file tree from GitHub
  const fetchFileTree = useCallback(async (repo: string) => {
    setFileTreeLoading(true);
    setFileTreeError(null);
    console.log('[PanelContext] Fetching file tree for:', repo);

    try {
      const [owner, name] = repo.split('/');

      // Fetch file tree from GitHub API
      const response = await fetch(`/api/github/repo/${owner}/${name}?action=tree`);

      if (!response.ok) {
        throw new Error(`Failed to fetch file tree: ${response.statusText}`);
      }

      const tree: GitHubTreeResponse = await response.json();

      // Convert to the format expected by Code City panel
      const files = tree.tree
        .filter((item) => item.type === 'blob')
        .map((item) => ({
          path: item.path,
          size: item.size || 1000, // Default size if not provided
          lines: Math.ceil((item.size || 1000) / 50), // Estimate lines
        }));

      const fileTreeData = {
        root: `${owner}/${name}`,
        files,
      };

      setFileTree(fileTreeData);
      console.log('[PanelContext] File tree loaded with', files.length, 'files');
    } catch (err) {
      console.error('[PanelContext] Failed to fetch file tree:', err);
      setFileTreeError(err instanceof Error ? err : new Error('Failed to load file tree'));
    } finally {
      setFileTreeLoading(false);
    }
  }, []);

  // Fetch codebase views from server-side API
  const fetchCodebaseViews = useCallback(async (repo: string) => {
    setCodebaseViewsLoading(true);
    setCodebaseViewsError(null);
    console.log('[PanelContext] Fetching codebase views for:', repo);

    try {
      const [owner, name] = repo.split('/');

      // Fetch from API route that uses alexandria-core-library server-side
      const response = await fetch(`/api/github/repo/${owner}/${name}/codebase-views`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[PanelContext] No .alexandria directory found');
          setCodebaseViews([]);
          return;
        }
        throw new Error(`Failed to fetch codebase views: ${response.statusText}`);
      }

      const data = await response.json();
      const views = data.views || [];

      setCodebaseViews(views);
      console.log('[PanelContext] Loaded codebase views from API:', views.length);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch codebase views:', err);
      setCodebaseViewsError(err instanceof Error ? err : new Error('Failed to load codebase views'));
    } finally {
      setCodebaseViewsLoading(false);
    }
  }, []);

  // Fetch markdown files list from GitHub and enrich with associated files
  const fetchMarkdownFiles = useCallback(async (repo: string, views: CodebaseView[]) => {
    setMarkdownFilesLoading(true);
    setMarkdownFilesError(null);
    console.log('[PanelContext] Fetching markdown files for:', repo);

    try {
      const [owner, name] = repo.split('/');

      // Fetch file tree from GitHub API
      const response = await fetch(`/api/github/repo/${owner}/${name}?action=tree`);

      if (!response.ok) {
        throw new Error(`Failed to fetch file tree: ${response.statusText}`);
      }

      const tree: GitHubTreeResponse = await response.json();

      // Create a map of overviewPath -> CodebaseView for quick lookup
      const viewsByOverviewPath = new Map<string, CodebaseView>();
      views.forEach(view => {
        // Normalize paths for comparison
        const normalizedPath = view.overviewPath.startsWith('/')
          ? view.overviewPath
          : `/${view.overviewPath}`;
        viewsByOverviewPath.set(normalizedPath, view);
      });

      // Filter for markdown files and enrich with associated files
      const mdFiles: ExtendedMarkdownFile[] = tree.tree
        .filter((item) => item.type === 'blob' && /\.md$/i.test(item.path))
        .map((item) => {
          const filename = item.path.split('/').pop() || item.path;
          const title = filename
            .replace(/\.md$/i, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (char: string) => char.toUpperCase());

          const filePath = `/${item.path}`;

          // Check if this markdown file is associated with a CodebaseView
          const view = viewsByOverviewPath.get(filePath);
          const associatedFiles = view ? extractAssociatedFiles(view) : undefined;

          return {
            path: filePath,
            title,
            lastModified: Date.now(), // GitHub tree doesn't provide this
            associatedFiles,
            codebaseViewId: view?.id,
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path)); // Sort alphabetically by path

      setMarkdownFiles(mdFiles);
      console.log('[PanelContext] Found markdown files:', mdFiles.length);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch markdown files:', err);
      setMarkdownFilesError(err instanceof Error ? err : new Error('Failed to load markdown files'));
    } finally {
      setMarkdownFilesLoading(false);
    }
  }, []);

  // Helper function to extract all files from a CodebaseView
  const extractAssociatedFiles = (view: CodebaseView): string[] => {
    const files = new Set<string>();

    Object.values(view.referenceGroups).forEach(group => {
      group.files.forEach(file => {
        // Ensure files have leading slash for consistency
        files.add(file.startsWith('/') ? file : `/${file}`);
      });
    });

    return Array.from(files).sort();
  };

  // Fetch README function
  const fetchReadme = useCallback(async (repo: string) => {
    setMarkdownLoading(true);
    setMarkdownError(null);
    console.log('[PanelContext] Fetching README for:', repo);

    try {
      // Parse owner and repo name
      const [owner, name] = repo.split('/');

      // Fetch README from our GitHub proxy API
      const response = await fetch(`/api/github/repo/${owner}/${name}?action=readme`);

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'Repository or README not found'
            : `Failed to fetch README: ${response.statusText}`
        );
      }

      const data = await response.json();

      // Decode base64 content
      let content = '';
      if (data.content && data.encoding === 'base64') {
        const binaryString = atob(data.content.replace(/\n/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const decoder = new TextDecoder('utf-8');
        content = decoder.decode(bytes);
      }

      // Create ActiveFileSlice structure
      const activeFileData = {
        path: 'README.md',
        content: content,
        type: 'markdown',
        size: content.length,
        lastModified: new Date(),
        encoding: 'utf-8',
        source: {
          type: 'remote' as const,
          provider: 'github',
          owner,
          name,
          branch: 'main',
          location: 'README.md',
          url: `https://github.com/${repo}/blob/main/README.md`,
        },
      };

      setMarkdownContent(content);
      console.log('[PanelContext] README fetched successfully, length:', content.length);

      // Emit file:opened event
      events.emit({
        type: 'file:opened',
        source: 'web-ade',
        timestamp: Date.now(),
        payload: activeFileData,
      });
    } catch (err) {
      console.error('[PanelContext] Failed to fetch README:', err);
      setMarkdownError(err instanceof Error ? err : new Error('Failed to load documentation'));
    } finally {
      setMarkdownLoading(false);
    }
  }, [events]);

  // State for data slices
  const [slices, setSlices] = useState<Map<string, DataSlice>>(() => {
    return new Map([
      [
        'git',
        {
          scope: 'repository',
          name: 'git',
          data: null,
          loading: false,
          error: null,
          refresh: async () => {
            // TODO: Implement git data fetching
            console.log('Refreshing git slice');
          },
        },
      ],
      [
        'active-file',
        {
          scope: 'repository',
          name: 'active-file',
          data: null,
          loading: markdownLoading,
          error: markdownError,
          refresh: async () => {
            if (githubRepo) {
              await fetchReadme(githubRepo);
            }
          },
        },
      ],
      [
        'fileTree',
        {
          scope: 'repository',
          name: 'fileTree',
          data: fileTree,
          loading: fileTreeLoading,
          error: fileTreeError,
          refresh: async () => {
            if (githubRepo) {
              await fetchFileTree(githubRepo);
            }
          },
        },
      ],
      [
        'markdown',
        {
          scope: 'repository',
          name: 'markdown',
          data: markdownFiles,
          loading: markdownFilesLoading,
          error: markdownFilesError,
          refresh: async () => {
            if (githubRepo) {
              await fetchCodebaseViews(githubRepo);
              await fetchMarkdownFiles(githubRepo, codebaseViews);
            }
          },
        },
      ],
      [
        'codebaseViews',
        {
          scope: 'repository',
          name: 'codebaseViews',
          data: codebaseViews,
          loading: codebaseViewsLoading,
          error: codebaseViewsError,
          refresh: async () => {
            if (githubRepo) {
              await fetchCodebaseViews(githubRepo);
            }
          },
        },
      ],
    ]);
  });

  // Update active-file slice when README is fetched
  useEffect(() => {
    if (markdownContent && githubRepo) {
      const [owner, name] = githubRepo.split('/');

      const activeFileData = {
        path: 'README.md',
        content: markdownContent,
        type: 'markdown',
        size: markdownContent.length,
        lastModified: new Date(),
        encoding: 'utf-8',
        source: {
          type: 'remote' as const,
          provider: 'github',
          owner,
          name,
          branch: 'main',
          location: 'README.md',
          url: `https://github.com/${githubRepo}/blob/main/README.md`,
        },
      };

      setSlices((prev) => {
        const newMap = new Map(prev);
        const activeFileSlice = newMap.get('active-file');
        if (activeFileSlice) {
          activeFileSlice.data = activeFileData;
          activeFileSlice.loading = markdownLoading;
          activeFileSlice.error = markdownError;
        }
        return newMap;
      });
    }
  }, [markdownContent, markdownLoading, markdownError, githubRepo]);

  // Update markdown files slice when files list changes
  useEffect(() => {
    setSlices((prev) => {
      const newMap = new Map(prev);
      const markdownSlice = newMap.get('markdown');
      if (markdownSlice) {
        markdownSlice.data = markdownFiles;
        markdownSlice.loading = markdownFilesLoading;
        markdownSlice.error = markdownFilesError;
      }
      return newMap;
    });
  }, [markdownFiles, markdownFilesLoading, markdownFilesError]);

  // Update file tree slice when data changes
  useEffect(() => {
    setSlices((prev) => {
      const newMap = new Map(prev);
      const fileTreeSlice = newMap.get('fileTree');
      if (fileTreeSlice) {
        fileTreeSlice.data = fileTree;
        fileTreeSlice.loading = fileTreeLoading;
        fileTreeSlice.error = fileTreeError;
      }
      return newMap;
    });
  }, [fileTree, fileTreeLoading, fileTreeError]);

  // Update codebase views slice when data changes
  useEffect(() => {
    setSlices((prev) => {
      const newMap = new Map(prev);
      const codebaseViewsSlice = newMap.get('codebaseViews');
      if (codebaseViewsSlice) {
        codebaseViewsSlice.data = codebaseViews;
        codebaseViewsSlice.loading = codebaseViewsLoading;
        codebaseViewsSlice.error = codebaseViewsError;
      }
      return newMap;
    });
  }, [codebaseViews, codebaseViewsLoading, codebaseViewsError]);

  // Refresh function
  const refresh = useCallback(
    async (scope?: 'workspace' | 'repository', sliceName?: string) => {
      if (sliceName) {
        const slice = slices.get(sliceName);
        if (slice) {
          await slice.refresh();
        }
      } else {
        // Refresh all slices in the specified scope
        const promises = Array.from(slices.values())
          .filter((s) => !scope || s.scope === scope)
          .map((s) => s.refresh());
        await Promise.all(promises);
      }
    },
    [slices]
  );

  // Context value
  const context: PanelContextValue = useMemo(
    () => ({
      currentScope: {
        type: repository ? 'repository' : 'workspace',
        workspace,
        repository: githubRepo ? {
          ...repository,
          name: githubRepo.split('/')[1] || repository?.name || 'unknown',
          path: githubRepo,
          githubRepo, // Add the full owner/repo string
        } : repository,
      },
      slices,
      getSlice: <T,>(name: string) => slices.get(name) as DataSlice<T> | undefined,
      getWorkspaceSlice: <T,>(name: string) => {
        const slice = slices.get(name);
        return slice?.scope === 'workspace' ? (slice as DataSlice<T>) : undefined;
      },
      getRepositorySlice: <T,>(name: string) => {
        const slice = slices.get(name);
        return slice?.scope === 'repository' ? (slice as DataSlice<T>) : undefined;
      },
      hasSlice: (name: string, scope?: 'workspace' | 'repository') => {
        const slice = slices.get(name);
        if (!slice) return false;
        return scope ? slice.scope === scope : true;
      },
      isSliceLoading: (name: string, scope?: 'workspace' | 'repository') => {
        const slice = slices.get(name);
        if (!slice) return false;
        if (scope && slice.scope !== scope) return false;
        return slice.loading;
      },
      refresh,
    }),
    [slices, workspace, repository, refresh, githubRepo]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('Opening file:', filePath);

        if (!githubRepo) {
          console.error('No GitHub repo specified');
          return;
        }

        try {
          const [owner, name] = githubRepo.split('/');

          // Remove leading slash from path
          const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

          // Fetch file content from GitHub API
          const response = await fetch(
            `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(cleanPath)}`
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }

          const data = await response.json();

          // Decode base64 content
          let content = '';
          if (data.content && data.encoding === 'base64') {
            const binaryString = atob(data.content.replace(/\n/g, ''));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const decoder = new TextDecoder('utf-8');
            content = decoder.decode(bytes);
          }

          // Create ActiveFileSlice structure
          const activeFileData = {
            path: cleanPath,
            content: content,
            type: 'markdown',
            size: content.length,
            lastModified: new Date(),
            encoding: 'utf-8',
            source: {
              type: 'remote' as const,
              provider: 'github',
              owner,
              name,
              branch: 'main',
              location: cleanPath,
              url: `https://github.com/${githubRepo}/blob/main/${cleanPath}`,
            },
          };

          // Update active-file slice
          setSlices((prev) => {
            const newMap = new Map(prev);
            const activeFileSlice = newMap.get('active-file');
            if (activeFileSlice) {
              activeFileSlice.data = activeFileData;
              activeFileSlice.loading = false;
              activeFileSlice.error = null;
            }
            return newMap;
          });

          // Emit file:opened event
          events.emit({
            type: 'file:opened',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: activeFileData,
          });
        } catch (error) {
          console.error('Error opening file:', error);
          throw error;
        }
      },
      openGitDiff: (filePath: string, status?: string) => {
        // TODO: Implement git diff opening
        console.log('Opening git diff:', filePath, status);
      },
      navigateToPanel: (panelId: string) => {
        // TODO: Implement panel navigation
        console.log('Navigating to panel:', panelId);
        events.emit({
          type: 'panel:focus',
          source: 'web-ade',
          timestamp: Date.now(),
          payload: { panelId },
        });
      },
      notifyPanels: (event) => {
        events.emit(event);
      },
    }),
    [events, githubRepo]
  );

  const value: PanelProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
    }),
    [context, actions, events]
  );

  // Auto-fetch README, codebase views, markdown files, and file tree when githubRepo changes
  useEffect(() => {
    if (githubRepo) {
      // Fetch codebase views first, then markdown files (which need the views)
      (async () => {
        await fetchCodebaseViews(githubRepo);
      })();

      fetchReadme(githubRepo);
      fetchFileTree(githubRepo);
    }
  }, [githubRepo, fetchReadme, fetchCodebaseViews, fetchFileTree]);

  // Fetch markdown files when codebase views are loaded
  useEffect(() => {
    if (githubRepo && !codebaseViewsLoading && !codebaseViewsError) {
      fetchMarkdownFiles(githubRepo, codebaseViews);
    }
  }, [githubRepo, codebaseViews, codebaseViewsLoading, codebaseViewsError, fetchMarkdownFiles]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelProvider() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelProvider must be used within PanelProvider');
  }
  return context;
}
