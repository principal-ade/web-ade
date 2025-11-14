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

  // State for markdown files list
  const [markdownFiles, setMarkdownFiles] = useState<Array<{ path: string; title?: string; lastModified?: number }>>([]);
  const [markdownFilesLoading, setMarkdownFilesLoading] = useState(false);
  const [markdownFilesError, setMarkdownFilesError] = useState<Error | null>(null);

  // Fetch markdown files list from GitHub
  const fetchMarkdownFiles = useCallback(async (repo: string) => {
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

      const tree = await response.json();

      // Filter for markdown files
      const mdFiles = tree.tree
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => item.type === 'blob' && /\.md$/i.test(item.path))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => {
          const filename = item.path.split('/').pop() || item.path;
          const title = filename
            .replace(/\.md$/i, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (char: string) => char.toUpperCase());

          return {
            path: `/${item.path}`,
            title,
            lastModified: Date.now(), // GitHub tree doesn't provide this
          };
        })
        .sort((a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path)); // Sort alphabetically by path

      setMarkdownFiles(mdFiles);
      console.log('[PanelContext] Found markdown files:', mdFiles.length);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch markdown files:', err);
      setMarkdownFilesError(err instanceof Error ? err : new Error('Failed to load markdown files'));
    } finally {
      setMarkdownFilesLoading(false);
    }
  }, []);

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
          data: null,
          loading: false,
          error: null,
          refresh: async () => {
            // TODO: Implement file tree fetching
            console.log('Refreshing fileTree slice');
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
              await fetchMarkdownFiles(githubRepo);
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

  // Auto-fetch README and markdown files when githubRepo changes
  useEffect(() => {
    if (githubRepo) {
      fetchReadme(githubRepo);
      fetchMarkdownFiles(githubRepo);
    }
  }, [githubRepo, fetchReadme, fetchMarkdownFiles]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelProvider() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelProvider must be used within PanelProvider');
  }
  return context;
}
