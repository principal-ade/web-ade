'use client';

/**
 * Panel Context Provider for web-ade
 * Implements panel-framework-core v0.1.1 context and event system
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
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

  // State for active file content and path
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string>('README.md');
  const [markdownLoading, setMarkdownLoading] = useState(true);
  const [markdownError, setMarkdownError] = useState<Error | null>(null);

  // State for markdown files list with associated files
  const [markdownFiles, setMarkdownFiles] = useState<ExtendedMarkdownFile[]>([]);
  const [markdownFilesLoading, setMarkdownFilesLoading] = useState(true);
  const [markdownFilesError, setMarkdownFilesError] = useState<Error | null>(null);

  // State for codebase views
  const [codebaseViews, setCodebaseViews] = useState<CodebaseView[]>([]);
  const [codebaseViewsLoading, setCodebaseViewsLoading] = useState(true);
  const [codebaseViewsError, setCodebaseViewsError] = useState<Error | null>(null);

  // State for file tree
  const [fileTree, setFileTree] = useState<{ root: string; files: Array<{ path: string; size: number; lines: number }> } | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(true);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // Fetch file tree from GitHub
  const fetchFileTree = useCallback(async (repo: string) => {
    setFileTreeLoading(true);
    setFileTreeError(null);
    console.log('[PanelContext] Fetching file tree for:', repo);

    try {
      const [owner, name] = repo.split('/');

      // Fetch file tree from GitHub API with cache-busting
      const response = await fetch(`/api/github/repo/${owner}/${name}?action=tree`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file tree: ${response.statusText}`);
      }

      const tree: GitHubTreeResponse = await response.json();

      // Convert to the format expected by panels
      // Visual Validation panel expects allFiles with path, relativePath, name
      // Code City panel expects files with path, size, lines
      const files = tree.tree
        .filter((item) => item.type === 'blob')
        .map((item) => ({
          path: item.path,
          size: item.size || 1000, // Default size if not provided
          lines: Math.ceil((item.size || 1000) / 50), // Estimate lines
        }));

      const allFiles = tree.tree
        .filter((item) => item.type === 'blob')
        .map((item) => ({
          path: item.path,
          relativePath: item.path,
          name: item.path.split('/').pop() || item.path,
        }));

      const fileTreeData = {
        root: `${owner}/${name}`,
        files,
        allFiles,
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

      // Fetch file tree from GitHub API with cache-busting
      const response = await fetch(`/api/github/repo/${owner}/${name}?action=tree`, {
        cache: 'no-store',
      });

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

  // Use ref for slices to avoid triggering context recreation on every slice update
  // This prevents the panel from re-rendering when slice data changes
  const slicesRef = useRef<Map<string, DataSlice>>(
    new Map([
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
    ])
  );

  // Update slice refs synchronously during render to ensure they're up-to-date before context memo runs
  // This prevents the race condition where panels read stale loading states from the ref

  // Update active-file slice
  if (markdownContent && githubRepo) {
    const [owner, name] = githubRepo.split('/');
    const activeFileData = {
      path: activeFilePath,
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
        location: activeFilePath,
        url: `https://github.com/${githubRepo}/blob/main/${activeFilePath}`,
      },
    };

    const activeFileSlice = slicesRef.current.get('active-file');
    if (activeFileSlice) {
      slicesRef.current.set('active-file', {
        ...activeFileSlice,
        data: activeFileData,
        loading: markdownLoading,
        error: markdownError,
      });
    }
  }

  // Update markdown files slice
  const markdownSlice = slicesRef.current.get('markdown');
  if (markdownSlice && (markdownSlice.loading !== markdownFilesLoading || markdownSlice.data !== markdownFiles)) {
    const updatedSlice = {
      ...markdownSlice,
      data: markdownFiles,
      loading: markdownFilesLoading,
      error: markdownFilesError,
    };
    slicesRef.current.set('markdown', updatedSlice);
    console.log('[PanelContext] Markdown slice updated during render:', {
      hasData: markdownFiles.length > 0,
      fileCount: markdownFiles.length,
      loading: markdownFilesLoading,
      sliceLoading: updatedSlice.loading
    });
  }

  // Update file tree slice
  const fileTreeSlice = slicesRef.current.get('fileTree');
  if (fileTreeSlice) {
    slicesRef.current.set('fileTree', {
      ...fileTreeSlice,
      data: fileTree,
      loading: fileTreeLoading,
      error: fileTreeError,
    });
  }

  // Update codebase views slice
  const codebaseViewsSlice = slicesRef.current.get('codebaseViews');
  if (codebaseViewsSlice) {
    slicesRef.current.set('codebaseViews', {
      ...codebaseViewsSlice,
      data: codebaseViews,
      loading: codebaseViewsLoading,
      error: codebaseViewsError,
    });
  }

  // Refresh function - use slicesRef instead of slices state
  const refresh = useCallback(
    async (scope?: 'workspace' | 'repository', sliceName?: string) => {
      if (sliceName) {
        const slice = slicesRef.current.get(sliceName);
        if (slice) {
          await slice.refresh();
        }
      } else {
        // Refresh all slices in the specified scope
        const promises = Array.from(slicesRef.current.values())
          .filter((s) => !scope || s.scope === scope)
          .map((s) => s.refresh());
        await Promise.all(promises);
      }
    },
    []  // No dependencies - uses ref
  );

  // Context value - include all data states to ensure proper re-renders
  // We include data states (markdownContent, markdownFiles, etc.) as dependencies to force
  // context updates when data loads, since slicesRef uses mutation and won't trigger updates
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
      // repositoryPath is used by Visual Validation panel to construct file paths
      // Set to empty string - readFile handles paths relative to repo root
      repositoryPath: githubRepo || '',
      slices: slicesRef.current,
      getSlice: <T,>(name: string) => slicesRef.current.get(name) as DataSlice<T> | undefined,
      getWorkspaceSlice: <T,>(name: string) => {
        const slice = slicesRef.current.get(name);
        return slice?.scope === 'workspace' ? (slice as DataSlice<T>) : undefined;
      },
      getRepositorySlice: <T,>(name: string) => {
        const slice = slicesRef.current.get(name);
        return slice?.scope === 'repository' ? (slice as DataSlice<T>) : undefined;
      },
      hasSlice: (name: string, scope?: 'workspace' | 'repository') => {
        const slice = slicesRef.current.get(name);
        if (!slice) return false;
        return scope ? slice.scope === scope : true;
      },
      isSliceLoading: (name: string, scope?: 'workspace' | 'repository') => {
        const slice = slicesRef.current.get(name);
        if (!slice) return false;
        if (scope && slice.scope !== scope) return false;
        return slice.loading;
      },
      refresh,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, repository, refresh, githubRepo, markdownFilesLoading, fileTreeLoading, codebaseViewsLoading, markdownLoading, markdownContent, activeFilePath, markdownFiles, fileTree, codebaseViews]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        // Remove leading slash from path
        const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
        console.log('Opening file:', cleanPath);

        if (!githubRepo) {
          console.error('No GitHub repo specified');
          return;
        }

        try {
          const [owner, name] = githubRepo.split('/');

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

          // If this is a markdown file, update the active-file slice and markdownContent
          // so the markdown panel displays the new file
          if (cleanPath.endsWith('.md')) {
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

            // Update the active-file slice
            const activeFileSlice = slicesRef.current.get('active-file');
            if (activeFileSlice) {
              slicesRef.current.set('active-file', {
                ...activeFileSlice,
                data: activeFileData,
                loading: false,
                error: null,
              });
            }

            // Update state to trigger re-render with new file
            setActiveFilePath(cleanPath);
            setMarkdownContent(content);

            // Emit file:opened event
            events.emit({
              type: 'file:opened',
              source: 'web-ade',
              timestamp: Date.now(),
              payload: activeFileData,
            });
          }

          // Return content directly for programmatic access (e.g., kanban panel)
          // This prevents re-render cycles when panels fetch multiple files
          // The panel checks for string return (useKanbanData.ts:71)
          return content;
        } catch (error) {
          console.error('Error opening file:', error);
          throw error;
        }
      },
      readFile: async (filePath: string): Promise<{ content: string }> => {
        console.log('[PanelContext] Reading file:', filePath);

        if (!githubRepo) {
          throw new Error('No GitHub repo specified');
        }

        try {
          const [owner, name] = githubRepo.split('/');

          // Path comes as `${repositoryPath}/${configPath}` e.g. "owner/repo/.vgc/example.yaml"
          // Strip the owner/repo prefix to get the relative path
          let cleanPath = filePath;
          const repoPrefix = `${githubRepo}/`;
          if (cleanPath.startsWith(repoPrefix)) {
            cleanPath = cleanPath.slice(repoPrefix.length);
          } else if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.slice(1);
          }

          // Fetch file content from GitHub API
          const response = await fetch(
            `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(cleanPath)}`
          );

          if (!response.ok) {
            throw new Error(`Failed to read file: ${response.statusText}`);
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

          // Return object with content property as expected by Visual Validation panel
          return { content };
        } catch (error) {
          console.error('[PanelContext] Error reading file:', error);
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

  // Track previous loading state to detect transitions
  const prevCodebaseViewsLoadingRef = useRef<boolean>(true);
  const currentRepoRef = useRef<string>('');
  const markdownFilesFetchedRef = useRef<boolean>(false);

  // Auto-fetch README, codebase views, markdown files, and file tree when githubRepo changes
  useEffect(() => {
    if (!githubRepo) return;

    console.log('[PanelContext] Initializing data fetch for:', githubRepo);

    // Reset tracking refs when repo changes
    prevCodebaseViewsLoadingRef.current = true;
    currentRepoRef.current = githubRepo;
    markdownFilesFetchedRef.current = false;

    // Fetch independent data in parallel
    fetchReadme(githubRepo);
    fetchFileTree(githubRepo);

    // Fetch codebase views - markdown files will be fetched by the secondary effect
    fetchCodebaseViews(githubRepo);
  }, [githubRepo, fetchReadme, fetchCodebaseViews, fetchFileTree]);

  // Fetch markdown files when codebaseViews finishes loading (transition from loading → not loading)
  useEffect(() => {
    // Detect transition from loading to not loading
    const wasLoading = prevCodebaseViewsLoadingRef.current;
    const isLoading = codebaseViewsLoading;

    console.log('[PanelContext] Markdown fetch effect triggered:', {
      githubRepo,
      wasLoading,
      isLoading,
      currentRepo: currentRepoRef.current,
      alreadyFetched: markdownFilesFetchedRef.current,
      codebaseViewsCount: codebaseViews.length
    });

    // Update ref for next render
    prevCodebaseViewsLoadingRef.current = isLoading;

    // Only fetch when we transition from loading to not loading for the current repo
    // AND we haven't already fetched markdown files for this repo
    if (!githubRepo || isLoading || !wasLoading || currentRepoRef.current !== githubRepo || markdownFilesFetchedRef.current) {
      console.log('[PanelContext] Skipping markdown fetch:', {
        noRepo: !githubRepo,
        isLoading,
        wasNotLoading: !wasLoading,
        repoDifferent: currentRepoRef.current !== githubRepo,
        alreadyFetched: markdownFilesFetchedRef.current
      });
      return;
    }

    console.log('[PanelContext] Codebase views finished loading, fetching markdown files with', codebaseViews.length, 'views');
    markdownFilesFetchedRef.current = true;
    fetchMarkdownFiles(githubRepo, codebaseViews);
  }, [githubRepo, codebaseViewsLoading, codebaseViews, fetchMarkdownFiles]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelProvider() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelProvider must be used within PanelProvider');
  }
  return context;
}
