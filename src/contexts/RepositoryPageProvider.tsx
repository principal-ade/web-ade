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
import { PathsFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
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

interface QualitySliceData {
  summary: {
    totalFiles: number;
    filesWithIssues: number;
    totalIssues: number;
    criticalIssues: number;
  };
  fileIssues: Record<string, number>;
  rawResults?: FormattedResults;
}

interface FileCityColorModesSliceData {
  enabledModes: string[];
  selectedColorMode: string | null;
  qualityData?: QualitySliceData;
}

interface CommitFilesSliceData {
  commitHash: string;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    changes: number;
    status: 'added' | 'modified' | 'removed' | 'renamed';
    previousPath?: string;
  }>;
}

interface PackagesSliceData {
  packages: Array<{
    name: string;
    version: string;
    path: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>;
  rootPackage?: {
    name?: string;
    version?: string;
    license?: string;
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo' | 'unknown';
  };
}

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
  'active-file'?: DataSlice<ActiveFileSlice>;
  fileTree?: DataSlice<FileTree>;
  commits?: DataSlice<CommitsSliceData>;
  quality?: DataSlice<QualitySliceData>;
  lensResults?: DataSlice<LensResultsSliceData>;
  packages?: DataSlice<PackagesSliceData>;
  'github-messages'?: DataSlice<GitHubMessagesSliceData>;
  repoCapabilities?: DataSlice<RepoCapabilitiesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  telemetry?: DataSlice<TelemetrySliceData>;
  schematics?: DataSlice<SchematicsSliceData>;
  fileCityColorModes?: DataSlice<FileCityColorModesSliceData>;
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
  const [selectedColorMode, setSelectedColorMode] = useState<string | null>(null);

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
  const [enabledColorModes] = useState<string[]>([]);

  // Slices ref
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    const initialSlices = new Map<string, DataSlice>();

