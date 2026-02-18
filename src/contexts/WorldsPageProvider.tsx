'use client';

/**
 * Worlds Page Provider
 * Page-specific context provider that only includes slices needed for the worlds/collections page.
 *
 * Slices included:
 * - userCollections: User's collections
 * - selectedCollectionView: Selected collection view with repositories
 * - workspaceRepositories: Repository details in the collection
 * - workspace: Workspace metadata
 * - githubStarred: Starred repos (for github-starred panel)
 * - githubProjects: GitHub projects (for github-projects panel)
 * - github-repositories: GitHub repos (for github-search panel)
 * - fileTree: File tree (for file-city panel)
 * - fileCityColorModes: Color modes (for file-city panel)
 * - quality: Quality metrics (for file-city panel)
 * - active-file: Active file (for file-city panel)
 * - packages: Packages (for package-composition panel)
 * - commitFiles: Commit files (for file-city panel)
 * - storyboardContext: Storyboard context (for file-city panel)
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
import type { CollectionMapPanelActions } from '@industry-theme/repository-composition-panels';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import type { ValidatedRepositoryPath } from '@principal-ai/alexandria-core-library/types';
import type { FormattedResults } from '@principal-ai/codebase-quality-lenses';
import { minimatch } from 'minimatch';
import { PathsFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import { useAuth } from './AuthContext';
import { useUserCollections } from './UserCollectionsContext';
import type { CustomRegion, RepositoryLayoutData } from '@principal-ai/alexandria-collections';
import type {
  AlexandriaEntryWithMetrics,
  CollectionMapPanelContext
} from '@industry-theme/repository-composition-panels';
import { useVFS } from './VFSContext';

// Host-provided tools
const hostTools: PanelTool[] = [
  {
    name: 'list_repositories',
    description: 'List GitHub repositories available to the user (owned, starred, and organization repos)',
    inputs: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['owned', 'starred', 'organizations', 'all'],
          description: 'Filter repositories by type (default: all)',
        },
      },
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
  {
    name: 'switch_repository',
    description: 'Navigate to a different GitHub repository',
    inputs: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'The repository in "owner/name" format',
        },
      },
      required: ['repository'],
    },
    outputs: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    tags: ['github', 'repository', 'navigate'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:switch-repository',
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
}

// GitHub repositories slice data
interface GitHubRepositoriesData {
  owned: GitHubRepository[];
  starred: GitHubRepository[];
  organizations: Array<{
    id: number;
    login: string;
    avatar_url: string;
    description: string | null;
    repositories: GitHubRepository[];
  }>;
  isAuthenticated: boolean;
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

// User collections slice data
interface UserCollectionsSliceData {
  collections: Array<{
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  memberships: Array<{
    collectionId: string;
    repositoryId: string;
    addedAt: string;
  }>;
  loading: boolean;
  saving: boolean;
  gitHubRepoExists: boolean;
  gitHubRepoUrl?: string;
  error?: string;
}

// Workspace slice data
interface WorkspaceSliceData {
  workspace: {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    updatedAt: number;
  };
  loading: boolean;
  error?: string;
}

// Workspace repositories slice data
interface WorkspaceRepositoriesSliceData {
  repositories: GitHubRepository[];
  loading: boolean;
  error?: string;
}

/**
 * Extended actions for WorldsPageProvider
 * Combines panel actions with collection map region management
 */
interface WorldsPagePanelActions extends PanelActions, CollectionMapPanelActions {}

// Worlds page context type - includes only the slices needed for worlds page
export interface WorldsPageContextType {
  userCollections?: DataSlice<UserCollectionsSliceData>;
  // selectedCollectionView is always initialized, so it's not optional
  selectedCollectionView: DataSlice<CollectionMapPanelContext['selectedCollectionView']>;
  workspaceRepositories?: DataSlice<WorkspaceRepositoriesSliceData>;
  workspace?: DataSlice<WorkspaceSliceData>;
  githubStarred?: DataSlice<{ starred: GitHubRepository[]; isAuthenticated: boolean }>;
  githubProjects?: DataSlice<{ owned: GitHubRepository[]; organizations: Array<{ id: number; login: string; avatar_url: string; description: string | null; repositories: GitHubRepository[] }>; isAuthenticated: boolean }>;
  'github-repositories'?: DataSlice<GitHubRepositoriesData>;
  fileTree?: DataSlice<FileTree>;
  fileCityColorModes?: DataSlice<FileCityColorModesSliceData>;
  quality?: DataSlice<QualitySliceData>;
  'active-file'?: DataSlice<ActiveFileSlice>;
  packages?: DataSlice<PackagesSliceData>;
  commitFiles?: DataSlice<CommitFilesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
}

