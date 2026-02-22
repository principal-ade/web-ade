'use client';

/**
 * Activity Page Provider
 * Page-specific context provider that only includes slices needed for the activity page.
 *
 * Slices included:
 * - fileTree: File tree (for file-city panel when viewing activity)
 * - fileCityColorModes: Color modes (for file-city panel)
 * - quality: Quality metrics (for quality panel and file-city)
 * - active-file: Active file (for file-city panel)
 * - packages: Packages (for package-composition panel)
 * - commitFiles: Commit files (for file-city commit highlighting)
 * - storyboardContext: Storyboard context (for visual-validation panel)
 * - github-messages: GitHub notifications/timeline/issues/PRs
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  PanelEventBus,
  getGlobalToolRegistry,
  setGlobalToolRegistryEventEmitter,
} from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  DataSlice,
  WorkspaceMetadata,
  RepositoryMetadata,
  PanelTool,
  PanelAdapters,
  ActiveFileSlice,
} from '@principal-ade/panel-framework-core';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import { minimatch } from 'minimatch';
import { PathsFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import type { FileCityColorModesSliceData, CommitFilesSliceData, QualitySliceData, PackagesSliceData, ColorMode, FeedProjectSliceData } from '@industry-theme/file-city-panel';
import type { GitHubTreeResponse } from '@/types/api';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from './AuthContext';

// Host-provided tools
const hostTools: PanelTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the current repository',
    inputs: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file within the repository',
        },
      },
      required: ['path'],
    },
    outputs: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The file content',
        },
      },
    },
    tags: ['file', 'read', 'content'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:read-file',
      source: 'ai-agent',
    },
  },
];

// Type definitions imported from @industry-theme/file-city-panel:
// QualitySliceData, PackagesSliceData, ColorMode

// GitHub messages slice data
interface GitHubMessagesSliceData {
  messages: Array<{
    id: string;
    type: 'issue' | 'pr' | 'notification';
    title: string;
    repository: string;
    author: string;
    createdAt: string;
    updatedAt: string;
    url: string;
    state?: string;
    labels?: string[];
  }>;
  loading: boolean;
  error?: Error;
}

// Activity page context type - includes only the slices needed for activity page
export interface ActivityPageContextType {
  fileTree: DataSlice<FileTree>;
  fileCityColorModes: DataSlice<FileCityColorModesSliceData>;
  feedProject: DataSlice<FeedProjectSliceData>;
  quality?: DataSlice<QualitySliceData>;
  'active-file'?: DataSlice<ActiveFileSlice>;
  packages?: DataSlice<PackagesSliceData>;
  commitFiles?: DataSlice<CommitFilesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  'github-messages'?: DataSlice<GitHubMessagesSliceData>;
}

interface ActivityPageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
}

interface ActivityPageProviderValue {
  context: PanelContextValue<ActivityPageContextType>;
  actions: PanelActions;
  events: PanelEventEmitter;
  selectedColorMode: string | null;
  clearColorMode: () => void;
}

const ActivityPageContext = createContext<ActivityPageProviderValue | null>(null);

export function ActivityPageProvider({
  children,
  workspace,
  repository,
  githubRepo,
}: ActivityPageProviderProps) {
  // Initialize event bus
  const events = useMemo(() => new PanelEventBus(), []);

  // Initialize tool registry
  useEffect(() => {
    const registry = getGlobalToolRegistry();
    setGlobalToolRegistryEventEmitter(events);

    registry.registerPanelTools({
      id: 'web-ade.host',
      name: 'Web ADE Host',
      tools: hostTools,
    });

    registry.registerPanelTools({
      id: 'panel-layouts',
      name: 'Panel Layouts',
      tools: layoutTools,
    });

    console.log('[ActivityPageProvider] Tool registry initialized');

    return () => {
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state (currently unused but may be needed for future features)
  const { isAuthenticated: _isAuthenticated } = useAuth();

  // State for selected color mode (File City)
  const [selectedColorMode, setSelectedColorMode] = useState<ColorMode | null>(null);

  // State for file tree
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // State for active file
  const [activeFilePath, setActiveFilePath] = useState<string>('README.md');
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [activeFileLoading, setActiveFileLoading] = useState(false);
  const [activeFileError, setActiveFileError] = useState<Error | null>(null);

  // State for quality metrics
  const [qualityData] = useState<QualitySliceData | null>(null);
  const [qualityLoading] = useState(false);
  const [qualityError] = useState<Error | null>(null);

  // State for packages
  const [packagesData] = useState<PackagesSliceData | null>(null);
  const [packagesLoading] = useState(false);
  const [packagesError] = useState<Error | null>(null);

  // State for commit files
  const [commitFilesData] = useState<CommitFilesSliceData | null>(null);

  // State for storyboard context
  const [storyboardContextData] = useState<StoryboardContextSliceData | null>(null);

  // State for feed project (used by FeedCodeCityPanel)
  const [feedProjectData, setFeedProjectData] = useState<FeedProjectSliceData | null>(null);

  // State for GitHub messages (placeholder - notifications feature not yet implemented)
  const [githubMessages] = useState<GitHubMessagesSliceData>({
    messages: [],
    loading: false,
  });

  // State for enabled color modes
  const [enabledColorModes] = useState<ColorMode[]>([]);

  // ===== EXPLICIT SLICES (migrated from Map) =====

  // Explicit slice: fileTree
  const fileTreeSlice = useMemo<DataSlice<FileTree>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileTree',
      data: fileTree,
      loading: fileTreeLoading,
      error: fileTreeError,
      refresh: async () => { /* no-op */ },
    }),
    [fileTree, fileTreeLoading, fileTreeError]
  );

  // Explicit slice: quality
  const qualitySlice = useMemo<DataSlice<QualitySliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'quality',
      data: qualityData,
      loading: qualityLoading,
      error: qualityError,
      refresh: async () => { /* no-op */ },
    }),
    [qualityData, qualityLoading, qualityError]
  );

  // Explicit slice: fileCityColorModes
  const fileCityColorModesSlice = useMemo<DataSlice<FileCityColorModesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileCityColorModes',
      data: {
        enabledModes: enabledColorModes,
        selectedColorMode,
        qualityData: qualityData ?? undefined,
      },
      loading: qualityLoading,
      error: qualityError,
      refresh: async () => { /* no-op */ },
    }),
    [enabledColorModes, selectedColorMode, qualityData, qualityLoading, qualityError]
  );

  // Explicit slice: active-file
  const activeFileSlice = useMemo<DataSlice<ActiveFileSlice>>(
    () => {
      if (!activeFileContent || !githubRepo) {
        return {
          scope: 'repository' as const,
          name: 'active-file',
          data: null,
          loading: activeFileLoading,
          error: activeFileError,
          refresh: async () => { /* no-op */ },
        };
      }

      const parts = githubRepo.split('/');
      const owner = parts[0] || '';
      const name = parts[1] || '';

      if (!owner || !name) {
        return {
          scope: 'repository' as const,
          name: 'active-file',
          data: null,
          loading: activeFileLoading,
          error: activeFileError,
          refresh: async () => { /* no-op */ },
        };
      }

      const activeFileData: ActiveFileSlice = {
        path: activeFilePath,
        content: activeFileContent,
        type: 'code',
        size: activeFileContent.length,
        lastModified: new Date(),
        encoding: 'utf-8',
        source: createFileTreeSource.remoteBranch(
          owner,
          name,
          `https://github.com/${githubRepo}`,
          'main',
          'github'
        ),
      };

      return {
        scope: 'repository' as const,
        name: 'active-file',
        data: activeFileData,
        loading: activeFileLoading,
        error: activeFileError,
        refresh: async () => { /* no-op */ },
      };
    },
    [activeFilePath, activeFileContent, activeFileLoading, activeFileError, githubRepo]
  );

  // Explicit slice: packages
  const packagesSlice = useMemo<DataSlice<PackagesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'packages',
      data: packagesData,
      loading: packagesLoading,
      error: packagesError,
      refresh: async () => { /* no-op */ },
    }),
    [packagesData, packagesLoading, packagesError]
  );

  // Explicit slice: commitFiles
  const commitFilesSlice = useMemo<DataSlice<CommitFilesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'commitFiles',
      data: commitFilesData,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [commitFilesData]
  );

  // Explicit slice: storyboardContext
  const storyboardContextSlice = useMemo<DataSlice<StoryboardContextSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'storyboardContext',
      data: storyboardContextData,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [storyboardContextData]
  );

  // Explicit slice: github-messages
  const githubMessagesSlice = useMemo<DataSlice<GitHubMessagesSliceData>>(
    () => ({
      scope: 'global' as const,
      name: 'github-messages',
      data: githubMessages,
      loading: githubMessages.loading,
      error: githubMessages.error || null,
      refresh: async () => { /* no-op */ },
    }),
    [githubMessages]
  );

  // Explicit slice: feedProject (for FeedCodeCityPanel)
  const feedProjectSlice = useMemo<DataSlice<FeedProjectSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'feedProject',
      data: feedProjectData,
      loading: fileTreeLoading,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [feedProjectData, fileTreeLoading]
  );

  // Slices ref (now empty after full migration)
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    // All slices are now explicit (see useMemo above) - No Map initialization needed
    const initialSlices = new Map<string, DataSlice>();
    slicesRef.current = initialSlices;
    console.log('[ActivityPageProvider] All slices are now explicit - Map is empty');
  }, []);

  // Fetch file tree when githubRepo changes
  useEffect(() => {
    if (!githubRepo) {
      setFileTree(null);
      setFileTreeLoading(false);
      return;
    }

    setFileTreeLoading(true);
    setFileTreeError(null);

    const fetchFileTree = async () => {
      try {
        const response = await fetch(`/api/github/repo/${githubRepo}?action=tree`);
        if (!response.ok) {
          throw new Error('Failed to fetch file tree');
        }

        const data: GitHubTreeResponse = await response.json();
        const [owner, name] = githubRepo.split('/');
        if (!owner || !name) {
          throw new Error('Invalid repository format');
        }
        // GitHub API returns { tree: [{ path, type, ... }] } - extract paths for blobs only
        const filePaths = data.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => entry.path);
        const builder = new PathsFileTreeBuilder();
        const tree = builder.build({
          files: filePaths,
          rootPath: `/${owner}/${name}`,
        });

        setFileTree(tree);
        setFileTreeError(null);

        // Set feed project data for FeedCodeCityPanel
        setFeedProjectData({
          repo: {
            owner,
            name,
            fullName: githubRepo,
            htmlUrl: `https://github.com/${githubRepo}`,
            stars: 0,
            forks: 0,
          },
        });
      } catch (error) {
        console.error('[ActivityPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error as Error);
      } finally {
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [githubRepo]);

  // Note: refresh is now a no-op inline function in the context
  // Actions handle data refreshing - React handles reactivity through useMemo dependencies

  // Adapters for file operations
  const adapters: PanelAdapters = useMemo(
    () => ({
      readFile: async (path: string): Promise<string> => {
        if (!githubRepo) {
          throw new Error('No repository selected');
        }

        // Strip the repo path prefix if present (e.g., /GitHub/owner/repo/file.txt -> file.txt)
        const repoPrefix = `/GitHub/${githubRepo}/`;
        const relativePath = path.startsWith(repoPrefix) ? path.slice(repoPrefix.length) : path;

        const [owner, repo] = githubRepo.split('/');
        if (!owner || !repo) {
          throw new Error('Invalid repository format');
        }

        const data = await trpc.github.readFile.query({
          owner,
          repo,
          path: relativePath,
        });

        return data.content;
      },
      matchesPath: (pattern: string, path: string): boolean => {
        return minimatch(path, pattern);
      },
    }),
    [githubRepo]
  );

  // All slices are now explicit useMemo slices (see above)
  // No Map-based updating needed - React handles reactivity automatically through useMemo dependencies

  // Build context value
  // All slices are now explicit - use typed properties directly
  const context: PanelContextValue<ActivityPageContextType> = useMemo(
    () => ({
      currentScope: {
        type: 'workspace' as const,
        workspace,
        repository: githubRepo ? {
          ...repository,
          name: githubRepo.split('/')[1] || githubRepo,
          path: `/GitHub/${githubRepo}`,
        } : repository,
      },
      // Empty Map - all slices are now explicit (required by interface)
      slices: slicesRef.current,
      adapters,

      // ===== EXPLICIT TYPED SLICES (migrated from Map) =====
      fileTree: fileTreeSlice,
      fileCityColorModes: fileCityColorModesSlice,
      feedProject: feedProjectSlice,
      quality: qualitySlice,
      'active-file': activeFileSlice,
      packages: packagesSlice,
      commitFiles: commitFilesSlice,
      storyboardContext: storyboardContextSlice,
      'github-messages': githubMessagesSlice,

      // ===== LEGACY METHODS (no-ops for interface compatibility) =====
      // All slices are now explicit - use typed properties above instead
      getSlice: () => undefined,
      getWorkspaceSlice: () => undefined,
      getRepositorySlice: () => undefined,
      hasSlice: () => false,
      isSliceLoading: () => false,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op - use actions instead */ },
    }),
    [
      workspace,
      repository,
      githubRepo,
      adapters,
      // All explicit slices
      fileTreeSlice,
      fileCityColorModesSlice,
      feedProjectSlice,
      qualitySlice,
      activeFileSlice,
      packagesSlice,
      commitFilesSlice,
      storyboardContextSlice,
      githubMessagesSlice,
    ]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('[ActivityPageProvider] Opening file:', filePath);
        setActiveFilePath(filePath);
        setActiveFileLoading(true);
        setActiveFileError(null);

        try {
          const content = await adapters.readFile!(filePath);
          setActiveFileContent(content);
          setActiveFileLoading(false);

          events.emit({
            type: 'file:opened',
            source: 'activity-page',
            timestamp: Date.now(),
            payload: { path: filePath, content },
          });

          return content;
        } catch (error) {
          console.error('[ActivityPageProvider] Failed to open file:', error);
          setActiveFileError(error as Error);
          setActiveFileLoading(false);
          throw error;
        }
      },
      notifyPanels: (event) => {
        events.emit(event);
      },
      fetchAudioUrls: async (context: { owner: string; repo: string; path: string; commitSha: string }) => {
        try {
          // Use tRPC for type-safe API call
          const data = await trpc.tts.batchGenerate.mutate(context);

          // Convert array of steps to Map<stepId, audioUrl>
          // Only include URLs where status='ready' (cached files that exist)
          const urls = new Map<string, string>();
          data.steps.forEach((step) => {
            if (step.status === 'ready') {
              urls.set(step.stepId, step.audioUrl);
            }
          });

          return urls;
        } catch (error) {
          console.error('[ActivityPageProvider] Error fetching audio URLs:', error);
          throw error;
        }
      },
    }),
    [adapters, events]
  );

  // Clear color mode
  const clearColorMode = useCallback(() => {
    setSelectedColorMode(null);
  }, []);

  // Listen for color mode events
  useEffect(() => {
    const unsubscribe = events.on('file-city:color-mode:select', (event) => {
      const payload = event.payload as { mode: ColorMode };
      setSelectedColorMode(payload.mode);
    });

    return unsubscribe;
  }, [events]);

  // Provider value
  const value: ActivityPageProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      selectedColorMode,
      clearColorMode,
    }),
    [context, actions, events, selectedColorMode, clearColorMode]
  );

  return (
    <ActivityPageContext.Provider value={value}>
      {children}
    </ActivityPageContext.Provider>
  );
}

export function useActivityPageProvider() {
  const context = useContext(ActivityPageContext);
  if (!context) {
    throw new Error('useActivityPageProvider must be used within ActivityPageProvider');
  }
  return context;
}
