'use client';

/**
 * Panel Context Provider for web-ade
 * Implements panel-framework-core v0.1.1 context and event system
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
} from '@principal-ade/panel-framework-core';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import type { CodebaseView } from '@principal-ai/alexandria-core-library/types';
import { minimatch } from 'minimatch';
import type { FileTree, FileInfo, DirectoryInfo } from '@principal-ai/repository-abstraction';
import { useAuth } from './AuthContext';
import { usePresenceData, type RepositorySession } from '@/hooks/usePresenceData';

// Current activity type for presence
interface CurrentActivity {
  type: 'editing' | 'reviewing' | 'debugging' | 'idle';
  details?: string;
}

// Current projects slice data structure
interface CurrentProjectsSliceData {
  projects: RepositorySession[];
  activeProject?: string;
  currentActivity?: CurrentActivity;
  isLoading: boolean;
  error: string | null;
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url?: string;
}

// GitHub repository types for the github-repositories slice
interface GitHubOwner {
  login: string;
  avatar_url?: string;
  type?: 'User' | 'Organization';
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubOwner;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  clone_url: string;
  language: string | null;
  default_branch: string;
  stargazers_count?: number;
  forks_count?: number;
  updated_at?: string;
  topics?: string[];
}

interface GitHubOrganization {
  id: number;
  login: string;
  avatar_url?: string;
  description?: string | null;
  repositories: GitHubRepository[];
}

interface GitHubRepositoriesData {
  owned: GitHubRepository[];
  starred: GitHubRepository[];
  organizations: GitHubOrganization[];
  isAuthenticated: boolean;
}

// Owner repositories slice data (for OwnerRepositoriesPanel)
interface OwnerInfo {
  login: string;
  avatar_url: string;
  name?: string;
  bio?: string;
  type: 'User' | 'Organization';
  public_repos: number;
  followers?: number;
  following?: number;
}

interface OwnerRepositoriesData {
  owner: OwnerInfo | null;
  repositories: GitHubRepository[];
  isAuthenticated: boolean;
  error?: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// Quality metrics data from GitHub Actions artifacts
interface QualityMetrics {
  tests: number;
  deadCode: number;
  formatting: number;
  linting: number;
  types: number;
  documentation: number;
}

interface PackageQuality {
  name: string;
  path?: string;
  version?: string;
  metrics: QualityMetrics;
}

/** Per-file quality metric from a lens */
interface FileMetricData {
  file: string;
  score: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  fixableCount?: number;
  categories?: Record<string, number>;
}

interface QualitySliceData {
  packages: PackageQuality[];
  lastUpdated: string;
  commitSha?: string;
  branch?: string;
  /** Per-file coverage percentages from Jest (path -> line coverage %) */
  fileCoverage?: Record<string, number>;
  /** Per-file quality metrics from all lenses, keyed by lens name */
  fileMetrics?: {
    eslint?: FileMetricData[];
    typescript?: FileMetricData[];
    prettier?: FileMetricData[];
    knip?: FileMetricData[];
    alexandria?: FileMetricData[];
  };
}

// Package layer types for PackageCompositionPanel
interface PackageCommand {
  name: string;
  command: string;
  description?: string;
  type?: 'script' | 'standard';
}

interface ConfigFile {
  path: string;
  exists: boolean;
  type: 'json' | 'yaml' | 'toml' | 'js' | 'ts' | 'ini' | 'custom';
  isInline?: boolean;
}

interface PackageLayer {
  id: string;
  name: string;
  type: 'package' | 'node';
  enabled: boolean;
  derivedFrom: {
    fileSets: { id: string; name: string; patterns: { type: string; pattern: string }[] }[];
    derivationType: 'presence';
    description: string;
  };
  packageData: {
    name: string;
    version?: string;
    path: string;
    manifestPath: string;
    packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown';
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    isMonorepoRoot: boolean;
    isWorkspace: boolean;
    availableCommands?: PackageCommand[];
  };
  configFiles?: Record<string, ConfigFile | undefined>;
}

interface PackageSummary {
  isMonorepo: boolean;
  rootPackageName?: string;
  totalPackages: number;
  workspacePackages: Array<{ name?: string; path: string }>;
  totalDependencies: number;
  totalDevDependencies: number;
  availableScripts: string[];
}

interface PackagesSliceData {
  packages: PackageLayer[];
  summary: PackageSummary;
}

