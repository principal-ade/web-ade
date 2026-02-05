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
import type { FormattedResults } from '@principal-ai/codebase-quality-lenses';
import { minimatch } from 'minimatch';
import { PathsFileTreeBuilder, type FileTree } from '@principal-ai/repository-abstraction';
import type { StoryboardContextSliceData } from '@principal-ai/principal-view-core';
import { useAuth } from './AuthContext';
import { useLocalFileSystem } from './LocalFileSystemContext';
import { useVFS } from './VFSContext';
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
  /** List of lens IDs that actually ran for this package */
  lensesRan?: string[];
  /** True if this is a monorepo orchestrator package (config-only, no source) */
  isOrchestrator?: boolean;
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
    // Linting
    eslint?: FileMetricData[];
    'biome-lint'?: FileMetricData[];
    // Types
    typescript?: FileMetricData[];
    // Formatting
    prettier?: FileMetricData[];
    'biome-format'?: FileMetricData[];
    // Dead code
    knip?: FileMetricData[];
    // Tests
    jest?: FileMetricData[];
    vitest?: FileMetricData[];
    'bun-test'?: FileMetricData[];
    // Documentation
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

// Repository capabilities slice data (Claude workflow detection, etc.)
interface RepoCapabilitiesSliceData {
  hasClaudeWorkflow: boolean;
  claudeWorkflowPath?: string;
}

// Shared GitHub user/label types (used by messages/PRs)
interface GitHubUser {
  login: string;
  avatar_url: string;
}

interface GitHubLabel {
  id: number;
  name: string;
  color: string;
}

// GitHub Messages types for GitHubMessagesPanel
interface GitHubMessagesTarget {
  type: 'issue' | 'pull_request';
  number: number;
  title: string;
  state: 'open' | 'closed';
  user: GitHubUser;
  created_at: string;
  html_url: string;
  merged?: boolean;
  merged_at?: string | null;
  draft?: boolean;
  labels?: GitHubLabel[];
  assignees?: GitHubUser[];
}

interface GitHubMessagesSliceData {
  target: GitHubMessagesTarget | null;
  timeline: unknown[];
  reviewComments: unknown[];
  owner: string;
  repo: string;
  loading: boolean;
  isAuthenticated: boolean;
  error?: string;
}

interface CommitFilesSliceData {
  filesByStatus: {
    added: string[];
    modified: string[];
    removed: string[];
    renamed: string[];
  };
  commitHash: string | null;
  stats?: {
    total: number;
    additions: number;
    deletions: number;
  };
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
  /** Currently selected color mode (for File City visualization) */
  selectedColorMode: string | null;
  /** Clear the current color mode selection */
  clearColorMode: () => void;
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
  const { adapter: localAdapter } = useLocalFileSystem();
  const isLocalMode = !!localAdapter;

  // Get VFS for file operations (pending layer + GitHub fallback)
  // Use refs to avoid dependency on vfs object which changes on every render
  const vfs = useVFS();
  const vfsInitializedRef = useRef(false);
  const vfsRef = useRef(vfs);
  vfsRef.current = vfs;

  // Initialize VFS when repository changes (GitHub mode only)
  useEffect(() => {
    // Skip if in local mode or no repo specified
    if (isLocalMode || !githubRepo) {
      vfsInitializedRef.current = false;
      return;
    }

    // Parse owner/repo
    const parts = githubRepo.split('/');
    const repoOwner = parts[0];
    const repoName = parts[1];
    if (!repoOwner || !repoName) {
      console.warn('[PanelContext] Invalid githubRepo format:', githubRepo);
      return;
    }

    // Get branch from repository prop or default to 'main'
    const branch: string = (repository as { default_branch?: string })?.default_branch || 'main';

    // Initialize VFS (use ref to avoid dependency on vfs object)
    console.log('[PanelContext] Initializing VFS for', githubRepo, 'branch:', branch);
    vfsRef.current.initialize({
      mode: 'github',
      github: {
        owner: repoOwner,
        repo: repoName,
        branch: branch,
      },
    }).then(() => {
      vfsInitializedRef.current = true;
      console.log('[PanelContext] VFS initialized successfully');
    }).catch((err) => {
      console.error('[PanelContext] Failed to initialize VFS:', err);
    });

    // Cleanup on repo change
    return () => {
      vfsInitializedRef.current = false;
    };
  }, [githubRepo, repository?.default_branch, isLocalMode]);

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
  // State for raw lens results (for LensDataDebugPanel)
  const [lensResults, setLensResults] = useState<FormattedResults | null>(null);
  // State for explicitly enabled File City color modes (updated via events)
  const [enabledColorModes, setEnabledColorModes] = useState<string[]>([]);
  // State for the currently selected color mode (updated via events, consumed by File City)
  const [selectedColorMode, setSelectedColorMode] = useState<string | null>(null);

  // State for storyboard context (updated via events from EditorLayout, consumed by File City)
  const [storyboardContextData, setStoryboardContextData] = useState<StoryboardContextSliceData | null>(null);

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

  // State for commits (for GitCommitHistoryPanel)
  interface GitCommitInfo {
    hash: string;
    message: string;
    author: string;
    authorEmail?: string;
    date: string;
  }
  const [commitsData, setCommitsData] = useState<GitCommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<Error | null>(null);

  // State for GitHub messages/timeline (for GitHubMessagesPanel)
  const [messagesData, setMessagesData] = useState<GitHubMessagesSliceData | null>(null);

  // State for commit files (files changed in selected commit - for File-City visualization)
  const [commitFilesData, setCommitFilesData] = useState<CommitFilesSliceData | null>(null);

  // State for feed project (GitHub repo info + root package info for FeedCodeCityPanel)
  interface FeedProjectData {
    repo: {
      owner: string;
      name: string;
      fullName: string;
      description?: string;
      htmlUrl: string;
      stars: number;
      forks: number;
      watchers?: number;
      openIssues?: number;
      isOrganization?: boolean;
      avatarUrl?: string;
      license?: string;
    };
    rootPackage?: {
      name?: string;
      version?: string;
      license?: string;
      packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo' | 'unknown';
      dependencyCount?: number;
      devDependencyCount?: number;
      isMonorepo?: boolean;
      packageCount?: number;
    };
  }
  const [feedProjectData, setFeedProjectData] = useState<FeedProjectData | null>(null);
  const [feedProjectLoading, setFeedProjectLoading] = useState(false);
  const [feedProjectError, setFeedProjectError] = useState<Error | null>(null);

  // State for user GitHub data (for GitHubStarredPanel and GitHubProjectsPanel)
  interface UserGitHubData {
    starred: GitHubRepository[];
    owned: GitHubRepository[];
    organizations: Array<{
      id: number;
      login: string;
      avatar_url: string;
      description: string | null;
      repositories: GitHubRepository[];
    }>;
    currentUser?: string;
    isAuthenticated: boolean;
  }
  const [userGitHubData, setUserGitHubData] = useState<UserGitHubData>({
    starred: [],
    owned: [],
    organizations: [],
    isAuthenticated: false,
  });
  const [userGitHubLoading, setUserGitHubLoading] = useState(false);

