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
} from '@principal-ade/panel-framework-core';
import { layoutTools } from '@principal-ade/utcp-panel-event';
import type { ExtendedMarkdownFile } from '@industry-theme/alexandria-docs-panel/dist/types';
import type { CodebaseView } from '@principal-ai/alexandria-core-library/types';
import { useAuth } from './AuthContext';

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
  version?: string;
  metrics: QualityMetrics;
}

interface QualitySliceData {
  packages: PackageQuality[];
  lastUpdated: string;
  commitSha?: string;
  branch?: string;
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

export function PanelProvider({ children, workspace, repository, githubRepo }: PanelProviderProps) {
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

  // Fetch quality metrics from GitHub Actions artifacts
  const fetchQualityMetrics = useCallback(async (repo: string) => {
    if (!isAuthenticated) {
      setQualityData(null);
      return;
    }

    setQualityLoading(true);
    setQualityError(null);
    console.log('[PanelContext] Fetching quality metrics for:', repo);

    try {
      const [owner, name] = repo.split('/');

      const response = await fetch(
        `/api/github/repo/${owner}/${name}/quality-artifacts?action=latest`,
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
      const qualitySliceData: QualitySliceData = {
        packages: [
          {
            name: repo,
            metrics: data.qualityMetrics.hexagon,
          },
        ],
        lastUpdated: data.timestamp,
        commitSha: data.commitSha,
        branch: data.branch,
      };

      setQualityData(qualitySliceData);
      console.log('[PanelContext] Quality metrics loaded:', qualitySliceData);
    } catch (err) {
      console.error('[PanelContext] Failed to fetch quality metrics:', err);
      setQualityError(err instanceof Error ? err : new Error('Failed to load quality metrics'));
    } finally {
      setQualityLoading(false);
    }
  }, [isAuthenticated]);

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
              await fetchQualityMetrics(githubRepo);
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
    [workspace, repository, refresh, githubRepo, markdownFilesLoading, fileTreeLoading, codebaseViewsLoading, markdownLoading, markdownContent, activeFilePath, markdownFiles, fileTree, codebaseViews, isAuthenticated, githubRepos, githubReposLoading, qualityData, qualityLoading, qualityError]
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
    }),
    [context, actions, events]
  );

  // Track previous loading state to detect transitions
  const prevCodebaseViewsLoadingRef = useRef<boolean>(true);
  const currentRepoRef = useRef<string>('');
  const markdownFilesFetchedRef = useRef<boolean>(false);

  // Fetch GitHub repositories when authentication state changes
  useEffect(() => {
    fetchGithubRepos();
  }, [fetchGithubRepos]);

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
    fetchQualityMetrics(githubRepo);

    // Fetch codebase views - markdown files will be fetched by the secondary effect
    fetchCodebaseViews(githubRepo);
  }, [githubRepo, fetchReadme, fetchCodebaseViews, fetchFileTree, fetchQualityMetrics]);

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
