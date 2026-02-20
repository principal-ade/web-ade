'use client';

/**
 * Owner Page Provider
 * Page-specific context provider that only includes slices needed for the owner/[owner] page.
 *
 * Slices included:
 * - owner-repositories: Owner's GitHub repositories
 * - fileTree: File tree (when previewing a repo)
 * - fileCityColorModes: Color modes (for file-city panel)
 * - quality: Quality metrics (for quality panel and file-city)
 * - active-file: Active file (for file-city panel)
 * - packages: Packages (for package-composition panel)
 * - commitFiles: Commit files (for file-city panel)
 * - storyboardContext: Storyboard context (for visual-validation panel)
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  PanelEventBus,
  getGlobalToolRegistry,
  setGlobalToolRegistryEventEmitter,
} from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
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
import type {
  Collection,
  CustomRegion,
  RepositoryLayoutData,
} from '@principal-ai/alexandria-collections';
import type {
  AlexandriaEntryWithMetrics,
  SelectedCollectionView,
  CollectionMapPanelActions,
} from '@industry-theme/repository-composition-panels';

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
    name: 'list_repositories',
    description: 'List GitHub repositories for the owner',
    inputs: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'The owner (user or org) to fetch repositories for',
        },
      },
      required: ['owner'],
    },
    outputs: {
      type: 'object',
      properties: {
        repositories: {
          type: 'array',
          description: 'List of repository names',
        },
      },
    },
    tags: ['github', 'repository', 'list'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:list-repositories',
      source: 'ai-agent',
    },
  },
];

// GitHub repository interface
interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language: string | null;
  topics: string[];
  visibility: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  fork: boolean;
}

// Owner repositories slice data
interface OwnerRepositoriesData {
  owner: {
    login: string;
    name?: string;
    avatar_url?: string;
    type?: 'User' | 'Organization';
  } | null;
  repositories: GitHubRepository[];
  isAuthenticated: boolean;
  error?: string;
}

// Quality slice data
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

// File City color modes slice
interface FileCityColorModesSliceData {
  enabledModes: string[];
  selectedColorMode: string | null;
  qualityData?: QualitySliceData;
}

// Commit files slice data
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

// Packages slice data
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

// Owner page context type - includes only the slices needed for owner page
export interface OwnerPageContextType {
  'owner-repositories'?: DataSlice<OwnerRepositoriesData>;
  fileTree?: DataSlice<FileTree>;
  fileCityColorModes?: DataSlice<FileCityColorModesSliceData>;
  quality?: DataSlice<QualitySliceData>;
  'active-file'?: DataSlice<ActiveFileSlice>;
  packages?: DataSlice<PackagesSliceData>;
  commitFiles?: DataSlice<CommitFilesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  selectedCollectionView: DataSlice<SelectedCollectionView['data']>;
}

interface OwnerPageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
  initialOwner?: string;
}

interface OwnerPageProviderValue {
  context: PanelContextValue<OwnerPageContextType>;
  actions: CollectionMapPanelActions;
  events: PanelEventEmitter;
  selectedColorMode: string | null;
  clearColorMode: () => void;
}

const OwnerPageContext = createContext<OwnerPageProviderValue | null>(null);

export function OwnerPageProvider({
  children,
  workspace,
  repository,
  githubRepo,
  initialOwner,
}: OwnerPageProviderProps) {
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

    console.log('[OwnerPageProvider] Tool registry initialized');

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
  const [fileTreeLoading, setFileTreeLoading] = useState(true);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // State for active file
  const [activeFilePath, setActiveFilePath] = useState<string>('README.md');
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [activeFileLoading, setActiveFileLoading] = useState(false);
  const [activeFileError, setActiveFileError] = useState<Error | null>(null);

  // State for owner repositories
  const [ownerRepos, setOwnerRepos] = useState<OwnerRepositoriesData>({
    owner: null,
    repositories: [],
    isAuthenticated: false,
  });
  const [ownerReposLoading, setOwnerReposLoading] = useState(false);
  const [currentOwner, setCurrentOwner] = useState<string | null>(initialOwner || null);

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

  // State for enabled color modes
  const [enabledColorModes] = useState<string[]>([]);

  // State for selectedCollectionView (for CollectionMapPanel)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionRepositories] = useState<AlexandriaEntryWithMetrics[]>([]);
  const [collectionLoading] = useState(false);
  const [collectionError] = useState<string | null>(null);

  // Slices ref
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    const initialSlices = new Map<string, DataSlice>();

    initialSlices.set('owner-repositories', {
      scope: 'global',
      name: 'owner-repositories',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('fileTree', {
      scope: 'repository',
      name: 'fileTree',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('fileCityColorModes', {
      scope: 'repository',
      name: 'fileCityColorModes',
      data: null,
      loading: true,
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

    initialSlices.set('active-file', {
      scope: 'repository',
      name: 'active-file',
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

    initialSlices.set('commitFiles', {
      scope: 'repository',
      name: 'commitFiles',
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

    initialSlices.set('selectedCollectionView', {
      scope: 'workspace',
      name: 'selectedCollectionView',
      data: {
        collection: null,
        memberships: [],
        repositories: [],
        dependencies: undefined,
      },
      loading: false,
      error: null,
      refresh: async () => {},
    });

    slicesRef.current = initialSlices;
  }, []);

  // Fetch owner repositories
  const fetchOwnerRepos = useCallback(async (owner: string) => {
    if (!owner) return;

    setOwnerReposLoading(true);
    setCurrentOwner(owner);

    try {
      const response = await fetch(`/api/github/users/${owner}/repos`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOwnerRepos({
          owner: data.owner || { login: owner },
          repositories: data.repositories || [],
          isAuthenticated,
        });
      } else {
        setOwnerRepos({
          owner: { login: owner },
          repositories: [],
          isAuthenticated,
          error: data.error || 'Failed to load repositories',
        });
      }
    } catch (error) {
      console.error('[OwnerPageProvider] Failed to fetch owner repos:', error);
      setOwnerRepos({
        owner: { login: owner },
        repositories: [],
        isAuthenticated,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setOwnerReposLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch owner repositories when owner changes
  useEffect(() => {
    if (initialOwner && initialOwner !== currentOwner) {
      fetchOwnerRepos(initialOwner);
    }
  }, [initialOwner, currentOwner, fetchOwnerRepos]);

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
        console.error('[OwnerPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error as Error);
      } finally {
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [githubRepo]);

  // Refresh function
  const refresh = useCallback(async () => {
    if (currentOwner) {
      await fetchOwnerRepos(currentOwner);
    }
  }, [currentOwner, fetchOwnerRepos]);

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
      matchesPath: (pattern: string, path: string): boolean => {
        return minimatch(path, pattern);
      },
    }),
    [githubRepo]
  );

  // Update slices
  useEffect(() => {
    // Update owner-repositories slice
    const ownerReposSlice = slicesRef.current.get('owner-repositories');
    if (ownerReposSlice) {
      slicesRef.current.set('owner-repositories', {
        ...ownerReposSlice,
        data: ownerRepos,
        loading: ownerReposLoading,
        error: ownerRepos.error ? new Error(ownerRepos.error) : null,
      });
    }

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

    // Update commitFiles slice
    const commitFilesSlice = slicesRef.current.get('commitFiles');
    if (commitFilesSlice) {
      slicesRef.current.set('commitFiles', {
        ...commitFilesSlice,
        data: commitFilesData,
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

    // Update selectedCollectionView slice
    const selectedCollectionViewSlice = slicesRef.current.get('selectedCollectionView');
    if (selectedCollectionViewSlice) {
      slicesRef.current.set('selectedCollectionView', {
        ...selectedCollectionViewSlice,
        data: {
          collection: selectedCollection,
          repositories: collectionRepositories,
          dependencies: undefined,
        },
        loading: collectionLoading,
        error: collectionError ? new Error(collectionError) : null,
      });
    }
  }, [
    ownerRepos,
    ownerReposLoading,
    fileTree,
    fileTreeLoading,
    fileTreeError,
    qualityData,
    qualityLoading,
    qualityError,
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
    commitFilesData,
    storyboardContextData,
    selectedCollection,
    collectionRepositories,
    collectionLoading,
    collectionError,
  ]);

  // Build context value
  const context: PanelContextValue<OwnerPageContextType> = useMemo(
    () => ({
      currentScope: {
        type: 'workspace' as const,
        workspace,
        repository: githubRepo ? {
          name: githubRepo.split('/')[1] || githubRepo,
          path: `/GitHub/${githubRepo}`,
          ...repository,
        } : repository,
      },
      slices: slicesRef.current,
      selectedCollectionView: slicesRef.current.get('selectedCollectionView') as DataSlice<SelectedCollectionView['data']> || {
        data: {
          collection: null,
          repositories: [],
          dependencies: undefined,
        },
        loading: false,
        error: null,
      },
      adapters,
      // Typed slice properties
      'owner-repositories': slicesRef.current.get('owner-repositories') as DataSlice<OwnerRepositoriesData> | undefined,
      fileTree: slicesRef.current.get('fileTree') as DataSlice<FileTree> | undefined,
      fileCityColorModes: slicesRef.current.get('fileCityColorModes') as DataSlice<FileCityColorModesSliceData> | undefined,
      quality: slicesRef.current.get('quality') as DataSlice<QualitySliceData> | undefined,
      'active-file': slicesRef.current.get('active-file') as DataSlice<ActiveFileSlice> | undefined,
      packages: slicesRef.current.get('packages') as DataSlice<PackagesSliceData> | undefined,
      commitFiles: slicesRef.current.get('commitFiles') as DataSlice<CommitFilesSliceData> | undefined,
      storyboardContext: slicesRef.current.get('storyboardContext') as DataSlice<StoryboardContextSliceData> | undefined,
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
  const actions: CollectionMapPanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('[OwnerPageProvider] Opening file:', filePath);
        setActiveFilePath(filePath);
        setActiveFileLoading(true);
        setActiveFileError(null);

        try {
          const content = await adapters.readFile!(filePath);
          setActiveFileContent(content);
          setActiveFileLoading(false);

          events.emit({
            type: 'file:opened',
            source: 'owner-page',
            timestamp: Date.now(),
            payload: { path: filePath, content },
          });

          return content;
        } catch (error) {
          console.error('[OwnerPageProvider] Failed to open file:', error);
          setActiveFileError(error as Error);
          setActiveFileLoading(false);
          throw error;
        }
      },
      notifyPanels: (event) => {
        events.emit(event);
      },
      // Region management callbacks for CollectionMapPanel
      onRegionCreated: async (collectionId: string, region: Omit<CustomRegion, 'id'>) => {
        if (!currentOwner) {
          throw new Error('No owner set');
        }

        const response = await fetch(`/api/github/collections/${currentOwner}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'createRegion',
            collectionId,
            region,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create region');
        }

        const newRegion: CustomRegion = await response.json();

        // Update local state
        if (selectedCollection && selectedCollection.id === collectionId) {
          const customRegions = selectedCollection.metadata?.customRegions || [];
          setSelectedCollection({
            ...selectedCollection,
            metadata: {
              ...selectedCollection.metadata,
              customRegions: [...customRegions, newRegion],
            },
          });
        }

        return newRegion;
      },
      onRegionUpdated: async (collectionId: string, regionId: string, updates: Partial<CustomRegion>) => {
        if (!currentOwner) {
          throw new Error('No owner set');
        }

        const response = await fetch(`/api/github/collections/${currentOwner}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'updateRegion',
            collectionId,
            regionId,
            updates,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to update region');
        }

        // Update local state
        if (selectedCollection && selectedCollection.id === collectionId) {
          const customRegions = selectedCollection.metadata?.customRegions || [];
          const updatedRegions = customRegions.map(r =>
            r.id === regionId ? { ...r, ...updates } : r
          );
          setSelectedCollection({
            ...selectedCollection,
            metadata: {
              ...selectedCollection.metadata,
              customRegions: updatedRegions,
            },
          });
        }
      },
      onRegionDeleted: async (collectionId: string, regionId: string) => {
        if (!currentOwner) {
          throw new Error('No owner set');
        }

        const response = await fetch(`/api/github/collections/${currentOwner}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'deleteRegion',
            collectionId,
            regionId,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete region');
        }

        // Update local state
        if (selectedCollection && selectedCollection.id === collectionId) {
          const customRegions = selectedCollection.metadata?.customRegions || [];
          const updatedRegions = customRegions.filter(r => r.id !== regionId);
          setSelectedCollection({
            ...selectedCollection,
            metadata: {
              ...selectedCollection.metadata,
              customRegions: updatedRegions,
            },
          });
        }
      },
      onRepositoryAssigned: async (collectionId: string, repositoryId: string, regionId: string) => {
        if (!currentOwner) {
          throw new Error('No owner set');
        }

        const response = await fetch(`/api/github/collections/${currentOwner}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'assignRepository',
            collectionId,
            repositoryId,
            regionId,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to assign repository');
        }

        // Update local state
        if (selectedCollection && selectedCollection.id === collectionId) {
          const updatedMembers = selectedCollection.members.map(m =>
            m.repositoryId === repositoryId
              ? { ...m, metadata: { ...m.metadata, regionId } }
              : m
          );
          setSelectedCollection({
            ...selectedCollection,
            members: updatedMembers,
          });
        }
      },
      onRepositoryPositionUpdated: async (collectionId: string, repositoryId: string, layout: RepositoryLayoutData) => {
        if (!currentOwner) {
          throw new Error('No owner set');
        }

        const response = await fetch(`/api/github/collections/${currentOwner}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'updatePosition',
            collectionId,
            repositoryId,
            layout,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to update position');
        }

        // Update local state
        if (selectedCollection && selectedCollection.id === collectionId) {
          const updatedMembers = selectedCollection.members.map(m =>
            m.repositoryId === repositoryId
              ? { ...m, metadata: { ...m.metadata, layout } }
              : m
          );
          setSelectedCollection({
            ...selectedCollection,
            members: updatedMembers,
          });
        }
      },
      onBatchLayoutInitialized: async (collectionId: string, updates: {
        regions?: CustomRegion[];
        assignments?: Array<{ repositoryId: string; regionId: string }>;
        positions?: Array<{ repositoryId: string; layout: RepositoryLayoutData }>;
      }) => {
        if (!currentOwner) {
          throw new Error('No owner set');
        }

        const response = await fetch(`/api/github/collections/${currentOwner}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'batchInitialize',
            collectionId,
            batchUpdates: updates,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to batch initialize layout');
        }

        // Update local state
        if (selectedCollection && selectedCollection.id === collectionId) {
          const updatedCollection = { ...selectedCollection };

          // Update regions if provided
          if (updates.regions && updates.regions.length > 0) {
            updatedCollection.metadata = {
              ...updatedCollection.metadata,
              customRegions: updates.regions,
            };
          }

          // Apply assignments and positions to members
          if ((updates.assignments && updates.assignments.length > 0) ||
              (updates.positions && updates.positions.length > 0)) {
            const updatedMembers = updatedCollection.members.map(m => {
              const updatedMember = { ...m };

              // Apply region assignment
              const assignment = updates.assignments?.find(a => a.repositoryId === m.repositoryId);
              if (assignment) {
                updatedMember.metadata = { ...updatedMember.metadata, regionId: assignment.regionId };
              }

              // Apply position
              const position = updates.positions?.find(p => p.repositoryId === m.repositoryId);
              if (position) {
                updatedMember.metadata = { ...updatedMember.metadata, layout: position.layout };
              }

              return updatedMember;
            });

            updatedCollection.members = updatedMembers;
          }

          setSelectedCollection(updatedCollection);
        }
      },
    }),
    [adapters, events, currentOwner, selectedCollection]
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
  const value: OwnerPageProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      selectedColorMode,
      clearColorMode,
    }),
    [context, actions, events, selectedColorMode, clearColorMode]
  );

  return <OwnerPageContext.Provider value={value}>{children}</OwnerPageContext.Provider>;
}

export function useOwnerPageProvider() {
  const context = useContext(OwnerPageContext);
  if (!context) {
    throw new Error('useOwnerPageProvider must be used within OwnerPageProvider');
  }
  return context;
}