    initialSlices.set('active-file', {
      scope: 'repository',
      name: 'active-file',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('fileTree', {
      scope: 'repository',
      name: 'fileTree',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('commits', {
      scope: 'repository',
      name: 'commits',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('quality', {
      scope: 'repository',
      name: 'quality',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('lensResults', {
      scope: 'repository',
      name: 'lensResults',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('packages', {
      scope: 'repository',
      name: 'packages',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('github-messages', {
      scope: 'global',
      name: 'github-messages',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('repoCapabilities', {
      scope: 'repository',
      name: 'repoCapabilities',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('storyboardContext', {
      scope: 'repository',
      name: 'storyboardContext',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('telemetry', {
      scope: 'global',
      name: 'telemetry',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('schematics', {
      scope: 'repository',
      name: 'schematics',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('fileCityColorModes', {
      scope: 'repository',
      name: 'fileCityColorModes',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('commitFiles', {
      scope: 'repository',
      name: 'commitFiles',
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
    });

    slicesRef.current = initialSlices;

    console.log('[RepositoryPageProvider] Slices initialized:', Array.from(initialSlices.keys()));
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
        const response = await fetch(`/api/github/repo/${githubRepo}/tree`);
        if (!response.ok) {
          throw new Error('Failed to fetch file tree');
        }

        const data = await response.json();
        const [owner, name] = githubRepo.split('/');
        const builder = new PathsFileTreeBuilder();
        const tree = builder.build({
          files: data.files || [],
          rootPath: `/${owner}/${name}`,
        });

        setFileTree(tree);
        setFileTreeError(null);
      } catch (error) {
        console.error('[RepositoryPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error as Error);
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

  // Refresh function
  const refresh = useCallback(async () => {
    // Refresh can be implemented later if needed
  }, []);

  // Adapters for file operations
  const adapters: PanelAdapters = useMemo(
    () => ({
      readFile: async (path: string): Promise<string> => {
        if (!githubRepo) {
          throw new Error('No repository selected');
        }

        const response = await fetch(`/api/github/repo/${githubRepo}/file?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
          throw new Error(`Failed to read file: ${path}`);
        }

        const data = await response.json();
        return data.content || '';
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

  // Update slices
  useEffect(() => {
    // Update fileTree slice
    const fileTreeSlice = slicesRef.current.get('fileTree');
    if (fileTreeSlice) {
      slicesRef.current.set('fileTree', {
        ...fileTreeSlice,
        data: fileTree,
        loading: fileTreeLoading,
        error: fileTreeError,
      });
    }

    // Update commits slice
    const commitsSlice = slicesRef.current.get('commits');
    if (commitsSlice) {
      slicesRef.current.set('commits', {
        ...commitsSlice,
        data: commits,
        loading: commits.loading,
        error: commits.error || null,
      });
    }

    // Update quality slice
    const qualitySlice = slicesRef.current.get('quality');
    if (qualitySlice) {
      slicesRef.current.set('quality', {
        ...qualitySlice,
        data: qualityData,
        loading: qualityLoading,
        error: qualityError,
      });
    }

    // Update lensResults slice
    const lensResultsSlice = slicesRef.current.get('lensResults');
    if (lensResultsSlice) {
      slicesRef.current.set('lensResults', {
        ...lensResultsSlice,
        data: lensResults,
        loading: lensResults.loading,
        error: lensResults.error || null,
      });
    }

    // Update fileCityColorModes slice
    const fileCityColorModesSlice = slicesRef.current.get('fileCityColorModes');
    if (fileCityColorModesSlice) {
      slicesRef.current.set('fileCityColorModes', {
        ...fileCityColorModesSlice,
        data: {
          enabledModes: enabledColorModes,
          selectedColorMode,
          qualityData: qualityData ?? undefined,
        },
        loading: qualityLoading,
        error: qualityError,
      });
    }

    // Update active-file slice
    if (activeFileContent && githubRepo) {
      const parts = githubRepo.split('/');
      const owner = parts[0] || '';
      const name = parts[1] || '';

      if (owner && name) {
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

        const activeFileSlice = slicesRef.current.get('active-file');
        if (activeFileSlice) {
          slicesRef.current.set('active-file', {
            ...activeFileSlice,
            data: activeFileData,
            loading: activeFileLoading,
            error: activeFileError,
          });
        }
      }
    }

    // Update packages slice
    const packagesSlice = slicesRef.current.get('packages');
    if (packagesSlice) {
      slicesRef.current.set('packages', {
        ...packagesSlice,
        data: packagesData,
        loading: packagesLoading,
        error: packagesError,
      });
    }

    // Update github-messages slice
    const githubMessagesSlice = slicesRef.current.get('github-messages');
    if (githubMessagesSlice) {
      slicesRef.current.set('github-messages', {
        ...githubMessagesSlice,
        data: githubMessages,
        loading: githubMessages.loading,
        error: githubMessages.error || null,
      });
    }

    // Update repoCapabilities slice
    const repoCapabilitiesSlice = slicesRef.current.get('repoCapabilities');
    if (repoCapabilitiesSlice) {
      slicesRef.current.set('repoCapabilities', {
        ...repoCapabilitiesSlice,
        data: repoCapabilities,
      });
    }

    // Update storyboardContext slice
    const storyboardContextSlice = slicesRef.current.get('storyboardContext');
    if (storyboardContextSlice) {
      slicesRef.current.set('storyboardContext', {
        ...storyboardContextSlice,
        data: storyboardContextData,
      });
    }

    // Update telemetry slice
    const telemetrySlice = slicesRef.current.get('telemetry');
    if (telemetrySlice) {
      slicesRef.current.set('telemetry', {
        ...telemetrySlice,
        data: telemetry,
        loading: telemetry.loading,
        error: telemetry.error || null,
      });
    }

    // Update schematics slice
    const schematicsSlice = slicesRef.current.get('schematics');
    if (schematicsSlice) {
      slicesRef.current.set('schematics', {
        ...schematicsSlice,
        data: schematics,
        loading: schematics.loading,
        error: schematics.error || null,
      });
    }

    // Update commitFiles slice
    const commitFilesSlice = slicesRef.current.get('commitFiles');
    if (commitFilesSlice) {
      slicesRef.current.set('commitFiles', {
        ...commitFilesSlice,
        data: commitFilesData,
      });
    }
  }, [
    fileTree,
    fileTreeLoading,
    fileTreeError,
    commits,
    qualityData,
    qualityLoading,
    qualityError,
    lensResults,
    enabledColorModes,
    selectedColorMode,
    activeFilePath,
    activeFileContent,
    activeFileLoading,
    activeFileError,
    githubRepo,
    packagesData,
    packagesLoading,
    packagesError,
    githubMessages,
    repoCapabilities,
    storyboardContextData,
    telemetry,
    schematics,
    commitFilesData,
  ]);

  // Build context value
  const context: PanelContextValue<RepositoryPageContextType> = useMemo(
    () => ({
      currentScope: {
        type: 'repository' as const,
        workspace,
        repository: githubRepo ? {
          name: githubRepo.split('/')[1] || githubRepo,
          path: `/GitHub/${githubRepo}`,
          ...repository,
        } : repository,
      },
      slices: slicesRef.current,
      adapters,
      // Typed slice properties
      'active-file': slicesRef.current.get('active-file') as DataSlice<ActiveFileSlice> | undefined,
      fileTree: slicesRef.current.get('fileTree') as DataSlice<FileTree> | undefined,
      commits: slicesRef.current.get('commits') as DataSlice<CommitsSliceData> | undefined,
      quality: slicesRef.current.get('quality') as DataSlice<QualitySliceData> | undefined,
      lensResults: slicesRef.current.get('lensResults') as DataSlice<LensResultsSliceData> | undefined,
      packages: slicesRef.current.get('packages') as DataSlice<PackagesSliceData> | undefined,
      'github-messages': slicesRef.current.get('github-messages') as DataSlice<GitHubMessagesSliceData> | undefined,
      repoCapabilities: slicesRef.current.get('repoCapabilities') as DataSlice<RepoCapabilitiesSliceData> | undefined,
      storyboardContext: slicesRef.current.get('storyboardContext') as DataSlice<StoryboardContextSliceData> | undefined,
      telemetry: slicesRef.current.get('telemetry') as DataSlice<TelemetrySliceData> | undefined,
      schematics: slicesRef.current.get('schematics') as DataSlice<SchematicsSliceData> | undefined,
      fileCityColorModes: slicesRef.current.get('fileCityColorModes') as DataSlice<FileCityColorModesSliceData> | undefined,
      commitFiles: slicesRef.current.get('commitFiles') as DataSlice<CommitFilesSliceData> | undefined,
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
    [workspace, repository, githubRepo, adapters, refresh]
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
      const payload = event.payload as { mode: string };
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