interface PanelProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
  githubRepo?: string;
  /** Owner to fetch repositories for (user or org) - used on owner pages */
  initialOwner?: string;
  /** Collection ID for curated collections pages */
  collectionId?: string;
  /** Repository IDs in the collection (owner/repo format) */
  collectionRepositories?: string[];
}

interface PanelProviderValue {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
  /** Whether connected to presence server (for showing current projects panel) */
  presenceConnected: boolean;
}

const PanelContext = createContext<PanelProviderValue | null>(null);

/**
 * Host-provided tools that web-ade makes available to AI agents.
 * These tools emit events that the host handles directly.
 */
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
    name: 'open_file',
    description: 'Open a file in the viewer panel',
    inputs: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to open',
        },
      },
      required: ['path'],
    },
    outputs: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    tags: ['file', 'open', 'view'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:open-file',
      source: 'ai-agent',
    },
  },
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
      event_type: 'repository:selected',
      source: 'ai-agent',
    },
  },
];

export function PanelProvider({ children, workspace, repository, githubRepo, initialOwner, collectionId, collectionRepositories }: PanelProviderProps) {
  // Initialize event bus once
  const events = useMemo(() => new PanelEventBus(), []);

  // Initialize tool registry and connect to event bus
  useEffect(() => {
    const registry = getGlobalToolRegistry();

    // Connect event bus to registry for tool invocations
    setGlobalToolRegistryEventEmitter(events);

    // Register host-provided tools
    registry.registerPanelTools({
      id: 'web-ade.host',
      name: 'Web ADE Host',
      tools: hostTools,
    });

    // Register layout tools from utcp-panel-event
    registry.registerPanelTools({
      id: 'panel-layouts',
      name: 'Panel Layouts',
      tools: layoutTools,
    });

    console.log('[PanelContext] Tool registry initialized with', registry.size, 'tools');

    return () => {
      // Cleanup: unregister tools on unmount
      registry.unregisterPanelTools('web-ade.host');
      registry.unregisterPanelTools('panel-layouts');
    };
  }, [events]);

  // Get auth state for github-repositories slice
  const { isAuthenticated } = useAuth();

  // Get presence data for current-projects slice
  const {
    sessions: presenceSessions,
    connected: presenceConnected,
    loading: presenceLoading,
    error: presenceError,
  } = usePresenceData(githubRepo);

  // State for active file content and path
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string>('README.md');
  const [markdownLoading, setMarkdownLoading] = useState(true);
  const [markdownError, setMarkdownError] = useState<Error | null>(null);


  // State for codebase views
  const [codebaseViews, setCodebaseViews] = useState<CodebaseView[]>([]);
  const [codebaseViewsLoading, setCodebaseViewsLoading] = useState(true);
  const [codebaseViewsError, setCodebaseViewsError] = useState<Error | null>(null);

  // State for file tree - uses FileTree from @principal-ai/repository-abstraction
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(true);
  const [fileTreeError, setFileTreeError] = useState<Error | null>(null);

  // State for GitHub repositories (user's repos)
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoriesData>({
    owned: [],
    starred: [],
    organizations: [],
    isAuthenticated: false,
  });
  const [githubReposLoading, setGithubReposLoading] = useState(false);

  // State for quality metrics from GitHub Actions artifacts
  const [qualityData, setQualityData] = useState<QualitySliceData | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState<Error | null>(null);
  // State for explicitly enabled File City color modes (updated via events)
  const [enabledColorModes, setEnabledColorModes] = useState<string[]>([]);
  // State for the currently selected color mode (updated via events, consumed by File City)
  const [selectedColorMode, setSelectedColorMode] = useState<string | null>(null);

  // State for packages (for PackageCompositionPanel)
  const [packagesData, setPackagesData] = useState<PackagesSliceData | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState<Error | null>(null);

  // State for owner repositories (for OwnerRepositoriesPanel)
  const [ownerRepos, setOwnerRepos] = useState<OwnerRepositoriesData>({
    owner: null,
    repositories: [],
    isAuthenticated: false,
  });
  const [ownerReposLoading, setOwnerReposLoading] = useState(false);
  const [currentOwner, setCurrentOwner] = useState<string | null>(null);

  // State for collection/workspace repositories (for WorkspaceCollectionPanel)
  const [collectionRepoDetails, setCollectionRepoDetails] = useState<GitHubRepository[]>([]);
  const [collectionRepoDetailsLoading, setCollectionRepoDetailsLoading] = useState(false);

  // Fetch repositories for a specific owner (user or org)
  const fetchOwnerRepos = useCallback(async (owner: string) => {
    setOwnerReposLoading(true);
    setCurrentOwner(owner);
    console.log('[PanelContext] Fetching owner repositories for:', owner);

    try {
      const response = await fetch(`/api/github/owner/${owner}/repos`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        setOwnerRepos({
          owner: null,
          repositories: [],
          isAuthenticated: data.isAuthenticated ?? false,
          error: data.error || `Failed to fetch repos: ${response.statusText}`,
        });
        return;
      }

      setOwnerRepos({
        owner: data.owner,
        repositories: data.repositories || [],
        isAuthenticated: data.isAuthenticated ?? false,
      });

      console.log('[PanelContext] Owner repos loaded:', {
        owner: data.owner?.login,
        repoCount: data.repositories?.length || 0,
        isAuthenticated: data.isAuthenticated,
      });
    } catch (err) {
      console.error('[PanelContext] Failed to fetch owner repos:', err);
      setOwnerRepos({
        owner: null,
        repositories: [],
        isAuthenticated: false,
        error: err instanceof Error ? err.message : 'Failed to fetch repositories',
      });
    } finally {
      setOwnerReposLoading(false);
    }
  }, []);

  // Fetch details for collection repositories
  const fetchCollectionRepoDetails = useCallback(async (repoIds: string[]) => {
    setCollectionRepoDetailsLoading(true);

    try {
      const details = await Promise.all(
        repoIds.map(async (repoId) => {
          const [owner, repo] = repoId.split('/');
          try {
            const response = await fetch(`/api/github/repo/${owner}/${repo}?action=info`);
            if (!response.ok) {
              // Return a minimal fallback entry so the repo still shows in the list
              return {
                id: 0,
                name: repo || repoId,
                full_name: repoId,
                owner: { login: owner || 'unknown', avatar_url: '', type: 'User' as const },
                private: false,
                html_url: `https://github.com/${repoId}`,
                description: null,
                fork: false,
                clone_url: `https://github.com/${repoId}.git`,
                language: null,
                default_branch: 'main',
              } as GitHubRepository;
            }
            const data = await response.json();
            return data as GitHubRepository;
          } catch {
            // Return fallback on error too
            return {
              id: 0,
              name: repo || repoId,
              full_name: repoId,
              owner: { login: owner || 'unknown', avatar_url: '', type: 'User' as const },
              private: false,
              html_url: `https://github.com/${repoId}`,
              description: null,
              fork: false,
              clone_url: `https://github.com/${repoId}.git`,
              language: null,
              default_branch: 'main',
            } as GitHubRepository;
          }
        })
      );

      // All entries should be valid now (either from API or fallback)
      setCollectionRepoDetails(details);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch collection repo details:', err);
    } finally {
      setCollectionRepoDetailsLoading(false);
    }
  }, []);

  // Fetch user's GitHub repositories
  const fetchGithubRepos = useCallback(async () => {
    if (!isAuthenticated) {
      setGithubRepos({
        owned: [],
        starred: [],
        organizations: [],
        isAuthenticated: false,
      });
      return;
    }

    setGithubReposLoading(true);
    console.log('[PanelContext] Fetching GitHub repositories');

    try {
      const response = await fetch('/api/github/user/repos', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setGithubRepos({
            owned: [],
            starred: [],
            organizations: [],
            isAuthenticated: false,
          });
          return;
        }
        throw new Error(`Failed to fetch repos: ${response.statusText}`);
      }

      const data = await response.json();
      setGithubRepos({
        owned: data.owned || [],
        starred: data.starred || [],
        organizations: data.organizations || [],
        isAuthenticated: true,
      });
      console.log('[PanelContext] GitHub repos loaded:', {
        owned: data.owned?.length || 0,
        starred: data.starred?.length || 0,
        orgs: data.organizations?.length || 0,
      });
    } catch (err) {
      console.error('[PanelContext] Failed to fetch GitHub repos:', err);
      setGithubRepos({
        owned: [],
        starred: [],
        organizations: [],
        isAuthenticated,
      });
    } finally {
      setGithubReposLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch file tree from GitHub and build FileTree structure from @principal-ai/repository-abstraction
  // Returns the commit SHA for use by other fetches (e.g., quality metrics)
  const fetchFileTree = useCallback(async (repo: string): Promise<string | null> => {
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

      // Build FileTree structure from @principal-ai/repository-abstraction
      // Extract all files (blobs) and directories (trees)
      const allFiles: FileInfo[] = tree.tree
        .filter((item) => item.type === 'blob')
        .map((item) => {
          const pathParts = item.path.split('/');
          const fileName = pathParts[pathParts.length - 1] ?? item.path;
          const extension = fileName.includes('.') ? (fileName.split('.').pop() ?? '') : '';

          return {
            path: `/${item.path}`,
            name: fileName,
            extension,
            size: item.size || 0,
            lastModified: new Date(),
            isDirectory: false,
            relativePath: item.path,
          };
        });

      // Build directory structure from tree items
      const dirMap = new Map<string, DirectoryInfo>();

      // First pass: create all directories from tree items
      tree.tree
        .filter((item) => item.type === 'tree')
        .forEach((item) => {
          const pathParts = item.path.split('/');
          const dirName = pathParts[pathParts.length - 1] ?? item.path;

          dirMap.set(item.path, {
            path: `/${item.path}`,
            name: dirName,
            children: [],
            fileCount: 0,
            totalSize: 0,
            depth: pathParts.length,
            relativePath: item.path,
          });
        });

      // Also create implicit parent directories for files
      allFiles.forEach((file) => {
        const pathParts = file.relativePath.split('/');
        let currentPath = '';

        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!part) continue;
          currentPath = currentPath ? `${currentPath}/${part}` : part;

          if (!dirMap.has(currentPath)) {
            dirMap.set(currentPath, {
              path: `/${currentPath}`,
              name: part,
              children: [],
              fileCount: 0,
              totalSize: 0,
              depth: i + 1,
              relativePath: currentPath,
            });
          }
        }
      });

      // Build directory tree relationships and calculate stats
      const allDirectories = Array.from(dirMap.values());
      let maxDepth = 0;
      let totalSize = 0;

      // Assign files to their parent directories and calculate stats
      allFiles.forEach((file) => {
        const pathParts = file.relativePath.split('/');
        if (pathParts.length > 1) {
          const parentPath = pathParts.slice(0, -1).join('/');
          const parentDir = dirMap.get(parentPath);
          if (parentDir) {
            parentDir.children.push(file);
            parentDir.fileCount++;
            parentDir.totalSize += file.size;
          }
        }
        totalSize += file.size;
      });

      // Assign subdirectories to parent directories
      allDirectories.forEach((dir) => {
        const pathParts = dir.relativePath.split('/');
        maxDepth = Math.max(maxDepth, dir.depth);

        if (pathParts.length > 1) {
          const parentPath = pathParts.slice(0, -1).join('/');
          const parentDir = dirMap.get(parentPath);
          if (parentDir) {
            parentDir.children.push(dir);
          }
        }
      });

      // Create root directory
      const rootChildren: (FileInfo | DirectoryInfo)[] = [];

      // Add top-level files
      allFiles.forEach((file) => {
        if (!file.relativePath.includes('/')) {
          rootChildren.push(file);
        }
      });

      // Add top-level directories
      allDirectories.forEach((dir) => {
        if (!dir.relativePath.includes('/')) {
          rootChildren.push(dir);
        }
      });

      const rootDir: DirectoryInfo = {
        path: `/${owner}/${name}`,
        name: name ?? repo,
        children: rootChildren,
        fileCount: allFiles.length,
        totalSize,
        depth: 0,
        relativePath: '',
      };

      // Build the complete FileTree
      const fileTreeData: FileTree = {
        sha: tree.sha,
        root: rootDir,
        allFiles,
        allDirectories,
        stats: {
          totalFiles: allFiles.length,
          totalDirectories: allDirectories.length,
          totalSize,
          maxDepth,
        },
        metadata: {
          id: `github:${owner}/${name}:${tree.sha}`,
          timestamp: new Date(),
          sourceType: 'github',
          sourceSha: tree.sha,
          sourceInfo: {
            owner,
            name,
            provider: 'github',
          },
        },
      };

      setFileTree(fileTreeData);
      console.log('[PanelContext] File tree loaded with', allFiles.length, 'files and', allDirectories.length, 'directories');
      return tree.sha; // Return SHA for dependent fetches (e.g., quality metrics)
    } catch (err) {
      console.error('[PanelContext] Failed to fetch file tree:', err);
      setFileTreeError(err instanceof Error ? err : new Error('Failed to load file tree'));
      return null;
    } finally {
      setFileTreeLoading(false);
    }
  }, []);

  // Fetch quality metrics from GitHub Actions artifacts
  // When commitSha is provided, uses action=commit for better caching (immutable per SHA)
  // Otherwise falls back to action=latest (requires extra GitHub API call to resolve branch HEAD)
  const fetchQualityMetrics = useCallback(async (repo: string, commitSha?: string) => {
    if (!isAuthenticated) {
      setQualityData(null);
      return;
    }

    setQualityLoading(true);
    setQualityError(null);
    console.log('[PanelContext] Fetching quality metrics for:', repo, commitSha ? `(commit: ${commitSha.slice(0, 7)})` : '(latest)');

    try {
      const [owner, name] = repo.split('/');

      // Use commit-specific endpoint when SHA is available (better caching, fewer GitHub API calls)
      const action = commitSha ? `action=commit&commit=${commitSha}` : 'action=latest';
      const response = await fetch(
        `/api/github/repo/${owner}/${name}/quality-artifacts?${action}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[PanelContext] No quality artifacts found for repository');
          setQualityData(null);
          return;
        }
        if (response.status === 401) {
          console.log('[PanelContext] Not authenticated for quality artifacts');
          setQualityData(null);
          return;
        }
        throw new Error(`Failed to fetch quality metrics: ${response.statusText}`);
      }

      const data = await response.json();

      // Transform API response to QualitySliceData format
      // CLI now outputs per-package hexagons
      const qualitySliceData: QualitySliceData = {
        packages: (data.qualityMetrics.packages ?? []).map((pkg: { name: string; path?: string; hexagon: QualityMetrics }) => ({
          name: pkg.name,
          path: pkg.path,
          metrics: pkg.hexagon,
        })),
        lastUpdated: data.timestamp,
        commitSha: data.commitSha,
        branch: data.branch,
        fileCoverage: data.fileCoverage,
        fileMetrics: data.fileMetrics,
      };

      setQualityData(qualitySliceData);
      console.log('[PanelContext] Quality metrics loaded:', qualitySliceData);
      if (data.fileCoverage) {
        console.log('[PanelContext] File coverage loaded for', Object.keys(data.fileCoverage).length, 'files');
      }
      if (data.fileMetrics) {
        const lensCount = Object.keys(data.fileMetrics).length;
        console.log('[PanelContext] File metrics loaded for', lensCount, 'lenses');
      }
    } catch (err) {
      console.error('[PanelContext] Failed to fetch quality metrics:', err);
      setQualityError(err instanceof Error ? err : new Error('Failed to load quality metrics'));
    } finally {
      setQualityLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch packages from repository (parse package.json)
  // Note: Uses fileTreeRef to avoid dependency cycle
  const fileTreeRef = useRef<FileTree | null>(null);
  fileTreeRef.current = fileTree;

  const fetchPackages = useCallback(async (repo: string) => {
    setPackagesLoading(true);
    setPackagesError(null);
    console.log('[PanelContext] Fetching packages for:', repo);

    try {
      const [owner, name] = repo.split('/');

      // Use the server-side packages endpoint for full monorepo detection
      const response = await fetch(
        `/api/github/repo/${owner}/${name}/packages`
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[PanelContext] No packages found');
          setPackagesData(null);
          return;
        }
        throw new Error(`Failed to fetch packages: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.packages && Array.isArray(data.packages)) {
        // Store both packages and summary for PackageCompositionPanel
        const defaultSummary: PackageSummary = {
          isMonorepo: false,
          totalPackages: data.packages.length,
          workspacePackages: [],
          totalDependencies: 0,
          totalDevDependencies: 0,
          availableScripts: [],
        };
        setPackagesData({
          packages: data.packages,
          summary: data.summary || defaultSummary,
        });
        console.log('[PanelContext] Packages loaded:', data.packages.length, 'packages');
        if (data.summary) {
          console.log('[PanelContext] Package summary:', data.summary);
        }
      } else {
        setPackagesData(null);
      }
    } catch (err) {
      console.error('[PanelContext] Failed to fetch packages:', err);
      setPackagesError(err instanceof Error ? err : new Error('Failed to load packages'));
      setPackagesData(null);
    } finally {
      setPackagesLoading(false);
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
      [
        'github-repositories',
        {
          scope: 'global',
          name: 'github-repositories',
          data: githubRepos,
          loading: githubReposLoading,
          error: null,
          refresh: fetchGithubRepos,
        },
      ],
      [
        'quality',
        {
          scope: 'repository',
          name: 'quality',
          data: qualityData,
          loading: qualityLoading,
          error: qualityError,
          refresh: async () => {
            if (githubRepo) {
              // Use current fileTree SHA if available for better caching
              await fetchQualityMetrics(githubRepo, fileTree?.metadata?.sourceSha);
            }
          },
        },
      ],
      [
        'fileCityColorModes',
        {
          scope: 'repository',
          name: 'fileCityColorModes',
          // Provide quality data with explicitly enabled/selected modes (set via quality:colorMode:select events)
          data: qualityData ? {
            enabledModes: enabledColorModes,
            selectedColorMode,
            qualityData,
          } : null,
          loading: qualityLoading,
          error: qualityError,
          refresh: async () => {
            if (githubRepo && !collectionId) {
              await fetchQualityMetrics(githubRepo, fileTree?.metadata?.sourceSha);
            }
          },
        },
      ],
      [
        'current-projects',
        {
          scope: 'global',
          name: 'current-projects',
          data: {
            projects: presenceSessions,
            activeProject: githubRepo,
            currentActivity: undefined,
            isLoading: presenceLoading,
            error: presenceError?.message ?? null,
          } as CurrentProjectsSliceData,
          loading: presenceLoading,
          error: presenceError ?? null,
          refresh: async () => {
            // Presence data refreshes automatically via WebSocket
            console.log('[PanelContext] Current projects slice refresh triggered');
          },
        },
      ],
      [
        'packages',
        {
          scope: 'repository',
          name: 'packages',
          data: packagesData,
          loading: packagesLoading,
          error: packagesError,
          refresh: async () => {
            if (githubRepo) {
              await fetchPackages(githubRepo);
            }
          },
        },
      ],
      [
        'owner-repositories',
        {
          scope: 'global',
          name: 'owner-repositories',
          data: ownerRepos,
          loading: ownerReposLoading,
          error: ownerRepos.error ? new Error(ownerRepos.error) : null,
          refresh: async () => {
            if (currentOwner) {
              await fetchOwnerRepos(currentOwner);
            }
          },
        },
      ],
      [
        'workspace',
        {
          scope: 'global',
          name: 'workspace',
          data: collectionId && workspace ? {
            workspace: {
              id: collectionId,
              name: workspace.name,
              description: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            loading: false,
            error: undefined,
          } : null,
          loading: false,
          error: null,
          refresh: async () => {},
        },
      ],
      [
        'workspaceRepositories',
        {
          scope: 'global',
          name: 'workspaceRepositories',
          data: {
            repositories: collectionRepoDetails,
            loading: collectionRepoDetailsLoading,
            error: undefined,
          },
          loading: collectionRepoDetailsLoading,
          error: null,
          refresh: async () => {
            if (collectionRepositories) {
              await fetchCollectionRepoDetails(collectionRepositories);
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

  // Update github-repositories slice with fetched data
  const githubReposSlice = slicesRef.current.get('github-repositories');
  if (githubReposSlice) {
    slicesRef.current.set('github-repositories', {
      ...githubReposSlice,
      data: githubRepos,
      loading: githubReposLoading,
    });
  }

  // Update quality slice with fetched data
  const qualitySlice = slicesRef.current.get('quality');
  if (qualitySlice) {
    slicesRef.current.set('quality', {
      ...qualitySlice,
      data: qualityData,
      loading: qualityLoading,
      error: qualityError,
    });
  }

  // Update fileCityColorModes slice with quality data
  const fileCityColorModesSlice = slicesRef.current.get('fileCityColorModes');
  if (fileCityColorModesSlice) {
    slicesRef.current.set('fileCityColorModes', {
      ...fileCityColorModesSlice,
      data: qualityData ? {
        enabledModes: enabledColorModes,
        selectedColorMode,
        qualityData,
      } : null,
      loading: qualityLoading,
      error: qualityError,
    });
  }

  // Update current-projects slice with presence data
  const currentProjectsSlice = slicesRef.current.get('current-projects');
  if (currentProjectsSlice) {
    slicesRef.current.set('current-projects', {
      ...currentProjectsSlice,
      data: {
        projects: presenceSessions,
        activeProject: githubRepo,
        currentActivity: undefined, // TODO: Get from presence metadata
        isLoading: presenceLoading,
        error: presenceError?.message ?? null,
      } as CurrentProjectsSliceData,
      loading: presenceLoading,
      error: presenceError ?? null,
    });
  }

  // Update packages slice with fetched data
  const packagesSlice = slicesRef.current.get('packages');
  if (packagesSlice) {
    slicesRef.current.set('packages', {
      ...packagesSlice,
      data: packagesData,
      loading: packagesLoading,
      error: packagesError,
    });
  }

  // Update owner-repositories slice with fetched data
  const ownerReposSlice = slicesRef.current.get('owner-repositories');
  if (ownerReposSlice) {
    slicesRef.current.set('owner-repositories', {
      ...ownerReposSlice,
      data: ownerRepos,
      loading: ownerReposLoading,
      error: ownerRepos.error ? new Error(ownerRepos.error) : null,
    });
  }

  // Update workspace slice for collections
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

  // Update workspaceRepositories slice with collection repo details
  const workspaceReposSlice = slicesRef.current.get('workspaceRepositories');
  if (workspaceReposSlice) {
    slicesRef.current.set('workspaceRepositories', {
      ...workspaceReposSlice,
      data: {
        repositories: collectionRepoDetails,
        loading: collectionRepoDetailsLoading,
        error: undefined,
      },
      loading: collectionRepoDetailsLoading,
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

  // Create adapters for panels (e.g., Alexandria docs panel uses these for file reading)
  const adapters: PanelAdapters = useMemo(() => ({
    // readFile fetches file content from GitHub API
    readFile: async (relativePath: string): Promise<string> => {
      if (!githubRepo) {
        throw new Error('No GitHub repo specified');
      }

      const [owner, name] = githubRepo.split('/');
      // Clean path - remove leading slash and /GitHub/owner/repo prefix if present
      let cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
      // Strip the GitHub/owner/repo prefix that we add for MemoryPalace validation
      const githubPrefix = `GitHub/${githubRepo}/`;
      if (cleanPath.startsWith(githubPrefix)) {
        cleanPath = cleanPath.slice(githubPrefix.length);
      }

      const response = await fetch(
        `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(cleanPath)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }

      const data = await response.json();

      // Decode base64 content
      if (data.content && data.encoding === 'base64') {
        const binaryString = atob(data.content.replace(/\n/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
      }

      return data.content || '';
    },
    // matchesPath uses minimatch for glob pattern matching
    matchesPath: (pattern: string, filePath: string): boolean => {
      return minimatch(filePath, pattern);
    },
  }), [githubRepo]);

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
          // path needs to look like an absolute path for MemoryPalace validation
          path: `/GitHub/${githubRepo}`,
          githubRepo, // Add the full owner/repo string
        } : repository,
      },
      repositoryPath: githubRepo ? `/GitHub/${githubRepo}` : '',
      slices: slicesRef.current,
      adapters,
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
    [workspace, repository, refresh, githubRepo, adapters, fileTreeLoading, codebaseViewsLoading, markdownLoading, markdownContent, activeFilePath, fileTree, codebaseViews, isAuthenticated, githubRepos, githubReposLoading, qualityData, qualityLoading, qualityError, enabledColorModes, selectedColorMode, presenceSessions, presenceLoading, presenceConnected, packagesData, packagesLoading, packagesError, ownerRepos, ownerReposLoading, collectionId, collectionRepoDetails, collectionRepoDetailsLoading]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        // Remove leading slash from path
        let cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

        if (!githubRepo) {
          console.error('No GitHub repo specified');
          return;
        }

        // Strip "GitHub/" prefix if present
        if (cleanPath.startsWith('GitHub/')) {
          cleanPath = cleanPath.slice('GitHub/'.length);
        }

        // Strip the repo prefix if present (e.g., "owner/repo/src/file.ts" -> "src/file.ts")
        const repoPrefix = `${githubRepo}/`;
        if (cleanPath.startsWith(repoPrefix)) {
          cleanPath = cleanPath.slice(repoPrefix.length);
        }

        console.log('Opening file:', cleanPath);

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

          // Path comes as `${repositoryPath}/${configPath}` e.g. "/GitHub/owner/repo/.vgc/example.yaml"
          // Strip all prefixes to get the relative path within the repo
          let cleanPath = filePath;

          // Strip leading slash
          if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.slice(1);
          }

          // Strip "GitHub/" prefix if present
          if (cleanPath.startsWith('GitHub/')) {
            cleanPath = cleanPath.slice('GitHub/'.length);
          }

          // Strip the owner/repo prefix to get the relative path
          const repoPrefix = `${githubRepo}/`;
          if (cleanPath.startsWith(repoPrefix)) {
            cleanPath = cleanPath.slice(repoPrefix.length);
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
      previewReadme: async (owner: string, repo: string) => {
        console.log('[PanelContext] Previewing README for:', `${owner}/${repo}`);
        setMarkdownLoading(true);
        setMarkdownError(null);

        try {
          // Fetch README from GitHub API
          const response = await fetch(
            `/api/github/repo/${owner}/${repo}?action=file&path=README.md`
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch README: ${response.statusText}`);
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

          // Update active-file slice with the preview content
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
              name: repo,
              branch: 'main',
              location: 'README.md',
              url: `https://github.com/${owner}/${repo}/blob/main/README.md`,
            },
            preview: {
              isPreview: true,
              repository: `${owner}/${repo}`,
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

          // Update state to trigger re-render
          setActiveFilePath('README.md');
          setMarkdownContent(content);
          setMarkdownLoading(false);

          // Emit preview event
          events.emit({
            type: 'file:previewed',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: activeFileData,
          });

          return content;
        } catch (error) {
          console.error('[PanelContext] Error previewing README:', error);
          setMarkdownError(error instanceof Error ? error : new Error('Failed to load README'));
          setMarkdownLoading(false);
          throw error;
        }
      },
    }),
    [events, githubRepo]
  );

  const value: PanelProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      presenceConnected,
    }),
    [context, actions, events, presenceConnected]
  );

  // Fetch GitHub repositories when authentication state changes
  useEffect(() => {
    fetchGithubRepos();
  }, [fetchGithubRepos]);

  // Auto-fetch README, codebase views, and file tree when githubRepo changes
  useEffect(() => {
    if (!githubRepo) return;

    console.log('[PanelContext] Initializing data fetch for:', githubRepo);

    // Reset color mode state when repo changes
    setEnabledColorModes([]);
    setSelectedColorMode(null);

    // Fetch independent data in parallel
    fetchReadme(githubRepo);
    fetchCodebaseViews(githubRepo);
    fetchPackages(githubRepo);

    // Sequence tree → quality metrics to reuse SHA (saves GitHub API calls)
    // Tree fetch resolves commit SHA, which is then used for quality metrics caching
    const fetchTreeThenQuality = async () => {
      const commitSha = await fetchFileTree(githubRepo);
      // Pass SHA to quality metrics for better caching (action=commit vs action=latest)
      // If tree fetch failed, quality metrics falls back to action=latest
      fetchQualityMetrics(githubRepo, commitSha ?? undefined);
    };
    fetchTreeThenQuality();
  }, [githubRepo, fetchReadme, fetchCodebaseViews, fetchFileTree, fetchQualityMetrics, fetchPackages]);

  // Fetch owner repositories when initialOwner prop is provided (handles client-side navigation)
  useEffect(() => {
    if (initialOwner) {
      console.log('[PanelContext] Fetching repos for initialOwner:', initialOwner);
      fetchOwnerRepos(initialOwner);
    }
  }, [initialOwner, fetchOwnerRepos]);

  // Listen for owner-repositories events from panels
  useEffect(() => {
    // Handle request to fetch owner repositories
    const unsubRequest = events.on<{ owner: string }>('owner-repositories:request', (event) => {
      const { owner } = event.payload;
      if (owner) {
        console.log('[PanelContext] Received owner-repositories:request for:', owner);
        fetchOwnerRepos(owner);
      }
    });

    // Handle refresh request
    const unsubRefresh = events.on<{ owner: string }>('owner-repositories:refresh', (event) => {
      const { owner } = event.payload;
      if (owner) {
        console.log('[PanelContext] Received owner-repositories:refresh for:', owner);
        fetchOwnerRepos(owner);
      }
    });

    return () => {
      unsubRequest();
      unsubRefresh();
    };
  }, [events, fetchOwnerRepos]);

  // Listen for quality color mode selection events to enable modes in File City
  useEffect(() => {
    const unsubColorMode = events.on<{ colorMode: string }>('quality:colorMode:select', (event) => {
      const { colorMode } = event.payload;
      if (colorMode) {
        console.log('[PanelContext] Received quality:colorMode:select for:', colorMode);
        // Enable the mode if not already enabled
        setEnabledColorModes(prev => {
          if (prev.includes(colorMode)) return prev;
          return [...prev, colorMode];
        });
        // Set as the currently selected mode (File City will read this from the slice)
        setSelectedColorMode(colorMode);
      }
    });

    return () => {
      unsubColorMode();
    };
  }, [events]);

  // Fetch collection repository details when collectionRepositories prop is provided
  useEffect(() => {
    if (collectionRepositories && collectionRepositories.length > 0) {
      fetchCollectionRepoDetails(collectionRepositories);
    }
  }, [collectionRepositories, fetchCollectionRepoDetails]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelProvider() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelProvider must be used within PanelProvider');
  }
  return context;
}
