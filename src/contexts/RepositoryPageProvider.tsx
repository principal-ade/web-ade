'use client';

/**
 * Repository Page Provider
 * Page-specific context provider for the repository editor page (`/[owner]/[repo]`).
 * This is the most complex provider with the most slices.
 *
 * Slices included:
 * - active-file: Currently open file
 * - fileTree: Repository file tree
 * - commits: Git commit history
 * - quality: Code quality metrics
 * - lensResults: Lens analysis results
 * - packages: Package composition
 * - github-messages: GitHub issues/PRs
 * - repoCapabilities: Repository capabilities
 * - storyboardContext: Storyboard data
 * - telemetry: OTEL traces
 * - schematics: Versioned workflows
 * - fileCityColorModes: File city color modes
 * - commitFiles: Commit file details
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
import type { FormattedResults } from '@principal-ai/codebase-quality-lenses';
import { minimatch } from 'minimatch';
import { GitFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import type { FileCityColorModesSliceData, CommitFilesSliceData, QualitySliceData, PackagesSliceData, ColorMode } from '@industry-theme/file-city-panel';
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
  {
    name: 'write_file',
    description: 'Write content to a file in the current repository',
    inputs: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file within the repository',
        },
        content: {
          type: 'string',
          description: 'The content to write',
        },
      },
      required: ['path', 'content'],
    },
    outputs: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the write succeeded',
        },
      },
    },
    tags: ['file', 'write', 'content'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:write-file',
      source: 'ai-agent',
    },
  },
];

// Type definitions for slice data
// QualitySliceData, PackagesSliceData imported from @industry-theme/file-city-panel

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  parents?: string[];
}

interface CommitsSliceData {
  commits: GitCommit[];
  loading: boolean;
  error?: Error;
}

interface LensResultsSliceData {
  results: FormattedResults | null;
  loading: boolean;
  error?: Error;
}

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

interface RepoCapabilitiesSliceData {
  canPush: boolean;
  canPullRequest: boolean;
  isPrivate: boolean;
  hasIssues: boolean;
  hasWiki: boolean;
  hasProjects: boolean;
}

interface TelemetrySliceData {
  traces: Array<{
    id: string;
    serviceName: string;
    timestamp: string;
    duration: number;
    status: string;
  }>;
  loading: boolean;
  error?: Error;
}

interface SchematicsSliceData {
  workflows: Array<{
    id: string;
    name: string;
    version: string;
    path: string;
  }>;
  loading: boolean;
  error?: Error;
}

// Repository page context type
export interface RepositoryPageContextType {
  // Core slices - always present (initialized on mount)
  'active-file': DataSlice<ActiveFileSlice>;
  activeFile: DataSlice<ActiveFileSlice>; // Alias for 'active-file' (required by some panels)
  fileTree: DataSlice<FileTree>;

  // Optional slices - may not be present in all contexts
  commits?: DataSlice<CommitsSliceData>;
  quality?: DataSlice<QualitySliceData>;
  lensResults?: DataSlice<LensResultsSliceData>;
  packages?: DataSlice<PackagesSliceData>;
  'github-messages'?: DataSlice<GitHubMessagesSliceData>;
  repoCapabilities?: DataSlice<RepoCapabilitiesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  telemetry?: DataSlice<TelemetrySliceData>;
  schematics?: DataSlice<SchematicsSliceData>;
  fileCityColorModes: DataSlice<FileCityColorModesSliceData>;
  commitFiles?: DataSlice<CommitFilesSliceData>;
}

interface RepositoryPageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
}

interface RepositoryPageProviderValue {
  context: PanelContextValue<RepositoryPageContextType>;
  actions: PanelActions;
  events: PanelEventEmitter;
  selectedColorMode: string | null;
  clearColorMode: () => void;
}

const RepositoryPageContext = createContext<RepositoryPageProviderValue | null>(null);

export function RepositoryPageProvider({
  children,
  workspace,
  repository,
  githubRepo,
}: RepositoryPageProviderProps) {
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

    console.log('[RepositoryPageProvider] Tool registry initialized');

    return () => {
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state
  const { isAuthenticated } = useAuth();

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

  // State for commits
  const [commits, setCommits] = useState<CommitsSliceData>({
    commits: [],
    loading: false,
  });

  // State for quality metrics
  const [qualityData] = useState<QualitySliceData | null>(null);
  const [qualityLoading] = useState(false);
  const [qualityError] = useState<Error | null>(null);

  // State for lens results
  const [lensResults] = useState<LensResultsSliceData>({
    results: null,
    loading: false,
  });

  // State for packages
  const [packagesData] = useState<PackagesSliceData | null>(null);
  const [packagesLoading] = useState(false);
  const [packagesError] = useState<Error | null>(null);

  // State for GitHub messages
  const [githubMessages, setGithubMessages] = useState<GitHubMessagesSliceData>({
    messages: [],
    loading: false,
  });

  // State for repo capabilities
  const [repoCapabilities] = useState<RepoCapabilitiesSliceData | null>(null);

  // State for storyboard context
  const [storyboardContextData] = useState<StoryboardContextSliceData | null>(null);

  // State for telemetry
  const [telemetry] = useState<TelemetrySliceData>({
    traces: [],
    loading: false,
  });

  // State for schematics
  const [schematics] = useState<SchematicsSliceData>({
    workflows: [],
    loading: false,
  });

  // State for commit files
  const [commitFilesData] = useState<CommitFilesSliceData | null>(null);

  // State for enabled color modes
  const [enabledColorModes] = useState<ColorMode[]>([]);

  // Explicit slice: fileTree (typed for File City and other panels)
  const fileTreeSlice = useMemo<DataSlice<FileTree>>(
    () => ({
      scope: 'repository' as const,
      name: 'fileTree',
      data: fileTree,
      loading: fileTreeLoading,
      error: fileTreeError,
      // Actions handle refreshing - this is a no-op for interface compatibility
      refresh: async () => { /* no-op */ },
    }),
    [fileTree, fileTreeLoading, fileTreeError]
  );

  // Explicit slice: active-file (typed for File City and other panels)
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

  // Explicit slice: commits
  const commitsSlice = useMemo<DataSlice<CommitsSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'commits',
      data: commits,
      loading: commits.loading,
      error: commits.error || null,
      refresh: async () => { /* no-op */ },
    }),
    [commits]
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

  // Explicit slice: lensResults
  const lensResultsSlice = useMemo<DataSlice<LensResultsSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'lensResults',
      data: lensResults,
      loading: lensResults.loading,
      error: lensResults.error || null,
      refresh: async () => { /* no-op */ },
    }),
    [lensResults]
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

  // Explicit slice: repoCapabilities
  const repoCapabilitiesSlice = useMemo<DataSlice<RepoCapabilitiesSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'repoCapabilities',
      data: repoCapabilities,
      loading: false,
      error: null,
      refresh: async () => { /* no-op */ },
    }),
    [repoCapabilities]
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

  // Explicit slice: telemetry
  const telemetrySlice = useMemo<DataSlice<TelemetrySliceData>>(
    () => ({
      scope: 'global' as const,
      name: 'telemetry',
      data: telemetry,
      loading: telemetry.loading,
      error: telemetry.error || null,
      refresh: async () => { /* no-op */ },
    }),
    [telemetry]
  );

  // Explicit slice: schematics
  const schematicsSlice = useMemo<DataSlice<SchematicsSliceData>>(
    () => ({
      scope: 'repository' as const,
      name: 'schematics',
      data: schematics,
      loading: schematics.loading,
      error: schematics.error || null,
      refresh: async () => { /* no-op */ },
    }),
    [schematics]
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

  // Slices ref (now empty after full migration)
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    // All slices are now explicit (see useMemo above) - No Map initialization needed
    const initialSlices = new Map<string, DataSlice>();
    slicesRef.current = initialSlices;
    console.log('[RepositoryPageProvider] All slices are now explicit - Map is empty');
  }, []);

  // Fetch file tree when githubRepo changes
  useEffect(() => {
    if (!githubRepo) {
      setFileTree(null);
      setFileTreeLoading(false);
      return;
    }

    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) {
      setFileTreeError(new Error('Invalid repository format'));
      return;
    }

    setFileTreeLoading(true);
    setFileTreeError(null);

    const fetchFileTree = async () => {
      try {
        const data = await trpc.github.getTree.query({ owner, repo });

        // GitHub API returns { tree: [{ path, type, ... }] } - extract file info for blobs only
        const files = data.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({
            path: entry.path,
            size: entry.size || 0,
          }));
        const builder = new GitFileTreeBuilder();
        const tree = builder.build({
          files,
          rootPath: `/${owner}/${repo}`,
          commitSha: data.sha,
          branch: 'main',
        });

        setFileTree(tree);
        setFileTreeError(null);
      } catch (error) {
        console.error('[RepositoryPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error instanceof Error ? error : new Error('Failed to fetch file tree'));
      } finally {
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [githubRepo]);

  // Fetch commits when githubRepo changes
  useEffect(() => {
    if (!githubRepo) {
      setCommits({ commits: [], loading: false });
      return;
    }

    const fetchCommits = async () => {
      setCommits(prev => ({ ...prev, loading: true }));

      try {
        const response = await fetch(`/api/github/repo/${githubRepo}/commits`);
        if (!response.ok) throw new Error('Failed to fetch commits');

        const data = await response.json();

        setCommits({
          commits: data || [],
          loading: false,
        });
      } catch (error) {
        console.error('[RepositoryPageProvider] Failed to fetch commits:', error);
        setCommits({
          commits: [],
          loading: false,
          error: error as Error,
        });
      }
    };

    fetchCommits();
  }, [githubRepo]);

  // Fetch GitHub messages when authenticated
  useEffect(() => {
    if (!isAuthenticated || !githubRepo) {
      setGithubMessages({ messages: [], loading: false });
      return;
    }

    const fetchMessages = async () => {
      setGithubMessages(prev => ({ ...prev, loading: true }));

      try {
        const response = await fetch(`/api/github/repo/${githubRepo}/issues`);
        if (!response.ok) throw new Error('Failed to fetch messages');

        const data = await response.json();

        setGithubMessages({
          messages: data || [],
          loading: false,
        });
      } catch (error) {
        console.error('[RepositoryPageProvider] Failed to fetch messages:', error);
        setGithubMessages({
          messages: [],
          loading: false,
          error: error as Error,
        });
      }
    };

    fetchMessages();
  }, [isAuthenticated, githubRepo]);

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
      writeFile: async (path: string, _content: string): Promise<void> => {
        console.log('[RepositoryPageProvider] Write file not implemented:', path);
        throw new Error('Write operations not yet implemented');
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
  const context: PanelContextValue<RepositoryPageContextType> = useMemo(
    () => ({
      currentScope: {
        type: 'repository' as const,
        workspace,
        repository: githubRepo ? {
          ...repository,
          name: githubRepo.split('/')[1] || githubRepo,
          path: `/GitHub/${githubRepo}`,
          githubRepo,
        } : repository,
      },
      // Empty Map - all slices are now explicit (required by interface)
      slices: slicesRef.current,
      adapters,

      // ===== EXPLICIT TYPED SLICES (migrated from Map) =====
      // Core slices (always present)
      'active-file': activeFileSlice,
      activeFile: activeFileSlice, // Alias for panels expecting camelCase
      fileTree: fileTreeSlice,

      // Optional slices
      commits: commitsSlice,
      quality: qualitySlice,
      lensResults: lensResultsSlice,
      packages: packagesSlice,
      'github-messages': githubMessagesSlice,
      repoCapabilities: repoCapabilitiesSlice,
      storyboardContext: storyboardContextSlice,
      telemetry: telemetrySlice,
      schematics: schematicsSlice,
      fileCityColorModes: fileCityColorModesSlice,
      commitFiles: commitFilesSlice,

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
      activeFileSlice,
      fileTreeSlice,
      commitsSlice,
      qualitySlice,
      lensResultsSlice,
      packagesSlice,
      githubMessagesSlice,
      repoCapabilitiesSlice,
      storyboardContextSlice,
      telemetrySlice,
      schematicsSlice,
      fileCityColorModesSlice,
      commitFilesSlice,
    ]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('[RepositoryPageProvider] Opening file:', filePath);
        setActiveFilePath(filePath);
        setActiveFileLoading(true);
        setActiveFileError(null);

        try {
          const content = await adapters.readFile!(filePath);
          setActiveFileContent(content);
          setActiveFileLoading(false);

          events.emit({
            type: 'file:opened',
            source: 'repository-page',
            timestamp: Date.now(),
            payload: { path: filePath, content },
          });

          return content;
        } catch (error) {
          console.error('[RepositoryPageProvider] Failed to open file:', error);
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
          console.error('[RepositoryPageProvider] Error fetching audio URLs:', error);
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
  const value: RepositoryPageProviderValue = useMemo(
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
    <RepositoryPageContext.Provider value={value}>
      {children}
    </RepositoryPageContext.Provider>
  );
}

export function useRepositoryPageProvider() {
  const context = useContext(RepositoryPageContext);
  if (!context) {
    throw new Error('useRepositoryPageProvider must be used within RepositoryPageProvider');
  }
  return context;
}