interface WorldsPageProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
  collectionId?: string;
  collectionRepositories?: string[];
}

interface WorldsPageProviderValue {
  context: PanelContextValue<WorldsPageContextType>;
  actions: WorldsPagePanelActions;
  events: PanelEventEmitter;
  selectedColorMode: string | null;
  clearColorMode: () => void;
}

const WorldsPageContext = createContext<WorldsPageProviderValue | null>(null);

export function WorldsPageProvider({
  children,
  workspace,
  repository,
  githubRepo,
  collectionId,
  collectionRepositories,
}: WorldsPageProviderProps) {
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

    console.log('[WorldsPageProvider] Tool registry initialized');

    return () => {
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state
  const { isAuthenticated } = useAuth();

  // Get user collections
  const userCollections = useUserCollections();

  // Get VFS for file operations
  const vfs = useVFS();
  const vfsRef = useRef(vfs);
  vfsRef.current = vfs;

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

  // State for GitHub repositories
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoriesData>({
    owned: [],
    starred: [],
    organizations: [],
    isAuthenticated: false,
  });
  const [githubReposLoading, setGithubReposLoading] = useState(false);

  // State for quality metrics
  const [qualityData] = useState<QualitySliceData | null>(null);
  const [qualityLoading] = useState(false);
  const [qualityError] = useState<Error | null>(null);

  // State for packages
  const [packagesData] = useState<PackagesSliceData | null>(null);
  const [packagesLoading] = useState(false);
  const [packagesError] = useState<Error | null>(null);

  // State for collection repository details
  const [collectionRepoDetails, setCollectionRepoDetails] = useState<GitHubRepository[]>([]);
  const [collectionRepoDetailsLoading, setCollectionRepoDetailsLoading] = useState(false);

  // State for commit files
  const [commitFilesData] = useState<CommitFilesSliceData | null>(null);

  // State for storyboard context
  const [storyboardContextData] = useState<StoryboardContextSliceData | null>(null);

  // State for enabled color modes
  const [enabledColorModes] = useState<string[]>([]);

  // Slices ref
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    const initialSlices = new Map<string, DataSlice>();

    // Create initial slices with default data
    initialSlices.set('userCollections', {
      scope: 'global',
      name: 'userCollections',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('selectedCollectionView', {
      scope: 'workspace',
      name: 'selectedCollectionView',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('workspaceRepositories', {
      scope: 'workspace',
      name: 'workspaceRepositories',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('workspace', {
      scope: 'workspace',
      name: 'workspace',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('githubStarred', {
      scope: 'global',
      name: 'githubStarred',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('githubProjects', {
      scope: 'global',
      name: 'githubProjects',
      data: null,
      loading: true,
      error: null,
      refresh: async () => {},
    });

    initialSlices.set('github-repositories', {
      scope: 'global',
      name: 'github-repositories',
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

    slicesRef.current = initialSlices;
  }, []);

  // Fetch GitHub repositories
  const fetchGithubRepos = useCallback(async () => {
    if (!isAuthenticated) {
      setGithubReposLoading(false);
      return;
    }

    setGithubReposLoading(true);
    try {
      const response = await fetch('/api/github/user/repos', {
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setGithubRepos({
          owned: data.owned || [],
          starred: data.starred || [],
          organizations: data.organizations || [],
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('[WorldsPageProvider] Failed to fetch GitHub repos:', error);
    } finally {
      setGithubReposLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch GitHub repositories on mount and auth change
  useEffect(() => {
    fetchGithubRepos();
  }, [fetchGithubRepos]);

  // Fetch collection repository details
  useEffect(() => {
    if (!collectionRepositories || collectionRepositories.length === 0) {
      setCollectionRepoDetails([]);
      setCollectionRepoDetailsLoading(false);
      return;
    }

    setCollectionRepoDetailsLoading(true);

    Promise.all(
      collectionRepositories.map(async (repoId) => {
        try {
          const response = await fetch(`/api/github/repo/${repoId}`);
          if (response.ok) {
            return await response.json();
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch repo ${repoId}:`, error);
          return null;
        }
      })
    ).then((results) => {
      setCollectionRepoDetails(results.filter((r): r is GitHubRepository => r !== null));
      setCollectionRepoDetailsLoading(false);
    });
  }, [collectionRepositories]);

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
        console.error('[WorldsPageProvider] Failed to fetch file tree:', error);
        setFileTreeError(error as Error);
      } finally {
        setFileTreeLoading(false);
      }
    };

    fetchFileTree();
  }, [githubRepo]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchGithubRepos();
  }, [fetchGithubRepos]);

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
    // Update userCollections slice
    const userCollectionsSlice = slicesRef.current.get('userCollections');
    if (userCollectionsSlice) {
      slicesRef.current.set('userCollections', {
        ...userCollectionsSlice,
        data: {
          collections: userCollections.collections,
          memberships: userCollections.memberships,
          loading: userCollections.loading,
          saving: userCollections.saving,
          gitHubRepoExists: userCollections.gitHubRepoExists,
          gitHubRepoUrl: userCollections.gitHubRepoUrl,
          error: undefined,
        },
        loading: userCollections.loading,
      });
    }

    // Update selectedCollectionView slice
    const selectedCollectionViewSlice = slicesRef.current.get('selectedCollectionView');
    if (selectedCollectionViewSlice) {
      const selectedCollection = collectionId
        ? userCollections.collections.find(c => c.id === collectionId)
        : null;

      const selectedMemberships = collectionId
        ? userCollections.memberships.filter(m => m.collectionId === collectionId)
        : [];

      const repositories: AlexandriaEntryWithMetrics[] = selectedMemberships.map(membership => ({
        name: membership.repositoryId.split('/')[1] || membership.repositoryId,
        path: membership.repositoryId as ValidatedRepositoryPath,
        purl: undefined,
        remoteUrl: `https://github.com/${membership.repositoryId}`,
        registeredAt: new Date(membership.addedAt).toISOString(),
        hasViews: false,
        viewCount: 0,
        views: [],
        github: undefined,
        lastChecked: undefined,
        lastOpenedAt: undefined,
        bookColor: undefined,
        theme: undefined,
        metrics: {
          fileCount: undefined,
          lineCount: undefined,
          commitCount: undefined,
          contributors: undefined,
          lastEditedAt: new Date(membership.addedAt).toISOString(),
          createdAt: new Date(membership.addedAt).toISOString(),
        },
      }));

      slicesRef.current.set('selectedCollectionView', {
        ...selectedCollectionViewSlice,
        data: {
          collection: selectedCollection || null,
          memberships: selectedMemberships,
          repositories,
          dependencies: undefined,
        },
        loading: userCollections.loading || collectionRepoDetailsLoading,
        error: userCollections.error || null,
      });
    }

    // Update workspace slice
    const workspaceSlice = slicesRef.current.get('workspace');
    if (workspaceSlice && collectionId && workspace) {
      slicesRef.current.set('workspace', {
        ...workspaceSlice,
        data: {
          workspace: {
            id: collectionId,
            name: workspace.name,
            description: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          loading: false,
          error: undefined,
        },
      });
    }

    // Update workspaceRepositories slice
    const workspaceReposSlice = slicesRef.current.get('workspaceRepositories');
    if (workspaceReposSlice) {
      slicesRef.current.set('workspaceRepositories', {
        ...workspaceReposSlice,
        data: {
          repositories: collectionRepoDetails,
          loading: collectionRepoDetailsLoading,
          error: undefined,
        },
      });
    }

    // Update github-repositories slice
    const githubReposSlice = slicesRef.current.get('github-repositories');
    if (githubReposSlice) {
      slicesRef.current.set('github-repositories', {
        ...githubReposSlice,
        data: githubRepos,
        loading: githubReposLoading,
      });
    }

    // Update githubStarred slice
    const githubStarredSlice = slicesRef.current.get('githubStarred');
    if (githubStarredSlice) {
      slicesRef.current.set('githubStarred', {
        ...githubStarredSlice,
        data: {
          starred: githubRepos.starred,
          isAuthenticated: githubRepos.isAuthenticated,
        },
        loading: githubReposLoading,
      });
    }

    // Update githubProjects slice
    const githubProjectsSlice = slicesRef.current.get('githubProjects');
    if (githubProjectsSlice) {
      slicesRef.current.set('githubProjects', {
        ...githubProjectsSlice,
        data: {
          owned: githubRepos.owned,
          organizations: githubRepos.organizations,
          isAuthenticated: githubRepos.isAuthenticated,
        },
        loading: githubReposLoading,
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
  }, [
    userCollections,
    collectionId,
    workspace,
    collectionRepoDetails,
    collectionRepoDetailsLoading,
    githubRepos,
    githubReposLoading,
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
  ]);

  // Selected collection for callback context
  const selectedCollection = useMemo(() => {
    if (!collectionId) return undefined;
    return userCollections.collections.find(c => c.id === collectionId);
  }, [collectionId, userCollections.collections]);

  // Build context value
  const context: PanelContextValue<WorldsPageContextType> = useMemo(
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
      adapters,
      selectedCollection,
      // Typed slice properties
      userCollections: slicesRef.current.get('userCollections') as DataSlice<UserCollectionsSliceData> | undefined,
      // selectedCollectionView is always initialized in initialSlices, so we can safely assert non-null
      selectedCollectionView: slicesRef.current.get('selectedCollectionView')! as DataSlice<CollectionMapPanelContext['selectedCollectionView']>,
      workspaceRepositories: slicesRef.current.get('workspaceRepositories') as DataSlice<WorkspaceRepositoriesSliceData> | undefined,
      workspace: slicesRef.current.get('workspace') as DataSlice<WorkspaceSliceData> | undefined,
      githubStarred: slicesRef.current.get('githubStarred') as DataSlice<{ starred: GitHubRepository[]; isAuthenticated: boolean }> | undefined,
      githubProjects: slicesRef.current.get('githubProjects') as DataSlice<{ owned: GitHubRepository[]; organizations: Array<{ id: number; login: string; avatar_url: string; description: string | null; repositories: GitHubRepository[] }>; isAuthenticated: boolean }> | undefined,
      'github-repositories': slicesRef.current.get('github-repositories') as DataSlice<GitHubRepositoriesData> | undefined,
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
    [workspace, repository, githubRepo, adapters, selectedCollection, refresh]
  );

  // Actions
  const actions: WorldsPagePanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        console.log('[WorldsPageProvider] Opening file:', filePath);
        setActiveFilePath(filePath);
        setActiveFileLoading(true);
        setActiveFileError(null);

        try {
          const content = await adapters.readFile!(filePath);
          setActiveFileContent(content);
          setActiveFileLoading(false);

          events.emit({
            type: 'file:opened',
            source: 'worlds-page',
            timestamp: Date.now(),
            payload: { path: filePath, content },
          });

          return content;
        } catch (error) {
          console.error('[WorldsPageProvider] Failed to open file:', error);
          setActiveFileError(error as Error);
          setActiveFileLoading(false);
          throw error;
        }
      },
      notifyPanels: (event) => {
        events.emit(event);
      },

      // Region management actions (CollectionMapPanelActions)
      onInitializeDefaultRegions: async (
        collectionId: string,
        regions: CustomRegion[],
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Initializing default regions:', collectionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: regions,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onSwitchLayoutMode: async (
        collectionId: string,
        mode: 'auto' | 'manual',
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Switching layout mode:', collectionId, mode);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const updatedMetadata = {
          ...(collection.metadata || {}),
          layoutMode: mode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onRegionCreated: async (
        collectionId: string,
        region: Omit<CustomRegion, 'id' | 'createdAt'>,
      ): Promise<CustomRegion> => {
        console.log('[WorldsPageProvider] Creating region:', region.name);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const newRegion: CustomRegion = {
          ...region,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };

        const currentLayoutMode = collection.metadata?.layoutMode || 'auto';
        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: [
            ...((collection.metadata?.customRegions as CustomRegion[]) || []),
            newRegion,
          ],
          // Auto-switch to manual mode when user manually creates a region
          layoutMode: currentLayoutMode === 'auto' ? 'manual' : currentLayoutMode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });

        return newRegion;
      },

      onRegionUpdated: async (
        collectionId: string,
        regionId: string,
        updates: Partial<CustomRegion>,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Updating region:', regionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const customRegions = (collection.metadata?.customRegions as CustomRegion[]) || [];
        const updatedRegions = customRegions.map((r) =>
          r.id === regionId ? { ...r, ...updates } : r,
        );

        const currentLayoutMode = collection.metadata?.layoutMode || 'auto';
        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: updatedRegions,
          layoutMode: currentLayoutMode === 'auto' ? 'manual' : currentLayoutMode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onRegionDeleted: async (
        collectionId: string,
        regionId: string,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Deleting region:', regionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        const customRegions = (collection.metadata?.customRegions as CustomRegion[]) || [];
        const updatedRegions = customRegions.filter((r) => r.id !== regionId);

        const currentLayoutMode = collection.metadata?.layoutMode || 'auto';
        const updatedMetadata = {
          ...(collection.metadata || {}),
          customRegions: updatedRegions,
          layoutMode: currentLayoutMode === 'auto' ? 'manual' : currentLayoutMode,
        };

        await userCollections.updateCollection(collectionId, {
          metadata: updatedMetadata,
        });
      },

      onRepositoryAssigned: async (
        collectionId: string,
        repositoryId: string,
        regionId: string,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Assigning repository to region:', repositoryId, regionId);

        await userCollections.updateMembershipMetadata(collectionId, repositoryId, {
          regionId,
        });
      },

      onRepositoryPositionUpdated: async (
        collectionId: string,
        repositoryId: string,
        layout: RepositoryLayoutData,
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Updating repository position:', repositoryId);

        await userCollections.updateMembershipMetadata(collectionId, repositoryId, {
          layout,
        });
      },

      onBatchLayoutInitialized: async (
        collectionId: string,
        updates: {
          regions?: CustomRegion[];
          assignments?: Array<{ repositoryId: string; regionId: string }>;
          positions?: Array<{ repositoryId: string; layout: RepositoryLayoutData }>;
        },
      ): Promise<void> => {
        console.log('[WorldsPageProvider] Batch initializing layout:', collectionId);

        const collection = userCollections.getCollection(collectionId);
        if (!collection) {
          throw new Error('Collection not found');
        }

        // Update collection with regions if provided
        if (updates.regions && updates.regions.length > 0) {
          const updatedMetadata = {
            ...(collection.metadata || {}),
            customRegions: updates.regions,
          };

          await userCollections.updateCollection(collectionId, {
            metadata: updatedMetadata,
          });
        }

        // Update memberships with assignments and positions
        if (updates.assignments || updates.positions) {
          const membershipUpdates = userCollections.memberships
            .filter((m) => m.collectionId === collectionId)
            .map((m) => {
              const assignment = updates.assignments?.find(
                (a) => a.repositoryId === m.repositoryId,
              );
              const position = updates.positions?.find(
                (p) => p.repositoryId === m.repositoryId,
              );

              if (!assignment && !position) return null;

              const updatedMetadata = {
                ...(m.metadata || {}),
                ...(assignment ? { regionId: assignment.regionId } : {}),
                ...(position ? { layout: position.layout } : {}),
              };

              return {
                repositoryId: m.repositoryId,
                metadata: updatedMetadata,
              };
            })
            .filter((update): update is { repositoryId: string; metadata: { regionId?: string; layout?: RepositoryLayoutData } } => update !== null);

          // Update all memberships
          for (const update of membershipUpdates) {
            await userCollections.updateMembershipMetadata(
              collectionId,
              update.repositoryId,
              update.metadata,
            );
          }
        }
      },
    }),
    [adapters, events, userCollections]
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
  const value: WorldsPageProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      selectedColorMode,
      clearColorMode,
    }),
    [context, actions, events, selectedColorMode, clearColorMode]
  );

  return <WorldsPageContext.Provider value={value}>{children}</WorldsPageContext.Provider>;
}

export function useWorldsPageProvider() {
  const context = useContext(WorldsPageContext);
  if (!context) {
    throw new Error('useWorldsPageProvider must be used within WorldsPageProvider');
  }
  return context;
}
