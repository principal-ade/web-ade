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
import { minimatch } from 'minimatch';
import { PathsFileTreeBuilder, type FileTree, createFileTreeSource } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import type { FileCityColorModesSliceData, CommitFilesSliceData, QualitySliceData, PackagesSliceData, ColorMode } from '@industry-theme/file-city-panel';
import type { GitHubTreeResponse } from '@/types/api';
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
import type {
  OwnerRepositoriesSliceData,
} from '@industry-theme/github-panels';

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

// Type definitions imported from @industry-theme/file-city-panel:
// QualitySliceData, PackagesSliceData, ColorMode

// Owner page context type - includes only the slices needed for owner page
export interface OwnerPageContextType {
  'owner-repositories'?: DataSlice<OwnerRepositoriesSliceData>;
  ownerRepositories: DataSlice<OwnerRepositoriesSliceData>; // Required - expected by OwnerRepositoriesPanel
  fileTree: DataSlice<FileTree>;
  fileCityColorModes: DataSlice<FileCityColorModesSliceData>;
  quality?: DataSlice<QualitySliceData>;
  'active-file'?: DataSlice<ActiveFileSlice>;
  packages: DataSlice<PackagesSliceData>; // Required - expected by PackageCompositionPanel
  commitFiles?: DataSlice<CommitFilesSliceData>;
  storyboardContext?: DataSlice<StoryboardContextSliceData>;
  selectedCollectionView: SelectedCollectionView;
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
  const [selectedColorMode, setSelectedColorMode] = useState<ColorMode | null>(null);

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
  const [ownerRepos, setOwnerRepos] = useState<OwnerRepositoriesSliceData>({
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
  const [enabledColorModes] = useState<ColorMode[]>([]);

  // State for selectedCollectionView (for CollectionMapPanel)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionRepositories] = useState<AlexandriaEntryWithMetrics[]>([]);
  const [collectionLoading] = useState(false);
  const [collectionError] = useState<string | null>(null);

  // ===== EXPLICIT SLICES (migrated from Map) =====

  // Explicit slice: ownerRepositories (required - expected by OwnerRepositoriesPanel)
  const ownerRepositoriesSlice = useMemo<DataSlice<OwnerRepositoriesSliceData>>(
    () => ({
      scope: 'global' as const,
      name: 'owner-repositories',
      data: ownerRepos,
      loading: ownerReposLoading,
      error: ownerRepos.error ? new Error(ownerRepos.error) : null,
      refresh: async () => { /* no-op */ },
    }),
    [ownerRepos, ownerReposLoading]
  );

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

  // Explicit slice: packages (required - expected by PackageCompositionPanel)
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

  // Explicit slice: selectedCollectionView (special - used by CollectionMapPanel)
  const selectedCollectionViewSlice = useMemo<SelectedCollectionView>(
    () => ({
      scope: 'workspace' as const,
      name: 'selectedCollectionView',
      data: {
        collection: selectedCollection,
        repositories: collectionRepositories,
        dependencies: undefined,
      },
      loading: collectionLoading,
      error: collectionError ? new Error(collectionError) : null,
      refresh: async () => { /* no-op */ },
    }),
    [selectedCollection, collectionRepositories, collectionLoading, collectionError]
  );

  // Slices ref (now empty after full migration)
  const slicesRef = useRef<Map<string, DataSlice>>(new Map());

  // Initialize slices on mount
  useEffect(() => {
    // All slices are now explicit (see useMemo above) - No Map initialization needed
    const initialSlices = new Map<string, DataSlice>();
    slicesRef.current = initialSlices;
    console.log('[OwnerPageProvider] All slices are now explicit - Map is empty');
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
          owner: data.owner || null,
          repositories: data.repositories || [],
          isAuthenticated,
        });
      } else {
        setOwnerRepos({
          owner: null,
          repositories: [],
          isAuthenticated,
          error: data.error || 'Failed to load repositories',
        });
      }
    } catch (error) {
      console.error('[OwnerPageProvider] Failed to fetch owner repos:', error);
      setOwnerRepos({
        owner: null,
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
        const response = await fetch(`/api/github/repo/${githubRepo}?action=tree`);
        if (!response.ok) {
          throw new Error('Failed to fetch file tree');
        }

        const data: GitHubTreeResponse = await response.json();
        const [owner, name] = githubRepo.split('/');
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
      } catch (error) {
        console.error('[OwnerPageProvider] Failed to fetch file tree:', error);
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
  // TODO: Centralize adapter creation into a shared hook (e.g., useGitHubAdapters)
  // to reduce duplication across OwnerPageProvider, ActivityPageProvider,
  // RepositoryPageProvider, and WorldsPageProvider
  const adapters: PanelAdapters = useMemo(
    () => ({
      readFile: async (path: string): Promise<string> => {
        if (!githubRepo) {
          throw new Error('No repository selected');
        }

        // Strip the repo path prefix if present (e.g., /GitHub/owner/repo/file.txt -> file.txt)
        const repoPrefix = `/GitHub/${githubRepo}/`;
        const relativePath = path.startsWith(repoPrefix) ? path.slice(repoPrefix.length) : path;

        const response = await fetch(`/api/github/repo/${githubRepo}/file?path=${encodeURIComponent(relativePath)}`);
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

  // All slices are now explicit useMemo slices (see above)
  // No Map-based updating needed - React handles reactivity automatically through useMemo dependencies

  // Build context value
  // All slices are now explicit - use typed properties directly
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
      // Empty Map - all slices are now explicit (required by interface)
      slices: slicesRef.current,
      adapters,

      // ===== EXPLICIT TYPED SLICES (migrated from Map) =====
      // Required slices
      'owner-repositories': ownerRepositoriesSlice,
      ownerRepositories: ownerRepositoriesSlice, // Alias for panels expecting camelCase
      packages: packagesSlice,
      selectedCollectionView: selectedCollectionViewSlice,

      // Optional slices
      fileTree: fileTreeSlice,
      fileCityColorModes: fileCityColorModesSlice,
      quality: qualitySlice,
      'active-file': activeFileSlice,
      commitFiles: commitFilesSlice,
      storyboardContext: storyboardContextSlice,

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
      ownerRepositoriesSlice,
      packagesSlice,
      selectedCollectionViewSlice,
      fileTreeSlice,
      fileCityColorModesSlice,
      qualitySlice,
      activeFileSlice,
      commitFilesSlice,
      storyboardContextSlice,
    ]
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
      const payload = event.payload as { mode: ColorMode };
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