  // Fetch user's GitHub data (starred, owned, orgs)
  const fetchUserGitHubData = useCallback(async () => {
    setUserGitHubLoading(true);
    console.log('[PanelContext] Fetching user GitHub data');

    try {
      const response = await fetch('/api/github/user/repos', {
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data.isAuthenticated) {
        setUserGitHubData({
          starred: [],
          owned: [],
          organizations: [],
          isAuthenticated: false,
        });
        return;
      }

      // Get current user from owned repos
      const currentUser = data.owned?.[0]?.owner?.login;

      setUserGitHubData({
        starred: data.starred || [],
        owned: data.owned || [],
        organizations: data.organizations || [],
        currentUser,
        isAuthenticated: true,
      });

      console.log('[PanelContext] User GitHub data loaded:', {
        starredCount: data.starred?.length || 0,
        ownedCount: data.owned?.length || 0,
        orgsCount: data.organizations?.length || 0,
      });
    } catch (err) {
      console.error('[PanelContext] Failed to fetch user GitHub data:', err);
      setUserGitHubData({
        starred: [],
        owned: [],
        organizations: [],
        isAuthenticated: false,
      });
    } finally {
      setUserGitHubLoading(false);
    }
  }, []);

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

  // Fetch commits from GitHub API
  const fetchCommits = useCallback(async (repo: string, limit: number = 30) => {
    setCommitsLoading(true);
    setCommitsError(null);
    console.log('[PanelContext] Fetching commits for:', repo);

    try {
      const [owner, name] = repo.split('/');
      const response = await fetch(
        `/api/github/repo/${owner}/${name}/commits?per_page=${limit}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch commits: ${response.statusText}`);
      }

      const data = await response.json();

      // Transform GitHub API response to GitCommitInfo format
      const commits: GitCommitInfo[] = (data.commits || data).map((commit: {
        sha: string;
        commit: {
          message: string;
          author: {
            name: string;
            email: string;
            date: string;
          };
        };
      }) => ({
        hash: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name,
        authorEmail: commit.commit.author.email,
        date: commit.commit.author.date,
      }));

      setCommitsData(commits);
      console.log('[PanelContext] Commits loaded:', commits.length);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch commits:', err);
      setCommitsError(err instanceof Error ? err : new Error('Failed to fetch commits'));
    } finally {
      setCommitsLoading(false);
    }
  }, []);

  // Fetch messages/timeline for an issue or PR
  const fetchMessages = useCallback(async (
    owner: string,
    repo: string,
    number: number,
    issue: {
      number: number;
      title: string;
      state: 'open' | 'closed';
      user: GitHubUser;
      created_at: string;
      html_url: string;
      labels?: GitHubLabel[];
      assignees?: GitHubUser[];
    }
  ) => {
    console.log('[PanelContext] Fetching messages for:', owner, repo, '#', number);

    // Set loading state
    setMessagesData({
      target: {
        type: 'issue', // Will be updated based on timeline response
        number: issue.number,
        title: issue.title,
        state: issue.state,
        user: issue.user,
        created_at: issue.created_at,
        html_url: issue.html_url,
      },
      timeline: [],
      reviewComments: [],
      owner,
      repo,
      loading: true,
      isAuthenticated: true,
    });

    try {
      const response = await fetch(
        `/api/github/repo/${owner}/${repo}/issues/${number}/timeline?per_page=100`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setMessagesData(prev => prev ? {
          ...prev,
          loading: false,
          error: errorData.error || `Failed to fetch messages: ${response.statusText}`,
        } : null);
        return;
      }

      const data = await response.json();

      setMessagesData(prev => prev ? {
        ...prev,
        target: prev.target ? {
          ...prev.target,
          type: data.isPullRequest ? 'pull_request' : 'issue',
        } : null,
        timeline: data.timeline || [],
        reviewComments: data.reviewComments || [],
        loading: false,
      } : null);

      console.log('[PanelContext] Messages loaded:', data.timeline?.length || 0, 'events');

      // Emit the data event so the panel can receive it
      events.emit({
        type: 'github-messages:data',
        source: 'panel-context',
        timestamp: Date.now(),
        payload: {
          target: {
            type: data.isPullRequest ? 'pull_request' : 'issue',
            number: issue.number,
            title: issue.title,
            state: issue.state,
            user: issue.user,
            created_at: issue.created_at,
            html_url: issue.html_url,
          },
          timeline: data.timeline || [],
          reviewComments: data.reviewComments || [],
          owner,
          repo,
          loading: false,
          isAuthenticated: true,
        },
      });
    } catch (err) {
      console.error('[PanelContext] Failed to fetch messages:', err);
      setMessagesData(prev => prev ? {
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch messages',
      } : null);
    }
  }, [events]);

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

  // Fetch file tree from GitHub or local filesystem and build FileTree using PathsFileTreeBuilder
  // Returns the commit SHA for use by other fetches (e.g., quality metrics) - null for local mode
  const fetchFileTree = useCallback(async (repo: string): Promise<string | null> => {
    setFileTreeLoading(true);
    setFileTreeError(null);
    console.log('[PanelContext] Fetching file tree for:', repo, isLocalMode ? '(local mode)' : '');

    try {
      // Local mode: build file tree from local filesystem
      if (isLocalMode && localAdapter) {
        const filePaths = await localAdapter.buildFileTree();
        const [owner, name] = repo.split('/');

        // Use PathsFileTreeBuilder to construct the FileTree
        const builder = new PathsFileTreeBuilder();
        const builtTree = builder.build({
          files: filePaths,
          rootPath: `/${owner}/${name}`,
        });

        // Override metadata with local-specific info
        const fileTreeData: FileTree = {
          ...builtTree,
          sha: 'local',
          metadata: {
            ...builtTree.metadata,
            id: `local:${owner}/${name}`,
            sourceType: 'local' as const,
            sourceSha: 'local',
            sourceInfo: {
              owner,
              name,
              provider: 'local',
            },
          },
        };

        setFileTree(fileTreeData);
        console.log('[PanelContext] Local file tree loaded with', fileTreeData.allFiles.length, 'files and', fileTreeData.allDirectories.length, 'directories');
        return null; // No SHA for local mode
      }

      // GitHub mode: fetch from API
      const [owner, name] = repo.split('/');

      // Fetch file tree from GitHub API with cache-busting
      const response = await fetch(`/api/github/repo/${owner}/${name}?action=tree`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file tree: ${response.statusText}`);
      }

      const tree: GitHubTreeResponse = await response.json();

      // Extract file paths from GitHub tree response (blobs only, not directories)
      const filePaths = tree.tree
        .filter((item) => item.type === 'blob')
        .map((item) => item.path);

      // Use PathsFileTreeBuilder to construct the FileTree
      // This handles extensions correctly (with leading dot) and builds the full tree structure
      const builder = new PathsFileTreeBuilder();
      const builtTree = builder.build({
        files: filePaths,
        rootPath: `/${owner}/${name}`,
      });

      // Override metadata with GitHub-specific info
      const fileTreeData: FileTree = {
        ...builtTree,
        sha: tree.sha,
        metadata: {
          ...builtTree.metadata,
          id: `github:${owner}/${name}:${tree.sha}`,
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
      console.log('[PanelContext] File tree loaded with', fileTreeData.allFiles.length, 'files and', fileTreeData.allDirectories.length, 'directories');
      return tree.sha; // Return SHA for dependent fetches (e.g., quality metrics)
    } catch (err) {
      console.error('[PanelContext] Failed to fetch file tree:', err);
      setFileTreeError(err instanceof Error ? err : new Error('Failed to load file tree'));
      return null;
    } finally {
      setFileTreeLoading(false);
    }
  }, [isLocalMode, localAdapter]);

  // Fetch quality metrics from GitHub Actions artifacts
  // When commitSha is provided, uses action=commit for better caching (immutable per SHA)
  // Otherwise falls back to action=latest (requires extra GitHub API call to resolve branch HEAD)
  const fetchQualityMetrics = useCallback(async (repo: string, commitSha?: string) => {
    // Don't require authentication - server will use GITHUB_TOKEN fallback for public repos
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
      // CLI now outputs per-package hexagons, lensesRan, and isOrchestrator
      const qualitySliceData: QualitySliceData = {
        packages: (data.qualityMetrics.packages ?? []).map((pkg: { name: string; path?: string; hexagon: QualityMetrics; lensesRan?: string[]; isOrchestrator?: boolean }) => ({
          name: pkg.name,
          path: pkg.path,
          metrics: pkg.hexagon,
          lensesRan: pkg.lensesRan,
          isOrchestrator: pkg.isOrchestrator,
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
      // Store raw lens results for LensDataDebugPanel
      if (data.rawResults) {
        setLensResults(data.rawResults);
        console.log('[PanelContext] Raw lens results loaded:', data.rawResults.results?.length || 0, 'results');
      }
    } catch (err) {
      console.error('[PanelContext] Failed to fetch quality metrics:', err);
      setQualityError(err instanceof Error ? err : new Error('Failed to load quality metrics'));
    } finally {
      setQualityLoading(false);
    }
  }, []);

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

  // Fetch feed project data (GitHub repo info + root package info) for FeedCodeCityPanel
  const fetchFeedProject = useCallback(async (repo: string) => {
    setFeedProjectLoading(true);
    setFeedProjectError(null);
    console.log('[PanelContext] Fetching feed project data for:', repo);

    try {
      const [owner, name] = repo.split('/');
      if (!owner || !name) {
        throw new Error('Invalid repository format');
      }

      // Fetch repo info and packages in parallel
      const [repoResponse, packagesResponse] = await Promise.all([
        fetch(`/api/github/repo/${owner}/${name}?action=info`, { credentials: 'include' }),
        fetch(`/api/github/repo/${owner}/${name}/packages`, { credentials: 'include' }),
      ]);

      if (!repoResponse.ok) {
        throw new Error(`Failed to fetch repo info: ${repoResponse.statusText}`);
      }

      const repoData = await repoResponse.json();
      let rootPackage: FeedProjectData['rootPackage'] | undefined;

      // Parse packages data if available
      if (packagesResponse.ok) {
        const packagesData = await packagesResponse.json();
        if (packagesData.packages && packagesData.summary) {
          // Find root package (monorepo root or single package)
          const rootPkg = packagesData.packages.find(
            (p: { packageData?: { isMonorepoRoot?: boolean } }) => p.packageData?.isMonorepoRoot
          ) || packagesData.packages[0];

          if (rootPkg?.packageData) {
            rootPackage = {
              name: rootPkg.packageData.name,
              version: rootPkg.packageData.version,
              packageManager: rootPkg.packageData.packageManager,
              dependencyCount: Object.keys(rootPkg.packageData.dependencies || {}).length,
              devDependencyCount: Object.keys(rootPkg.packageData.devDependencies || {}).length,
              isMonorepo: packagesData.summary.isMonorepo,
              packageCount: packagesData.summary.totalPackages,
            };
          }
        }
      }

      // Transform GitHub API response to FeedProjectData format
      const feedData: FeedProjectData = {
        repo: {
          owner: repoData.owner?.login || owner,
          name: repoData.name || name,
          fullName: repoData.full_name || `${owner}/${name}`,
          description: repoData.description,
          htmlUrl: repoData.html_url || `https://github.com/${owner}/${name}`,
          stars: repoData.stargazers_count || 0,
          forks: repoData.forks_count || 0,
          watchers: repoData.watchers_count,
          openIssues: repoData.open_issues_count,
          isOrganization: repoData.owner?.type === 'Organization',
          avatarUrl: repoData.owner?.avatar_url,
          license: repoData.license?.spdx_id || repoData.license?.name,
        },
        rootPackage,
      };

      setFeedProjectData(feedData);
      console.log('[PanelContext] Feed project data loaded:', feedData.repo.fullName);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch feed project data:', err);
      setFeedProjectError(err instanceof Error ? err : new Error('Failed to load feed project'));
      setFeedProjectData(null);
    } finally {
      setFeedProjectLoading(false);
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
    console.log('[PanelContext] Fetching README for:', repo, isLocalMode ? '(local mode)' : '');

    try {
      const [owner, name] = repo.split('/');
      let content = '';

      // Local mode: read README from local filesystem
      if (isLocalMode && localAdapter) {
        // Try common README filenames
        const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README.MD'];
        let found = false;
        for (const readmeName of readmeNames) {
          try {
            content = await localAdapter.readFileAsync(readmeName);
            found = true;
            break;
          } catch {
            // Try next filename
          }
        }
        if (!found) {
          throw new Error('README not found');
        }
      } else {
        // GitHub mode: fetch from API
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
        if (data.content && data.encoding === 'base64') {
          const binaryString = atob(data.content.replace(/\n/g, ''));
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const decoder = new TextDecoder('utf-8');
          content = decoder.decode(bytes);
        }
      }

      // Create ActiveFileSlice structure
      const activeFileData = {
        path: 'README.md',
        content: content,
        type: 'markdown',
        size: content.length,
        lastModified: new Date(),
        encoding: 'utf-8',
        source: isLocalMode ? {
          type: 'local' as const,
          provider: 'filesystem',
          location: 'README.md',
        } : {
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
  }, [events, isLocalMode, localAdapter]);

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
          // Always pass selectedColorMode so file-city doesn't fall back to fileTypes while data loads
          data: {
            enabledModes: enabledColorModes,
            selectedColorMode,
            qualityData: qualityData ?? undefined,
          },
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
        'storyboardContext',
        {
          scope: 'repository',
          name: 'storyboardContext',
          // Populated by EditorLayout when a storyboard/workflow is selected
          // Used by file-city-panel to highlight source files
          data: storyboardContextData,
          loading: false,
          error: null,
          refresh: async () => {
            // Storyboard context is updated via events, not refresh
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
        'feedProject',
        {
          scope: 'repository',
          name: 'feedProject',
          data: feedProjectData,
          loading: feedProjectLoading,
          error: feedProjectError,
          refresh: async () => {
            if (githubRepo) {
              await fetchFeedProject(githubRepo);
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
        'repoCapabilities',
        {
          scope: 'repository',
          name: 'repoCapabilities',
          data: {
            hasClaudeWorkflow: !!fileTree?.allFiles?.some(
              file => file.path.match(/\.github\/workflows\/.*claude.*\.ya?ml/i)
            ),
            claudeWorkflowPath: fileTree?.allFiles?.find(
              file => file.path.match(/\.github\/workflows\/.*claude.*\.ya?ml/i)
            )?.path,
          },
          loading: false,
          error: null,
          refresh: async () => {
            // Re-check workflow files when file tree changes
            if (githubRepo) {
              await fetchFileTree(githubRepo);
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
      [
        'commits',
        {
          scope: 'repository',
          name: 'commits',
          data: { commits: commitsData },
          loading: commitsLoading,
          error: commitsError,
          refresh: async () => {
            if (githubRepo) {
              await fetchCommits(githubRepo);
            }
          },
        },
      ],
      [
        'lensResults',
        {
          scope: 'repository',
          name: 'lensResults',
          data: lensResults,
          loading: qualityLoading,
          error: qualityError,
          refresh: async () => {
            if (githubRepo) {
              await fetchQualityMetrics(githubRepo, fileTree?.metadata?.sourceSha);
            }
          },
        },
      ],
      [
        'github-messages',
        {
          scope: 'repository',
          name: 'github-messages',
          data: messagesData,
          loading: messagesData?.loading ?? false,
          error: messagesData?.error ? new Error(messagesData.error) : null,
          refresh: async () => {
            // Messages are fetched on issue selection, no manual refresh needed
          },
        },
      ],
      [
        'commitFiles',
        {
          scope: 'repository',
          name: 'commitFiles',
          data: commitFilesData,
          loading: false,
          error: null,
          refresh: async () => {
            // Commit files are populated via events, no direct refresh
          },
        },
      ],
      [
        'githubStarred',
        {
          scope: 'global',
          name: 'githubStarred',
          data: {
            repositories: userGitHubData.starred,
            loading: userGitHubLoading,
            error: undefined,
          },
          loading: userGitHubLoading,
          error: null,
          refresh: fetchUserGitHubData,
        },
      ],
      [
        'githubProjects',
        {
          scope: 'global',
          name: 'githubProjects',
          data: {
            userRepositories: userGitHubData.owned,
            organizations: userGitHubData.organizations.map(org => ({
              id: org.id,
              login: org.login,
              avatar_url: org.avatar_url,
              description: org.description,
            })),
            orgRepositories: userGitHubData.organizations.reduce((acc, org) => {
              acc[org.login] = org.repositories;
              return acc;
            }, {} as Record<string, GitHubRepository[]>),
            loading: userGitHubLoading,
            error: undefined,
            currentUser: userGitHubData.currentUser,
          },
          loading: userGitHubLoading,
          error: null,
          refresh: fetchUserGitHubData,
        },
      ],
      [
        'preferences',
        {
          scope: 'global',
          name: 'preferences',
          data: (() => {
            // Load initial preferences from localStorage
            if (typeof window !== 'undefined') {
              try {
                const saved = localStorage.getItem('editor-preferences');
                if (saved) {
                  return JSON.parse(saved);
                }
              } catch {
                // Ignore parse errors
              }
            }
            return { vimMode: false };
          })(),
          loading: false,
          error: null,
          refresh: async () => {},
        },
      ],
      [
        'repoCapabilities',
        {
          scope: 'repository',
          name: 'repoCapabilities',
          data: {
            hasClaudeWorkflow: false,
            claudeWorkflowPath: undefined,
          } as RepoCapabilitiesSliceData,
          loading: false,
          error: null,
          refresh: async () => {
            // Capabilities are derived from fileTree, so refresh fileTree instead
            const fileTreeSlice = slicesRef.current.get('fileTree');
            if (fileTreeSlice?.refresh) {
              await fileTreeSlice.refresh();
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

  // Update repoCapabilities slice based on file tree
  // Check for Claude workflow file in .github/workflows/
  const repoCapabilitiesSlice = slicesRef.current.get('repoCapabilities');
  if (repoCapabilitiesSlice) {
    const allFiles = fileTree?.allFiles;
    const claudeWorkflowPath = allFiles?.find(
      (file) => file.path === '.github/workflows/claude.yml' || file.path === '.github/workflows/claude.yaml'
    )?.path;

    slicesRef.current.set('repoCapabilities', {
      ...repoCapabilitiesSlice,
      data: {
        hasClaudeWorkflow: !!claudeWorkflowPath,
        claudeWorkflowPath,
      } as RepoCapabilitiesSliceData,
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
      // Always pass selectedColorMode so file-city doesn't fall back to fileTypes while data loads
      data: {
        enabledModes: enabledColorModes,
        selectedColorMode,
        qualityData: qualityData ?? undefined,
      },
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

  // Update feedProject slice with fetched data
  const feedProjectSlice = slicesRef.current.get('feedProject');
  if (feedProjectSlice) {
    slicesRef.current.set('feedProject', {
      ...feedProjectSlice,
      data: feedProjectData,
      loading: feedProjectLoading,
      error: feedProjectError,
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

  // Update commits slice with fetched data
  const commitsSlice = slicesRef.current.get('commits');
  if (commitsSlice) {
    slicesRef.current.set('commits', {
      ...commitsSlice,
      data: { commits: commitsData },
      loading: commitsLoading,
      error: commitsError,
    });
  }

  // Update lensResults slice with fetched data
  const lensResultsSlice = slicesRef.current.get('lensResults');
  if (lensResultsSlice) {
    slicesRef.current.set('lensResults', {
      ...lensResultsSlice,
      data: lensResults,
      loading: qualityLoading,
      error: qualityError,
    });
  }

  // Update github-messages slice with fetched data
  const messagesSlice = slicesRef.current.get('github-messages');
  if (messagesSlice) {
    slicesRef.current.set('github-messages', {
      ...messagesSlice,
      data: messagesData,
      loading: messagesData?.loading ?? false,
      error: messagesData?.error ? new Error(messagesData.error) : null,
    });
  }

  // Update commitFiles slice with data (for File-City commit visualization)
  const commitFilesSlice = slicesRef.current.get('commitFiles');
  if (commitFilesSlice) {
    slicesRef.current.set('commitFiles', {
      ...commitFilesSlice,
      data: commitFilesData,
    });
  }

  // Update storyboardContext slice with event-driven data
  const storyboardContextSlice = slicesRef.current.get('storyboardContext');
  if (storyboardContextSlice) {
    slicesRef.current.set('storyboardContext', {
      ...storyboardContextSlice,
      data: storyboardContextData,
    });
  }

  // Update githubStarred slice with fetched data
  const starredSlice = slicesRef.current.get('githubStarred');
  if (starredSlice) {
    slicesRef.current.set('githubStarred', {
      ...starredSlice,
      data: {
        repositories: userGitHubData.starred,
        loading: userGitHubLoading,
        error: undefined,
      },
      loading: userGitHubLoading,
    });
  }

  // Update githubProjects slice with fetched data
  const projectsSlice = slicesRef.current.get('githubProjects');
  if (projectsSlice) {
    slicesRef.current.set('githubProjects', {
      ...projectsSlice,
      data: {
        userRepositories: userGitHubData.owned,
        organizations: userGitHubData.organizations.map(org => ({
          id: org.id,
          login: org.login,
          avatar_url: org.avatar_url,
          description: org.description,
        })),
        orgRepositories: userGitHubData.organizations.reduce((acc, org) => {
          acc[org.login] = org.repositories;
          return acc;
        }, {} as Record<string, GitHubRepository[]>),
        loading: userGitHubLoading,
        error: undefined,
        currentUser: userGitHubData.currentUser,
      },
      loading: userGitHubLoading,
    });
  }

  // Listen for preferences:update events to update preferences slice
  useEffect(() => {
    const unsubscribe = events.on('preferences:update', (event) => {
      const payload = event.payload as { vimMode?: boolean };
      const preferencesSlice = slicesRef.current.get('preferences');
      if (preferencesSlice) {
        const currentData = preferencesSlice.data || {};
        const newData = { ...currentData, ...payload };
        slicesRef.current.set('preferences', {
          ...preferencesSlice,
          data: newData,
        });
        // Persist to localStorage
        try {
          localStorage.setItem('editor-preferences', JSON.stringify(newData));
        } catch {
          // Ignore storage errors
        }
      }
    });
    return unsubscribe;
  }, [events]);

  // Listen for GitHub messages panel interactive events (reactions, comments, delete)
  useEffect(() => {
    // Handle reaction add
    const unsubscribeReactionAdd = events.on('github-messages:reaction:add', async (event) => {
      const payload = event.payload as {
        owner: string;
        repo: string;
        targetType: 'issue' | 'pull_request';
        targetNumber: number;
        itemType: 'comment' | 'review' | 'review_comment';
        itemId: number | string;
        reactionType: string;
      };

      console.log('[PanelContext] Adding reaction:', payload);

      try {
        let endpoint = '';

        // Determine the correct endpoint based on item type
        if (payload.itemType === 'comment') {
          // Issue/PR comment reaction
          endpoint = `/api/github/repo/${payload.owner}/${payload.repo}/issues/comments/${payload.itemId}/reactions`;
        } else if (payload.itemType === 'review_comment') {
          // PR review comment reaction
          endpoint = `/api/github/repo/${payload.owner}/${payload.repo}/pull-requests/comments/${payload.itemId}/reactions`;
        } else {
          // For reviews, we don't support reactions yet
          console.warn('[PanelContext] Reactions on review summaries not yet supported');
          return;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: payload.reactionType }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to add reaction');
        }

        const data = await response.json();
        console.log('[PanelContext] Reaction added:', data);

        // Refresh messages to get updated reactions
        if (messagesData?.target) {
          await fetchMessages(payload.owner, payload.repo, payload.targetNumber, {
            number: payload.targetNumber,
            title: messagesData.target.title,
            state: messagesData.target.state,
            html_url: messagesData.target.html_url,
            created_at: messagesData.target.created_at,
            labels: messagesData.target.labels || [],
            user: messagesData.target.user,
            assignees: messagesData.target.assignees || [],
          });
        }
      } catch (error) {
        console.error('[PanelContext] Error adding reaction:', error);
      }
    });

    // Handle reaction remove
    const unsubscribeReactionRemove = events.on('github-messages:reaction:remove', async (event) => {
      const payload = event.payload as {
        owner: string;
        repo: string;
        targetType: 'issue' | 'pull_request';
        targetNumber: number;
        itemType: 'comment' | 'review' | 'review_comment';
        itemId: number | string;
        reactionId: number;
      };

      console.log('[PanelContext] Removing reaction:', payload);

      try {
        let endpoint = '';

        // Determine the correct endpoint based on item type
        if (payload.itemType === 'comment') {
          // Issue/PR comment reaction
          endpoint = `/api/github/repo/${payload.owner}/${payload.repo}/issues/comments/${payload.itemId}/reactions?reactionId=${payload.reactionId}`;
        } else if (payload.itemType === 'review_comment') {
          // PR review comment reaction
          endpoint = `/api/github/repo/${payload.owner}/${payload.repo}/pull-requests/comments/${payload.itemId}/reactions?reactionId=${payload.reactionId}`;
        } else {
          console.warn('[PanelContext] Reactions on review summaries not yet supported');
          return;
        }

        const response = await fetch(endpoint, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to remove reaction');
        }

        console.log('[PanelContext] Reaction removed');

        // Refresh messages to get updated reactions
        if (messagesData?.target) {
          await fetchMessages(payload.owner, payload.repo, payload.targetNumber, {
            number: payload.targetNumber,
            title: messagesData.target.title,
            state: messagesData.target.state,
            html_url: messagesData.target.html_url,
            created_at: messagesData.target.created_at,
            labels: messagesData.target.labels || [],
            user: messagesData.target.user,
            assignees: messagesData.target.assignees || [],
          });
        }
      } catch (error) {
        console.error('[PanelContext] Error removing reaction:', error);
      }
    });

    // Handle comment creation
    const unsubscribeCommentCreate = events.on('github-messages:comment:create', async (event) => {
      const payload = event.payload as {
        owner: string;
        repo: string;
        targetType: 'issue' | 'pull_request';
        targetNumber: number;
        body: string;
      };

      console.log('[PanelContext] Creating comment:', payload);

      try {
        const endpoint = payload.targetType === 'pull_request'
          ? `/api/github/repo/${payload.owner}/${payload.repo}/pull-requests/${payload.targetNumber}`
          : `/api/github/repo/${payload.owner}/${payload.repo}/issues/${payload.targetNumber}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: payload.body }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create comment');
        }

        const data = await response.json();
        console.log('[PanelContext] Comment created:', data);

        // Emit success event
        events.emit({
          type: 'github-messages:comment:created',
          source: 'panel-context',
          timestamp: Date.now(),
          payload: {
            targetNumber: payload.targetNumber,
            comment: data.comment,
          },
        });

        // Refresh messages to show new comment
        if (messagesData?.target) {
          await fetchMessages(payload.owner, payload.repo, payload.targetNumber, {
            number: payload.targetNumber,
            title: messagesData.target.title,
            state: messagesData.target.state,
            html_url: messagesData.target.html_url,
            created_at: messagesData.target.created_at,
            labels: messagesData.target.labels || [],
            user: messagesData.target.user,
            assignees: messagesData.target.assignees || [],
          });
        }
      } catch (error) {
        console.error('[PanelContext] Error creating comment:', error);

        // Emit error event
        events.emit({
          type: 'github-messages:comment:error',
          source: 'panel-context',
          timestamp: Date.now(),
          payload: {
            targetNumber: payload.targetNumber,
            error: error instanceof Error ? error.message : 'Failed to create comment',
          },
        });
      }
    });

    return () => {
      unsubscribeReactionAdd();
      unsubscribeReactionRemove();
      unsubscribeCommentCreate();
    };
  }, [events, messagesData, fetchMessages, githubRepo]);

  // Listen for commit-detail:loaded events to update commit files for File-City visualization
  useEffect(() => {
    const unsubscribeLoaded = events.on('git-panels.commit-detail:loaded', (event) => {
      const payload = event.payload as {
        commit?: {
          hash: string;
          files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
          stats?: { total: number; additions: number; deletions: number };
        };
      };
      const commit = payload?.commit;
      if (commit && commit.files) {
        console.log('[PanelContext] Commit detail loaded, updating commit files');
        const filesByStatus = {
          added: commit.files.filter(f => f.status === 'added').map(f => f.filename),
          modified: commit.files.filter(f => f.status === 'modified').map(f => f.filename),
          removed: commit.files.filter(f => f.status === 'removed').map(f => f.filename),
          renamed: commit.files.filter(f => f.status === 'renamed').map(f => f.filename),
        };
        setCommitFilesData({
          filesByStatus,
          commitHash: commit.hash,
          stats: commit.stats,
        });
      }
    });

    const unsubscribeDeselect = events.on('git-panels.commit:deselected', () => {
      console.log('[PanelContext] Commit deselected, clearing files');
      setCommitFilesData(null);
    });

    return () => {
      unsubscribeLoaded();
      unsubscribeDeselect();
    };
  }, [events]);

  // Track previous color mode for restoring when commit is deselected
  const previousCommitColorModeRef = useRef<string | null>(null);

  // Auto-switch to 'commit' color mode when commit files are loaded
  useEffect(() => {
    if (commitFilesData && commitFilesData.commitHash) {
      const totalFiles = commitFilesData.filesByStatus.added.length +
        commitFilesData.filesByStatus.modified.length +
        commitFilesData.filesByStatus.removed.length +
        commitFilesData.filesByStatus.renamed.length;

      if (totalFiles > 0) {
        // Save current color mode before switching
        if (selectedColorMode !== 'commit') {
          previousCommitColorModeRef.current = selectedColorMode;
        }
        // Switch to commit color mode
        console.log('[PanelContext] Commit files loaded, switching to commit color mode');
        setEnabledColorModes(['commit']);
        setSelectedColorMode('commit');
        // Emit event so File-City can react to commit files change
        events.emit({
          type: 'commitFiles:updated',
          source: 'panel-context',
          timestamp: Date.now(),
          payload: { files: commitFilesData.filesByStatus, commitHash: commitFilesData.commitHash },
        });
      }
    } else if (!commitFilesData && previousCommitColorModeRef.current) {
      // Commit deselected - restore previous color mode
      console.log('[PanelContext] Commit deselected, restoring color mode to:', previousCommitColorModeRef.current);
      setEnabledColorModes([previousCommitColorModeRef.current]);
      setSelectedColorMode(previousCommitColorModeRef.current);
      previousCommitColorModeRef.current = null;
      // Emit event so File-City can clear commit highlights
      events.emit({
        type: 'commitFiles:cleared',
        source: 'panel-context',
        timestamp: Date.now(),
        payload: {},
      });
    }
  }, [commitFilesData, selectedColorMode, events]);

  // Track previous color mode for restoring when storyboard context is cleared
  const previousStoryboardColorModeRef = useRef<string | null>(null);

  // Auto-switch to 'storyboard' color mode when storyboard context has data
  useEffect(() => {
    // Only auto-switch if storyboard context has a storyboard selected
    if (storyboardContextData?.storyboard) {
      // Save current color mode before switching (if not already in storyboard mode)
      if (selectedColorMode !== 'storyboard') {
        previousStoryboardColorModeRef.current = selectedColorMode;
      }
      // Switch to storyboard color mode
      console.log('[PanelContext] Storyboard context loaded, switching to storyboard color mode');
      setEnabledColorModes(['storyboard']);
      setSelectedColorMode('storyboard');
    } else if (previousStoryboardColorModeRef.current !== null && selectedColorMode === 'storyboard') {
      // Storyboard context cleared - restore previous color mode
      console.log('[PanelContext] Storyboard context cleared, restoring color mode to:', previousStoryboardColorModeRef.current);
      setEnabledColorModes([previousStoryboardColorModeRef.current]);
      setSelectedColorMode(previousStoryboardColorModeRef.current);
      previousStoryboardColorModeRef.current = null;
    }
  }, [storyboardContextData, selectedColorMode]);

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

  // Helper to clean file paths for reading (strips GitHub/ and repo prefixes)
  const cleanFilePath = useCallback((filePath: string): string => {
    let cleanPath = filePath;
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
    if (cleanPath.startsWith('GitHub/')) cleanPath = cleanPath.slice('GitHub/'.length);
    if (githubRepo) {
      const repoPrefix = `${githubRepo}/`;
      if (cleanPath.startsWith(repoPrefix)) {
        cleanPath = cleanPath.slice(repoPrefix.length);
      }
    }
    // Also strip local/ prefix for local mode
    if (cleanPath.startsWith('local/')) {
      const parts = cleanPath.split('/');
      parts.shift(); // remove 'local'
      parts.shift(); // remove folder name
      cleanPath = parts.join('/');
    }
    return cleanPath;
  }, [githubRepo]);

  // Helper function to read file - uses VFS (which checks pending layer first, then GitHub)
  const readFileFromGitHub = useCallback(async (relativePath: string): Promise<string> => {
    const cleanPath = cleanFilePath(relativePath);

    // Local mode: read from local filesystem
    if (isLocalMode && localAdapter) {
      return await localAdapter.readFileAsync(cleanPath);
    }

    // GitHub mode: use VFS (checks pending layer first, then fetches from GitHub)
    if (vfsRef.current.isInitialized) {
      return await vfsRef.current.readFile(cleanPath);
    }

    // Fallback to direct API call if VFS not ready
    if (!githubRepo) {
      throw new Error('No GitHub repo specified');
    }

    console.log('[PanelContext] VFS not ready, falling back to direct API call for:', cleanPath);

    const [owner, name] = githubRepo.split('/');

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
  }, [githubRepo, isLocalMode, localAdapter, cleanFilePath]);

  // Determine if user can write to the repo (authenticated or local mode)
  const canWrite = isLocalMode || isAuthenticated;

  // Helper to add a file to the fileTree (optimistic update for new files)
  // This updates BOTH the fileTree state AND the slice synchronously
  // so panels can immediately see newly created files
  const addFileToTree = useCallback((filePath: string) => {
    // Use fileTreeRef for synchronous access to current state
    const prevTree = fileTreeRef.current;
    if (!prevTree) return;

    // Normalize path (remove leading slash if present)
    const normalizedPath = filePath.replace(/^\//, '');

    // Check if file already exists
    if (prevTree.allFiles.some((f) => f.path === normalizedPath)) {
      return; // File already exists, no update needed
    }

    // Build list of new directories that need to be added
    const newDirs: string[] = [];
    const parts = normalizedPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      if (!prevTree.allDirectories.some((d) => d.path === dirPath)) {
        newDirs.push(dirPath);
      }
    }

    // Get file extension
    const fileName = parts[parts.length - 1] || '';
    const dotIndex = fileName.lastIndexOf('.');
    const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

    // Create new file entry (using type assertion - panels only use path/name/extension)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newFile: any = {
      path: normalizedPath,
      name: fileName,
      extension,
      size: 0,
      lastModified: new Date(),
      isDirectory: false,
      relativePath: normalizedPath,
    };

    // Create new directory entries (using type assertion)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newDirEntries: any[] = newDirs.map((dirPath) => ({
      path: dirPath,
      name: dirPath.split('/').pop() || '',
      isDirectory: true,
      relativePath: dirPath,
      children: [],
      fileCount: 0,
      totalSize: 0,
      depth: dirPath.split('/').length,
    }));

    console.log('[PanelContext] Adding file to tree:', normalizedPath);
    if (newDirs.length > 0) {
      console.log('[PanelContext] Adding directories:', newDirs);
    }

    // Build the new tree
    const newTree = {
      ...prevTree,
      allFiles: [...prevTree.allFiles, newFile],
      allDirectories: [...prevTree.allDirectories, ...newDirEntries],
      stats: {
        ...prevTree.stats,
        totalFiles: prevTree.stats.totalFiles + 1,
        totalDirectories: prevTree.stats.totalDirectories + newDirs.length,
      },
    };

    // Update the slice SYNCHRONOUSLY so panels see it immediately
    // This is critical for operations that write then immediately read (like backlog init)
    const fileTreeSlice = slicesRef.current.get('fileTree');
    if (fileTreeSlice) {
      slicesRef.current.set('fileTree', {
        ...fileTreeSlice,
        data: newTree,
      });
    }

    // Also update ref synchronously for subsequent calls in the same tick
    fileTreeRef.current = newTree;

    // Update React state (will trigger re-render for UI updates)
    setFileTree(newTree);
  }, []);

  // Create adapters for panels (e.g., Alexandria docs panel uses these for file reading)
  // Write operations are only available when user is authenticated or in local mode
  const adapters: PanelAdapters = useMemo(() => {
    // writeFile implementation - uses VFS for pending layer management
    const writeFileImpl = async (path: string, content: string): Promise<void> => {
      const cleanPath = cleanFilePath(path);

      // Local mode: write directly to filesystem
      if (isLocalMode && localAdapter) {
        await localAdapter.writeFileAsync(cleanPath, content);
        // Update fileTree with the new file
        addFileToTree(cleanPath);
        return;
      }

      // GitHub mode: use VFS (writes to pending layer)
      if (vfsRef.current.isInitialized) {
        await vfsRef.current.writeFile(cleanPath, content);
        // Update fileTree with the new file (optimistic update)
        addFileToTree(cleanPath);

        // Emit event to notify listeners (e.g., for UI updates)
        events.emit({
          type: 'file:write-complete',
          source: 'panel-context',
          timestamp: Date.now(),
          payload: { path: cleanPath, success: true },
        });
        return;
      }

      // Fallback to event-based system if VFS not ready
      console.log('[PanelContext] VFS not ready, falling back to event-based write for:', cleanPath);
      return new Promise((resolve, reject) => {
        // Set up one-time listener for the response
        const cleanup = events.on('file:write-complete', (event) => {
          const payload = event.payload as { path: string; success: boolean; error?: string };
          if (payload.path === cleanPath) {
            cleanup();
            if (payload.success) {
              // Update fileTree with the new file (optimistic update)
              addFileToTree(cleanPath);
              resolve();
            } else {
              reject(new Error(payload.error || 'Failed to write file'));
            }
          }
        });

        // Emit the write request
        events.emit({
          type: 'file:write-requested',
          source: 'panel-context',
          timestamp: Date.now(),
          payload: { path: cleanPath, content },
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          cleanup();
          reject(new Error('Write operation timed out'));
        }, 30000);
      });
    };

    // createDir is a no-op for GitHub since directories are implicit
    const createDirImpl = async (_path: string): Promise<void> => {
      // GitHub doesn't need explicit directory creation
      // Directories are created implicitly when files are added
      return;
    };

    // Build fileSystem adapter - only include write operations if user can write
    const fileSystem: PanelAdapters['fileSystem'] = canWrite
      ? {
          exists: async (path: string): Promise<boolean> => {
            try {
              await readFileFromGitHub(path);
              return true;
            } catch {
              return false;
            }
          },
          readFile: readFileFromGitHub,
          writeFile: writeFileImpl,
          createDir: createDirImpl,
          deleteFile: async (_path: string): Promise<void> => {
            throw new Error('Delete operations not supported in web-ade viewer mode');
          },
        }
      : {
          // Read-only mode for unauthenticated users
          exists: async (path: string): Promise<boolean> => {
            try {
              await readFileFromGitHub(path);
              return true;
            } catch {
              return false;
            }
          },
          readFile: readFileFromGitHub,
          writeFile: async (_path: string, _content: string): Promise<void> => {
            throw new Error('Write operations require authentication');
          },
          deleteFile: async (_path: string): Promise<void> => {
            throw new Error('Delete operations not supported');
          },
        };

    return {
      // readFile fetches file content from GitHub API (legacy adapter)
      readFile: readFileFromGitHub,
      // matchesPath uses minimatch for glob pattern matching
      matchesPath: (pattern: string, filePath: string): boolean => {
        return minimatch(filePath, pattern);
      },
      // fileSystem adapter with conditional write support
      fileSystem,
    };
  }, [readFileFromGitHub, isLocalMode, localAdapter, cleanFilePath, events, canWrite, addFileToTree]);

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
    [workspace, repository, refresh, githubRepo, adapters, fileTreeLoading, codebaseViewsLoading, markdownLoading, markdownContent, activeFilePath, fileTree, codebaseViews, isAuthenticated, githubRepos, githubReposLoading, userGitHubData, userGitHubLoading, qualityData, qualityLoading, qualityError, lensResults, enabledColorModes, selectedColorMode, presenceSessions, presenceLoading, presenceConnected, packagesData, packagesLoading, packagesError, ownerRepos, ownerReposLoading, collectionId, collectionRepoDetails, collectionRepoDetailsLoading, messagesData]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: async (filePath: string) => {
        const cleanPath = cleanFilePath(filePath);
        console.log('Opening file:', cleanPath, isLocalMode ? '(local mode)' : '(GitHub mode)');

        // Check if file exists in the fileTree (unless it's a new file in VFS pending layer)
        const fileExistsInTree = fileTreeRef.current?.allFiles?.some(f => f.path === cleanPath);
        const fileExistsInVFS = vfsRef.current?.hasPendingChange(cleanPath);

        if (!fileExistsInTree && !fileExistsInVFS) {
          console.warn('File not found in repository:', cleanPath);

          // Update activeFilePath so panels know which file was requested
          setActiveFilePath(cleanPath);

          // Update the active-file slice with error state
          const activeFileSlice = slicesRef.current.get('active-file');
          if (activeFileSlice) {
            slicesRef.current.set('active-file', {
              ...activeFileSlice,
              data: { path: cleanPath, content: null, error: 'File not found' },
              loading: false,
              error: new Error(`File not found: ${cleanPath}`),
            });
          }

          // Emit file:not-found event
          events.emit({
            type: 'file:not-found',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: { path: cleanPath },
          });

          throw new Error(`File not found: ${cleanPath}`);
        }

        try {
          // Use readFileFromGitHub which handles VFS (checks pending layer first)
          const content = await readFileFromGitHub(cleanPath);

          // Always update activeFilePath so FileEditorPanel and other panels know which file is active
          setActiveFilePath(cleanPath);

          // Determine file type for the slice data
          const isMarkdown = /\.(md|mdx|markdown)$/i.test(cleanPath);
          const [owner, name] = (githubRepo || '').split('/');

          // Build active file data structure
          const activeFileData = {
            path: cleanPath,
            content: content,
            type: isMarkdown ? 'markdown' : 'code',
            size: content.length,
            lastModified: new Date(),
            encoding: 'utf-8',
            source: isLocalMode ? {
              type: 'local' as const,
              provider: 'filesystem',
              location: cleanPath,
            } : {
              type: 'remote' as const,
              provider: 'github',
              owner,
              name,
              branch: 'main',
              location: cleanPath,
              url: `https://github.com/${githubRepo}/blob/main/${cleanPath}`,
            },
          };

          // Update the active-file slice for ALL file types
          const activeFileSlice = slicesRef.current.get('active-file');
          if (activeFileSlice) {
            slicesRef.current.set('active-file', {
              ...activeFileSlice,
              data: activeFileData,
              loading: false,
              error: null,
            });
          }

          // Emit file:opened event for all file types
          events.emit({
            type: 'file:opened',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: activeFileData,
          });

          // If this is a markdown file, also update markdownContent
          // so the markdown panel displays the new file
          if (isMarkdown) {
            // Clear any previous error (e.g., from failed README fetch) so the slice
            // update during re-render doesn't overwrite our error: null with stale error state
            setMarkdownError(null);
            setMarkdownContent(content);
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
      readFile: async (filePath: string): Promise<string> => {
        const cleanPath = cleanFilePath(filePath);
        console.log('[PanelContext] Reading file:', cleanPath, isLocalMode ? '(local mode)' : '(GitHub mode)');

        try {
          // Use readFileFromGitHub which handles VFS (checks pending layer first)
          return await readFileFromGitHub(cleanPath);
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
      fetchAudioUrls: async (context: { owner: string; repo: string; path: string; commitSha: string }) => {
        try {
          const response = await fetch('/api/tts/batch-generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(context),
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch audio URLs: ${response.statusText}`);
          }

          const data = await response.json();

          // Convert array of steps to Map<stepId, audioUrl>
          // Only include URLs where status='ready' (cached files that exist)
          const urls = new Map<string, string>();
          data.steps.forEach((step: { stepId: string; audioUrl: string; status: 'ready' | 'generating' }) => {
            if (step.status === 'ready') {
              urls.set(step.stepId, step.audioUrl);
            }
          });

          return urls;
        } catch (error) {
          console.error('[PanelContext] Error fetching audio URLs:', error);
          throw error;
        }
      },
    }),
    [events, githubRepo, isLocalMode, localAdapter, cleanFilePath, readFileFromGitHub]
  );

  // Clear color mode selection (for header clear button)
  const clearColorMode = useCallback(() => {
    console.log('[PanelContext] Clearing color mode selection');
    setEnabledColorModes([]);
    setSelectedColorMode(null);
    // Also clear underlying data to prevent useEffect from re-enabling
    setCommitFilesData(null);
    setStoryboardContextData(null);
    // Clear the refs so we don't try to restore old state
    previousCommitColorModeRef.current = null;
    previousStoryboardColorModeRef.current = null;
    // Emit events so visualizations can react
    events.emit({
      type: 'commitFiles:cleared',
      source: 'panel-context',
      timestamp: Date.now(),
      payload: {},
    });
    events.emit({
      type: 'storyboardContext:cleared',
      source: 'panel-context',
      timestamp: Date.now(),
      payload: {},
    });
  }, [events]);

  const value: PanelProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
      presenceConnected,
      selectedColorMode,
      clearColorMode,
    }),
    [context, actions, events, presenceConnected, selectedColorMode, clearColorMode]
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

    // Reset feed project data to avoid showing stale repo info
    setFeedProjectData(null);

    // Fetch independent data in parallel
    fetchReadme(githubRepo);
    fetchCodebaseViews(githubRepo);
    fetchPackages(githubRepo);
    fetchCommits(githubRepo);
    fetchFeedProject(githubRepo);

    // Sequence tree → quality metrics to reuse SHA (saves GitHub API calls)
    // Tree fetch resolves commit SHA, which is then used for quality metrics caching
    const fetchTreeThenQuality = async () => {
      const commitSha = await fetchFileTree(githubRepo);
      // Pass SHA to quality metrics for better caching (action=commit vs action=latest)
      // If tree fetch failed, quality metrics falls back to action=latest
      fetchQualityMetrics(githubRepo, commitSha ?? undefined);
    };
    fetchTreeThenQuality();
  }, [githubRepo, fetchReadme, fetchCodebaseViews, fetchFileTree, fetchQualityMetrics, fetchPackages, fetchCommits, fetchFeedProject]);

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
        // Only enable the selected mode (replace, don't accumulate)
        setEnabledColorModes([colorMode]);
        // Set as the currently selected mode (File City will read this from the slice)
        setSelectedColorMode(colorMode);
      }
    });

    return () => {
      unsubColorMode();
    };
  }, [events]);

  // Listen for storyboard context update events from EditorLayout
  useEffect(() => {
    const unsubStoryboard = events.on<StoryboardContextSliceData | null>('storyboard:context:update', (event) => {
      console.log('[PanelContext] Received storyboard:context:update:', event.payload);
      setStoryboardContextData(event.payload);
    });

    return () => {
      unsubStoryboard();
    };
  }, [events]);

  // Fetch collection repository details when collectionRepositories prop is provided
  useEffect(() => {
    if (collectionRepositories && collectionRepositories.length > 0) {
      fetchCollectionRepoDetails(collectionRepositories);
    } else if (collectionRepositories && collectionRepositories.length === 0) {
      // Clear the slice when collection is empty
      setCollectionRepoDetails([]);
      setCollectionRepoDetailsLoading(false);
    }
  }, [collectionRepositories, fetchCollectionRepoDetails]);

  // Fetch user GitHub data (starred, owned, orgs) when on collections pages
  useEffect(() => {
    if (collectionId) {
      fetchUserGitHubData();
    }
  }, [collectionId, fetchUserGitHubData]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelProvider() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelProvider must be used within PanelProvider');
  }
  return context;
}
