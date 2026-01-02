'use client';

import {
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
  EditableConfigurablePanelLayout,
  AgentCommandPalette,
  useAgentCommandPalette,
} from '@principal-ade/panel-layouts';
import { globalPanelRegistry } from '@principal-ade/panel-framework-core';
import { useTheme } from '@principal-ade/industry-theme';
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';
import { WebLLMProvider } from '@/contexts/WebLLMContext';
import { GeminiProvider } from '@/contexts/GeminiContext';
import { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { EditorHeader } from './EditorHeader';
import { SessionsPanel } from './SessionsPanel';
import { AccessNotice, AccessStatus } from './AccessNotice';
import { RepoSelectionModal } from './RepoSelectionModal';
import { CommitModal } from './CommitModal';
import { LayoutSidebar } from './LayoutSidebar';
import { layoutConfigs, LayoutConfig } from './LayoutConfigDropdown';
import { AIChatPanel } from './AIChatPanel';
import { PendingChangesProvider, usePendingChanges } from '@/contexts/PendingChangesContext';
import { useVFS } from '@/contexts/VFSContext';
import '@principal-ade/panel-layouts/styles.css';
import '@principal-ade/industry-themed-ai-sdk-panel/styles.css';
// CSS removed from principal-view-panels exports - styles now bundled in JS
import { useAuth } from '@/contexts/AuthContext';
import { useGemini } from '@/contexts/GeminiContext';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import { useNavigationCommands } from '@/hooks/useNavigationCommands';
import type { Theme } from '@principal-ade/industry-theme';
import type { LocalFileSystemAdapter } from '@/lib/client/LocalFileSystemAdapter';
import { useLocalFileSystem } from '@/contexts/LocalFileSystemContext';

// Dynamically import the MarkdownPanel with SSR disabled
const MarkdownPanelLoader = dynamic(
  () => import('@industry-theme/markdown-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the AlexandriaDocsPanel with SSR disabled
const AlexandriaDocsPanelLoader = dynamic(
  () => import('@industry-theme/alexandria-docs-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the FileCityPanel with SSR disabled
const FileCityPanelLoader = dynamic(
  () => import('@industry-theme/file-city-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the KanbanPanel with SSR disabled
const KanbanPanelLoader = dynamic(
  () => import('@industry-theme/backlogmd-kanban-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the TaskDetailPanel with SSR disabled
const TaskDetailPanelLoader = dynamic(
  () => import('@industry-theme/backlogmd-kanban-panel').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the PrincipalViewPanel (Graph) with SSR disabled
const PrincipalViewPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the TraceViewerPanel with SSR disabled
const TraceViewerPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the QualityHexagonPanel with SSR disabled
const QualityHexagonPanelLoader = dynamic(
  () => import('@principal-ade/code-quality-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the LensDataDebugPanel with SSR disabled
const LensDataDebugPanelLoader = dynamic(
  () => import('@principal-ade/code-quality-panels').then((mod) => {
    const Component = mod.panels[2]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the EventBusPanel with SSR disabled
const EventBusPanelLoader = dynamic(
  () => import('@industry-theme/agent-driven-ui-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the AgentToolsPanel with SSR disabled
const AgentToolsPanelLoader = dynamic(
  () => import('@industry-theme/agent-driven-ui-panels').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitChangesPanel with SSR disabled
const GitChangesPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the PackageCompositionPanel with SSR disabled
const PackageCompositionPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the TelemetryCoveragePanel with SSR disabled
const TelemetryCoveragePanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.TelemetryCoveragePanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// Dynamically import the GitCommitHistoryPanel with SSR disabled
const GitCommitHistoryPanelLoader = dynamic(
  () => import('@industry-theme/git-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitCommitDetailPanel with SSR disabled
const GitCommitDetailPanelLoader = dynamic(
  () => import('@industry-theme/git-panels').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitPullRequestsPanel with SSR disabled
const GitPullRequestsPanelLoader = dynamic(
  () => import('@industry-theme/git-panels').then((mod) => {
    const Component = mod.panels[2]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitPullRequestDetailPanel with SSR disabled
const GitPullRequestDetailPanelLoader = dynamic(
  () => import('@industry-theme/git-panels').then((mod) => {
    const Component = mod.panels[3]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitHubIssuesPanel with SSR disabled
const GitHubIssuesPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[2]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitHubIssueDetailPanel with SSR disabled
const GitHubIssueDetailPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[3]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitHubMessagesPanel with SSR disabled
const GitHubMessagesPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[6]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the ThemeEditorPanel with SSR disabled
const ThemeEditorPanelLoader = dynamic(
  () => import('@industry-theme/theme-editor-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the FileEditorPanel with SSR disabled
const FileEditorPanelLoader = dynamic(
  () => import('@industry-theme/file-editing-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitDiffPanel with SSR disabled
const GitDiffPanelLoader = dynamic(
  () => import('@industry-theme/file-editing-panels').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the MDXEditorPanel with SSR disabled
const MDXEditorPanelLoader = dynamic(
  () => import('@industry-theme/file-editing-panels').then((mod) => {
    const Component = mod.panels[2]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

interface EditorLayoutContentProps {
  layout: PanelLayout;
  setLayout: React.Dispatch<React.SetStateAction<PanelLayout>>;
  leftSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  currentLayoutConfigId: string;
  onLayoutConfigIdChange: (configId: string) => void;
}

function EditorLayoutContent({
  layout,
  setLayout,
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  rightSidebarCollapsed,
  setRightSidebarCollapsed,
  currentLayoutConfigId,
  onLayoutConfigIdChange,
}: EditorLayoutContentProps) {
  const { theme } = useTheme();
  const { context, actions, events, selectedColorMode, clearColorMode } = usePanelProvider();

  // Count triaged items from fileTree (files in backlog/tasks/)
  const fileTreeSlice = context.getSlice<{ allFiles?: Array<{ path: string }> }>('fileTree');
  const triagedCount = useMemo(() => {
    const allFiles = fileTreeSlice?.data?.allFiles;
    if (!allFiles) return 0;
    return allFiles.filter((file) => file.path.includes('backlog/tasks/')).length;
  }, [fileTreeSlice?.data?.allFiles]);

  const { login } = useAuth();
  const { setTheme, setColor, resetColor, resetAllColors } = useGlobalTheme();
  const { adapter: localAdapter } = useLocalFileSystem();
  const isLocalMode = !!localAdapter;
  const [isMobile, setIsMobile] = useState(false);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  // Note: File selection state is managed internally by FileEditorPanel via events
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [vimMode, setVimMode] = useState(() => {
    // Initialize from localStorage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('editor-preferences');
        if (saved) {
          const prefs = JSON.parse(saved);
          return prefs.vimMode ?? false;
        }
      } catch {
        // Ignore parse errors
      }
    }
    return false;
  });
  const [layoutSidebarCollapsed, setLayoutSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('layout-sidebar-collapsed');
        return saved ? JSON.parse(saved) : false;
      } catch {
        return false;
      }
    }
    return false;
  });
  const [repoCounts, setRepoCounts] = useState<{ openIssues: number; openPullRequests: number } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Persist layout sidebar collapsed state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('layout-sidebar-collapsed', JSON.stringify(layoutSidebarCollapsed));
    }
  }, [layoutSidebarCollapsed]);

  // Get pending changes for commit functionality (legacy - used as fallback)
  const {
    pendingChanges,
    pendingChangesCount: legacyPendingChangesCount,
    removePendingChange,
    getPendingChangesArray: getLegacyPendingChangesArray,
    setFileMetadata,
    addPendingChangeFromWrite,
    addNewFilePendingChange,
  } = usePendingChanges();

  // Get VFS for pending changes (new - preferred when available)
  const vfs = useVFS();

  // Use VFS pending changes when available, otherwise fall back to legacy context
  const effectivePendingChangesCount = vfs.isInitialized
    ? (vfs.stats?.pendingCount ?? 0)
    : legacyPendingChangesCount;

  const getEffectivePendingChangesArray = useCallback(() => {
    if (vfs.isInitialized) {
      // Convert VFS PendingFile to legacy format for CommitModal
      return vfs.getPendingChanges().map(pf => ({
        path: pf.path,
        originalContent: '', // VFS doesn't track original content separately
        newContent: pf.content,
        sha: pf.originalSha,
        modifiedAt: pf.modifiedAt,
        isNewFile: pf.isNewFile,
      }));
    }
    return getLegacyPendingChangesArray();
  }, [vfs, getLegacyPendingChangesArray]);

  // Get repository info for file fetching
  const githubRepo = (context.currentScope.repository as { githubRepo?: string })?.githubRepo
    || context.currentScope.repository?.path;

  // Fetch PR and issue counts for sidebar badges
  useEffect(() => {
    if (!githubRepo || !githubRepo.includes('/')) {
      setRepoCounts(null);
      return;
    }

    const [owner, name] = githubRepo.split('/');
    const controller = new AbortController();

    fetch(`/api/github/repo/${owner}/${name}?action=counts`, {
      signal: controller.signal,
      credentials: 'include',
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.ok) {
          const data = await response.json();
          setRepoCounts(data);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('[EditorLayout] Failed to fetch repo counts:', error);
      });

    return () => controller.abort();
  }, [githubRepo]);

  // Handle layout configuration change
  const handleLayoutConfigChange = useCallback((config: LayoutConfig) => {
    onLayoutConfigIdChange(config.id);
    setLayout(config.layout);
    setLeftSidebarCollapsed(config.collapsed.left);
    setRightSidebarCollapsed(config.collapsed.right);
  }, [onLayoutConfigIdChange, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed]);

  // Handle vim mode toggle
  const handleVimModeToggle = useCallback(() => {
    setVimMode((prev: boolean) => {
      const newValue = !prev;
      // Emit event to update preferences slice
      events.emit({
        type: 'preferences:update',
        source: 'editor-layout',
        timestamp: Date.now(),
        payload: { vimMode: newValue },
      });
      return newValue;
    });
  }, [events]);

  // Handle commit of pending changes
  const handleCommit = useCallback(async (message: string, selectedPaths: string[]) => {
    if (!githubRepo || !githubRepo.includes('/')) {
      throw new Error('No valid repository available');
    }

    const [owner, name] = githubRepo.split('/');

    // Get files to commit from VFS or legacy pending changes
    let filesToCommit: Array<{ path: string; content: string; sha?: string }>;

    if (vfs.isInitialized) {
      // Use VFS pending changes
      const vfsPending = vfs.getPendingChanges();
      filesToCommit = selectedPaths
        .map(path => {
          const pf = vfsPending.find(p => p.path === path);
          if (!pf) return null;
          return {
            path: pf.path,
            content: pf.content,
            sha: pf.originalSha,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);
    } else {
      // Fallback to legacy pending changes
      filesToCommit = selectedPaths
        .map(path => pendingChanges.get(path))
        .filter((change): change is NonNullable<typeof change> => change !== undefined)
        .map(f => ({
          path: f.path,
          content: f.newContent,
          sha: f.sha,
        }));
    }

    if (filesToCommit.length === 0) {
      throw new Error('No files selected for commit');
    }

    const response = await fetch(`/api/github/repo/${owner}/${name}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: filesToCommit,
        message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.details || 'Failed to commit changes');
    }

    // Clear the committed files from pending changes
    if (vfs.isInitialized) {
      vfs.clearPendingChanges(selectedPaths);
    } else {
      selectedPaths.forEach(path => removePendingChange(path));
    }

    // Emit commit:complete event for other panels to react
    events.emit({
      type: 'commit:complete',
      source: 'web-ade',
      timestamp: Date.now(),
      payload: await response.json(),
    });
  }, [githubRepo, pendingChanges, removePendingChange, events, vfs]);

  // Initialize Agent Command Palette (AI-driven, Cmd+Shift+P to open)
  const { sendMessage } = useGemini();

  // Get navigation commands from shared hook
  const { quickCommands: navigationCommands, handleExecuteTool: handleNavigationCommand } = useNavigationCommands();

  const agentPalette = useAgentCommandPalette({
    events,
    keyboard: { key: 'p', metaKey: true, shiftKey: true, altKey: false },
    config: {
      placeholder: 'What would you like to do?',
      autoCloseDelay: 2000,
    },
    initialSuggestions: [
      'hide the sidebars',
      'show the AI chat panel',
      'switch to kanban view',
      '/repo',
      '/login',
    ],
    quickCommands: navigationCommands,
    onExecuteTool: handleNavigationCommand,
  });

  // Wire Agent Command Palette to Gemini for natural language processing
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      // Handle submit - send to Gemini
      events.on('agent-command-palette:submit', (event) => {
        const payload = event.payload as { query: string; mode: string };

        // Only handle natural language mode - quick commands are handled internally
        if (payload.mode === 'natural' && payload.query) {
          // Send to Gemini - it will execute tools via the existing executeFunctionCall
          sendMessage(payload.query);
        }
      }),

      // Handle Gemini completion - update palette status
      events.on('gemini:message-complete', () => {
        if (agentPalette.isOpen) {
          agentPalette.setStatus('complete');
          agentPalette.setAgentResponse('Done');
        }
      }),

      // Handle Gemini error - update palette status
      events.on('gemini:error', (event) => {
        if (agentPalette.isOpen) {
          const payload = event.payload as { error?: string };
          agentPalette.setStatus('error');
          agentPalette.setAgentResponse(payload.error || 'An error occurred');
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, sendMessage, agentPalette]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle file:write-requested events from PanelContext's fileSystem adapter
  // This enables features like backlog init to create new files
  useEffect(() => {
    if (!events) return;

    const unsubscribe = events.on('file:write-requested', (event) => {
      const { path, content } = event.payload as { path: string; content: string };

      try {
        // Add to pending changes as a new file
        addNewFilePendingChange(path, content);

        // Emit success response
        events.emit({
          type: 'file:write-complete',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: { path, success: true },
        });

        console.log('[EditorLayout] Added new file to pending changes:', path);
      } catch (error) {
        // Emit error response
        events.emit({
          type: 'file:write-complete',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: {
            path,
            success: false,
            error: error instanceof Error ? error.message : 'Failed to write file',
          },
        });
      }
    });

    return () => unsubscribe();
  }, [events, addNewFilePendingChange]);

  // Listen for command palette events
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      events.on('panel:toggle', (event) => {
        // Support both 'panel' (UTCP standard) and 'panelId' (legacy) payload formats
        const payload = event.payload as { panel?: string; panelId?: string };
        const panelId = payload.panel || payload.panelId;
        if (panelId === 'left') {
          setLeftSidebarCollapsed((prev) => !prev);
        } else if (panelId === 'right') {
          setRightSidebarCollapsed((prev) => !prev);
        }
      }),
      events.on('panel:collapse-all', () => {
        setLeftSidebarCollapsed(true);
        setRightSidebarCollapsed(true);
      }),
      events.on('panel:expand-all', () => {
        setLeftSidebarCollapsed(false);
        setRightSidebarCollapsed(false);
      }),
      events.on('panel:reset-layout', () => {
        setLayout({
          left: 'docs',
          middle: 'markdown-viewer',
          right: 'file-city',
        });
        setLeftSidebarCollapsed(false);
        setRightSidebarCollapsed(false);
      }),
      events.on('repository:open-switcher', () => {
        setIsRepoModalOpen(true);
      }),
      events.on('repository:selected', (event) => {
        const payload = event.payload as { repository: { full_name: string } };
        if (payload?.repository?.full_name) {
          // Navigate to the selected repository's editor
          window.location.href = `/${payload.repository.full_name}`;
        }
      }),
      events.on('repository:preview', (event) => {
        const payload = event.payload as { repository: { full_name: string; owner: { login: string }; name: string } };
        if (payload?.repository?.full_name) {
          const parts = payload.repository.full_name.split('/');
          const owner = parts[0];
          const repo = parts[1];
          if (owner && repo) {
            // Call the previewReadme action
            (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(owner, repo);
            // Switch the right panel to markdown-viewer to show the preview
            setLayout((prev) => ({
              ...prev,
              right: 'markdown-viewer',
            }));
            setRightSidebarCollapsed(false);
          }
        }
      }),
      events.on('github:login-requested', () => {
        login();
      }),
      events.on('panel:switch', (event) => {
        const payload = event.payload as { slot?: string; panel?: string };
        if (payload.slot && payload.panel) {
          setLayout((prev) => ({
            ...prev,
            [payload.slot as 'left' | 'middle' | 'right']: payload.panel,
          }));
          // Also expand the panel if it's collapsed
          if (payload.slot === 'left') {
            setLeftSidebarCollapsed(false);
          } else if (payload.slot === 'right') {
            setRightSidebarCollapsed(false);
          }
        }
      }),
      // State query tools - respond with current layout visibility
      events.on('panel:get-visibility', (event) => {
        const payload = event.payload as { respond?: (state: unknown) => void };
        const visibilityState = {
          left: {
            panelId: layout.left,
            collapsed: leftSidebarCollapsed,
          },
          middle: {
            panelId: layout.middle,
          },
          right: {
            panelId: layout.right,
            collapsed: rightSidebarCollapsed,
          },
          workspaceId: null, // No workspace system in web-ade yet
        };
        // If there's a respond callback, call it
        if (payload?.respond) {
          payload.respond(visibilityState);
        }
        // Also emit a response event for async listeners
        events.emit({
          type: 'panel:visibility-response',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: visibilityState,
        });
      }),
      // Get state from a specific panel
      events.on('panel:get-state', (event) => {
        const payload = event.payload as { panelId?: string; respond?: (state: unknown) => void };
        const panelId = payload.panelId;

        if (!panelId) {
          const errorResponse = { panelId: null, hasState: false, error: 'No panelId provided' };
          if (payload.respond) payload.respond(errorResponse);
          events.emit({
            type: 'panel:state-response',
            source: 'editor-layout',
            timestamp: Date.now(),
            payload: errorResponse,
          });
          return;
        }

        const state = globalPanelRegistry.getPanelState(panelId);
        const response = {
          panelId,
          hasState: state !== null,
          state: state ?? undefined,
        };

        if (payload.respond) payload.respond(response);
        events.emit({
          type: 'panel:state-response',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: response,
        });
      }),
      // List all panels that support state queries
      events.on('panel:list-state-panels', (event) => {
        const payload = event.payload as { respond?: (state: unknown) => void };
        const panelIds = globalPanelRegistry.getPanelsWithState();
        const panels = panelIds.map((id) => {
          const entry = globalPanelRegistry.getAllLoaded().find((p) => p.id === id);
          return {
            panelId: id,
            name: entry?.metadata.name ?? id,
            description: entry?.stateSchema?.description,
          };
        });

        const response = { panels };
        if (payload.respond) payload.respond(response);
        events.emit({
          type: 'panel:state-panels-response',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: response,
        });
      }),
      // Theme editor events - live theme color updates
      events.on('theme:set-color', (event) => {
        const payload = event.payload as { colorKey: keyof Theme['colors']; value: string };
        if (payload.colorKey && payload.value) {
          setColor(payload.colorKey, payload.value);
        }
      }),
      events.on('theme:reset-color', (event) => {
        const payload = event.payload as { colorKey: keyof Theme['colors'] };
        if (payload.colorKey) {
          resetColor(payload.colorKey);
        }
      }),
      events.on('theme:reset-all-colors', () => {
        resetAllColors();
      }),
      // Handle preset selection from theme editor panel
      events.on('theme:set-preset', (event) => {
        const payload = event.payload as { presetName?: string; presetLabel?: string };
        if (payload.presetLabel) {
          // Map preset labels to GlobalThemeContext theme names
          const labelToThemeName: Record<string, string> = {
            'Terminal': 'Terminal',
            'Regal': 'Regal',
            'Matrix': 'Matrix',
            'Matrix Minimal': 'Matrix Minimal',
            'Slate': 'Slate',
            'Landing Page': 'Landing Page',
            'Landing Light': 'Landing Page Light',
          };
          const themeName = labelToThemeName[payload.presetLabel];
          if (themeName) {
            setTheme(themeName as import('@/contexts/ThemeContext').ThemeName);
          }
        }
      }),
      // File editor events - switch to file-editor panel when file is opened
      events.on('file:open', (event) => {
        const payload = event.payload as { path?: string; filePath?: string };
        const filePath = payload.path || payload.filePath;
        if (filePath) {
          // If the file-editor panel is not currently visible, switch to it
          if (layout.middle !== 'file-editor') {
            setLayout((prev) => ({
              ...prev,
              middle: 'file-editor',
            }));
          }
        }
      }),
      // Listen for source click events from the architecture panel
      events.on('custom', (event) => {
        const payload = event.payload as { action?: string; nodeId?: string; source?: string };
        if (payload?.action === 'sourceClick' && payload.source) {
          const sourcePath = payload.source;
          console.log('[EditorLayout] Source clicked:', sourcePath, 'on node:', payload.nodeId);

          // Helper to emit file:open event
          const emitFileOpen = (path: string) => {
            events.emit({
              type: 'file:open',
              source: 'editor-layout',
              timestamp: Date.now(),
              payload: { path },
            });
          };

          // If it's a direct file path (has extension, no glob), open it
          if (/\.[a-z]+$/i.test(sourcePath) && !sourcePath.includes('*')) {
            emitFileOpen(sourcePath);
          } else {
            // For glob patterns, try to find an index file or just log
            const basePath = sourcePath
              .replace(/\*\*\//g, '')
              .replace(/\*\.[a-z]+$/i, '')
              .replace(/\*$/g, '');
            if (basePath) {
              // Try common entry points
              const indexPath = basePath.endsWith('/') ? basePath + 'index.ts' : basePath + '/index.ts';
              emitFileOpen(indexPath);
            }
          }
        }
      }),
      // Markdown panel preference events
      events.on('markdown-panel:request-preferences', () => {
        try {
          const savedPrefs = localStorage.getItem('markdown-panel-preferences');
          if (savedPrefs) {
            const prefs = JSON.parse(savedPrefs);
            events.emit({
              type: 'markdown-panel:set-preferences',
              source: 'editor-layout',
              timestamp: Date.now(),
              payload: prefs,
            });
          }
        } catch (err) {
          console.warn('[EditorLayout] Failed to load markdown panel preferences:', err);
        }
      }),
      events.on('markdown-panel:view-mode-change', (event) => {
        const payload = event.payload as { viewMode: 'document' | 'book' };
        try {
          const savedPrefs = localStorage.getItem('markdown-panel-preferences');
          const prefs = savedPrefs ? JSON.parse(savedPrefs) : {};
          prefs.viewMode = payload.viewMode;
          localStorage.setItem('markdown-panel-preferences', JSON.stringify(prefs));
        } catch (err) {
          console.warn('[EditorLayout] Failed to save markdown panel view mode:', err);
        }
      }),
      events.on('markdown-panel:font-scale-change', (event) => {
        const payload = event.payload as { fontSizeScale: number };
        try {
          const savedPrefs = localStorage.getItem('markdown-panel-preferences');
          const prefs = savedPrefs ? JSON.parse(savedPrefs) : {};
          prefs.fontSizeScale = payload.fontSizeScale;
          localStorage.setItem('markdown-panel-preferences', JSON.stringify(prefs));
        } catch (err) {
          console.warn('[EditorLayout] Failed to save markdown panel font scale:', err);
        }
      }),
      // Git commit detail - fetch full commit info when a commit is selected
      events.on('git-panels.commit:selected', async (event) => {
        const payload = event.payload as { hash: string };
        if (!payload?.hash || !githubRepo || !githubRepo.includes('/')) {
          return;
        }

        const [owner, name] = githubRepo.split('/');
        const hash = payload.hash;

        // Notify panel that we're loading
        events.emit({
          type: 'git-panels.commit-detail:loading',
          source: 'web-ade',
          timestamp: Date.now(),
          payload: { hash },
        });

        try {
          const response = await fetch(
            `/api/github/repo/${owner}/${name}/commits/${hash}`,
            { credentials: 'include' }
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch commit: ${response.statusText}`);
          }

          const data = await response.json();

          // Transform GitHub API response to GitCommitDetail format
          const commitDetail = {
            hash: data.sha,
            message: data.commit.message,
            author: data.commit.author.name,
            authorEmail: data.commit.author.email,
            date: data.commit.author.date,
            htmlUrl: data.html_url,
            stats: data.stats ? {
              total: data.stats.total,
              additions: data.stats.additions,
              deletions: data.stats.deletions,
            } : undefined,
            files: data.files?.map((f: { filename: string; status: string; additions: number; deletions: number; changes: number; previous_filename?: string }) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              changes: f.changes,
              previous_filename: f.previous_filename,
            })),
            parents: data.parents?.map((p: { sha: string }) => p.sha),
          };

          // Send commit detail to the panel
          events.emit({
            type: 'git-panels.commit-detail:loaded',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: { commit: commitDetail },
          });
        } catch (err) {
          console.error('[EditorLayout] Failed to fetch commit details:', err);
          events.emit({
            type: 'git-panels.commit-detail:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              hash,
              error: err instanceof Error ? err.message : 'Failed to fetch commit details',
            },
          });
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [events, login, actions, layout, leftSidebarCollapsed, rightSidebarCollapsed, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed, setTheme, setColor, resetColor, resetAllColors]);

  // Create enhanced actions that add writeFile and capture file metadata on read
  const enhancedActions = useMemo(() => ({
    ...actions,
    // Enhanced readFile that captures SHA for later commits (or reads from local filesystem)
    readFile: async (filePath: string): Promise<string> => {
      // Local mode: read directly from filesystem
      if (isLocalMode && localAdapter) {
        let cleanPath = filePath;
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
        // Remove any repo prefix patterns
        const patterns = ['GitHub/', `${githubRepo}/`, 'local/'];
        for (const pattern of patterns) {
          if (cleanPath.startsWith(pattern)) {
            cleanPath = cleanPath.slice(pattern.length);
          }
        }
        return await localAdapter.readFileAsync(cleanPath);
      }

      // GitHub mode: fetch from API
      if (!githubRepo || !githubRepo.includes('/')) {
        throw new Error('No valid repository available');
      }

      const [owner, name] = githubRepo.split('/');
      let cleanPath = filePath;
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
      if (cleanPath.startsWith('GitHub/')) cleanPath = cleanPath.slice('GitHub/'.length);
      const repoPrefix = `${githubRepo}/`;
      if (cleanPath.startsWith(repoPrefix)) cleanPath = cleanPath.slice(repoPrefix.length);

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
        content = new TextDecoder('utf-8').decode(bytes);
      }

      // Store file metadata (SHA and original content) for later commits
      if (data.sha) {
        setFileMetadata(filePath, {
          sha: data.sha,
          originalContent: content,
          loadedAt: new Date(),
        });
      }

      return content;
    },
    // writeFile stores changes locally for later commit (or writes directly to local filesystem)
    writeFile: async (filePath: string, content: string): Promise<void> => {
      // Local mode: write directly to filesystem
      if (isLocalMode && localAdapter) {
        let cleanPath = filePath;
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
        // Remove any repo prefix patterns
        const patterns = ['GitHub/', `${githubRepo}/`, 'local/'];
        for (const pattern of patterns) {
          if (cleanPath.startsWith(pattern)) {
            cleanPath = cleanPath.slice(pattern.length);
          }
        }
        await localAdapter.writeFileAsync(cleanPath, content);
        return;
      }

      // GitHub mode: store for later commit
      const success = addPendingChangeFromWrite(filePath, content);
      if (!success) {
        console.warn('[EditorLayout] writeFile called but no metadata found for:', filePath);
        // Still allow the write to "succeed" from the panel's perspective
        // The user will see it's not in pending changes if they try to commit
      }
    },
  }), [actions, githubRepo, setFileMetadata, addPendingChangeFromWrite, isLocalMode, localAdapter]);

  // Memoize panels that use stable props to prevent unnecessary re-renders
  const stablePanels = useMemo(() => [
    {
      id: 'docs',
      label: 'Docs',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AlexandriaDocsPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'ai-chat',
      label: 'AI Chat',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AIChatPanel
            context={context}
            actions={enhancedActions}
            events={events}
            placeholder="Ask me anything about your code..."
          />
        </div>
      ),
    },
    {
      id: 'markdown-viewer',
      label: 'Markdown',
      content: (
        <div className="h-full w-full overflow-hidden">
          <MarkdownPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'file-city',
      label: 'File City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'telemetry-coverage',
      label: 'Telemetry Coverage',
      content: (
        <div className="h-full w-full overflow-hidden">
          <TelemetryCoveragePanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'kanban',
      label: 'Kanban',
      content: (
        <div className="h-full w-full overflow-hidden">
          <KanbanPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'task-detail',
      label: 'Task Detail',
      content: (
        <div className="h-full w-full overflow-hidden">
          <TaskDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      content: (
        <div className="flex h-full w-full items-center justify-center p-4 text-sm">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Right Panel</h3>
            <p style={{ color: theme.colors.textMuted }}>Output / Terminal</p>
          </div>
        </div>
      ),
    },
    {
      id: 'sessions',
      label: 'Sessions',
      content: (
        <div className="h-full w-full overflow-hidden">
          <SessionsPanel />
        </div>
      ),
    },
    {
      id: 'visual-validation',
      label: 'Principal View',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PrincipalViewPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'trace-viewer',
      label: 'Trace Viewer',
      content: (
        <div className="h-full w-full overflow-hidden">
          <TraceViewerPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'quality-hexagon',
      label: 'Code Quality',
      content: (
        <div className="h-full w-full overflow-hidden">
          <QualityHexagonPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'lens-debug',
      label: 'Lens Debug',
      content: (
        <div className="h-full w-full overflow-hidden">
          <LensDataDebugPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'theme-editor',
      label: 'Theme Editor',
      content: (
        <div className="h-full w-full overflow-hidden">
          <ThemeEditorPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'event-bus',
      label: 'Event Bus',
      content: (
        <div className="h-full w-full overflow-hidden">
          <EventBusPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'agent-tools',
      label: 'Agent Tools',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AgentToolsPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'git-changes',
      label: 'Git Changes',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitChangesPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'commit-history',
      label: 'Commit History',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitCommitHistoryPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'commit-detail',
      label: 'Commit Detail',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitCommitDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'packages',
      label: 'Packages',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PackageCompositionPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'github-issues',
      label: 'Issues',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubIssuesPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'github-issue-detail',
      label: 'Issue Detail',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubIssueDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'github-messages',
      label: 'Conversation',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubMessagesPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitPullRequestsPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'pull-request-detail',
      label: 'Pull Request Detail',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitPullRequestDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
  ], [context, enhancedActions, events, theme.colors.textMuted]);

  // File editing panels - now use the standard panel framework pattern
  const fileEditingPanels = useMemo(() => [
    {
      id: 'file-editor',
      label: 'Files',
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileEditorPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'git-diff',
      label: 'Git Diff',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitDiffPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'mdx-editor',
      label: 'MDX Editor',
      content: (
        <div className="h-full w-full overflow-hidden">
          <MDXEditorPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
  ], [context, enhancedActions, events]);

  // Combine stable panels with file editing panels
  const panels = useMemo(() => [...stablePanels, ...fileEditingPanels], [stablePanels, fileEditingPanels]);

  // Parse repository info for commit modal
  const repositoryInfo = useMemo(() => {
    if (!githubRepo || !githubRepo.includes('/')) return null;
    const [owner, repo] = githubRepo.split('/');
    return { owner: owner!, repo: repo! };
  }, [githubRepo]);

  return (
    <div className="h-full w-full flex">
      {/* Layout Sidebar - Far Left */}
      <LayoutSidebar
        currentConfigId={currentLayoutConfigId}
        onConfigChange={handleLayoutConfigChange}
        collapsed={layoutSidebarCollapsed}
        onToggleCollapse={() => setLayoutSidebarCollapsed((prev: boolean) => !prev)}
        owner={repositoryInfo?.owner}
        badges={(repoCounts || triagedCount > 0) ? {
          ...(repoCounts ? {
            'github-issues': repoCounts.openIssues,
            'pull-requests': repoCounts.openPullRequests,
          } : {}),
          ...(triagedCount > 0 ? { 'kanban': triagedCount } : {}),
        } : undefined}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <EditorHeader
          currentLayoutConfigId={currentLayoutConfigId}
          leftCollapsed={leftSidebarCollapsed}
          rightCollapsed={rightSidebarCollapsed}
          onToggleLeft={() => setLeftSidebarCollapsed(prev => !prev)}
          onToggleRight={() => setRightSidebarCollapsed(prev => !prev)}
          onSwapRightPanels={() => setLayout(prev => ({ ...prev, middle: prev.right, right: prev.middle }))}
          pendingChangesCount={isLocalMode ? 0 : effectivePendingChangesCount}
          onCommitClick={() => setIsCommitModalOpen(true)}
          vimMode={vimMode}
          onVimModeToggle={handleVimModeToggle}
          currentRepoId={githubRepo}
          selectedColorMode={selectedColorMode}
          onClearColorMode={clearColorMode}
          owner={repositoryInfo?.owner}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        {/* Commit Modal - only show when not in local mode */}
        {repositoryInfo && !isLocalMode && (
          <CommitModal
            isOpen={isCommitModalOpen}
            onClose={() => setIsCommitModalOpen(false)}
            pendingChanges={getEffectivePendingChangesArray()}
            repositoryName={repositoryInfo}
            onCommit={handleCommit}
          />
        )}

        <div className="flex-1 overflow-hidden">
          {isMobile ? (
            <ResponsiveConfigurablePanelLayout
              theme={theme}
              panels={panels}
              layout={layout}
              defaultSizes={{
                left: 25,
                middle: 50,
                right: 25,
              }}
              minSizes={{
                left: 15,
                middle: 30,
                right: 20,
              }}
              collapsiblePanels={{
                left: true,
                right: true,
              }}
              collapsed={{
                left: leftSidebarCollapsed,
                right: rightSidebarCollapsed,
              }}
              showCollapseButtons={false}
              mobileBreakpoint="(max-width: 768px)"
            />
          ) : (
            <EditableConfigurablePanelLayout
              theme={theme}
              panels={panels}
              layout={layout}
              isEditMode={false}
              onLayoutChange={setLayout}
              defaultSizes={{
                left: 25,
                middle: 50,
                right: 25,
              }}
              minSizes={{
                left: 15,
                middle: 30,
                right: 20,
              }}
              collapsiblePanels={{
                left: true,
                right: true,
              }}
              collapsed={{
                left: leftSidebarCollapsed,
                right: rightSidebarCollapsed,
              }}
              showCollapseButtons={false}
            />
          )}
        </div>

        {/* Agent Command Palette (Cmd+Shift+P) - AI-driven natural language commands */}
        <AgentCommandPalette
          palette={agentPalette}
          config={{
            placeholder: 'What would you like to do?',
          }}
        />

        {/* Repository Selection Modal */}
        <RepoSelectionModal
          isOpen={isRepoModalOpen}
          onClose={() => setIsRepoModalOpen(false)}
        />
      </div>
    </div>
  );
}

interface EditorLayoutProps {
  githubRepo?: string;
  localAdapter?: LocalFileSystemAdapter | null;
  initialConfigId?: string;
  onConfigChange?: (configId: string) => void;
}

export function EditorLayout({ githubRepo, localAdapter: _localAdapter, initialConfigId, onConfigChange }: EditorLayoutProps = {}) {
  const { theme } = useTheme();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { adapter: localAdapter } = useLocalFileSystem();
  const isLocalMode = !!localAdapter;
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    if (!githubRepo) {
      setAccessStatus('granted');
      setErrorMessage(null);
      return;
    }

    if (authLoading) {
      setAccessStatus('loading');
      return;
    }

    const controller = new AbortController();
    const [owner, name] = githubRepo.split('/');

    setAccessStatus('loading');
    setErrorMessage(null);

    fetch(`/api/github/repo/${owner}/${name}?action=info`, {
      signal: controller.signal,
      credentials: 'include',
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;

        if (response.ok) {
          setAccessStatus('granted');
          return;
        }

        if (response.status === 401 && !isAuthenticated) {
          setAccessStatus('login-required');
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setAccessStatus('unauthorized');
          return;
        }

        if (response.status === 404) {
          setAccessStatus('not-found');
          return;
        }

        const data = await response.json().catch(() => null);
        setErrorMessage(data?.error ?? null);
        setAccessStatus('error');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
        setAccessStatus('error');
      });

    return () => controller.abort();
  }, [githubRepo, isAuthenticated, authLoading, checkAttempt]);

  const retryCheck = () => setCheckAttempt((attempt) => attempt + 1);

  // Show access notice if not granted AND not in local mode
  // Local mode bypasses GitHub access check since we're reading from local filesystem
  if (accessStatus !== 'granted' && !isLocalMode) {
    return (
      <div
        className="h-full w-full flex flex-col"
        style={{ background: theme.colors.background }}
      >
        <EditorHeader />
        <div className="flex-1 overflow-hidden">
          <AccessNotice
            status={accessStatus}
            onRetry={retryCheck}
            onLogin={login}
            repository={githubRepo}
            errorMessage={errorMessage}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      style={{ background: theme.colors.background }}
    >
      <PanelProvider
        workspace={{
          name: 'web-ade',
          path: '/workspace',
        }}
        repository={{
          name: 'web-ade',
          path: '/workspace/web-ade',
        }}
        githubRepo={githubRepo}
      >
        <EditorContextWrapper
          initialConfigId={initialConfigId}
          onConfigChange={onConfigChange}
        />
      </PanelProvider>
    </div>
  );
}

interface EditorContextWrapperProps {
  initialConfigId?: string;
  onConfigChange?: (configId: string) => void;
}

/**
 * Wrapper component that provides AI contexts (WebLLM, Gemini) and manages
 * editor-level state including layout configuration.
 */
function EditorContextWrapper({ initialConfigId, onConfigChange }: EditorContextWrapperProps) {
  const { events, actions, context } = usePanelProvider();

  // Layout state - lifted here so GeminiProvider can access it
  // Initialize from initialConfigId prop (from URL/localStorage) or default
  const [currentLayoutConfigId, setCurrentLayoutConfigId] = useState(() => {
    const validConfig = layoutConfigs.find((c) => c.id === initialConfigId);
    return validConfig ? initialConfigId! : 'documentation';
  });
  const currentLayoutConfig = layoutConfigs.find((c) => c.id === currentLayoutConfigId) || layoutConfigs[0]!;
  const [layout, setLayout] = useState<PanelLayout>(currentLayoutConfig.layout);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(currentLayoutConfig.collapsed.left);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(currentLayoutConfig.collapsed.right);

  // Notify parent when config changes
  const handleConfigIdChange = useCallback((configId: string) => {
    setCurrentLayoutConfigId(configId);
    onConfigChange?.(configId);
  }, [onConfigChange]);

  // TODO: Get markdown files from Alexandria panel state when available
  // For now, AI providers won't have access to the document list
  const markdownFiles = undefined;

  // Get repository info for file fetching - use the full owner/repo path
  const githubRepo = (context.currentScope.repository as { githubRepo?: string })?.githubRepo
    || context.currentScope.repository?.path;

  // Function to fetch file content for READ_FILE action
  const fetchFileContent = useCallback(async (filePath: string): Promise<string | null> => {
    if (!githubRepo || !githubRepo.includes('/')) {
      console.warn('[EditorContextWrapper] No valid repository available for file fetch:', githubRepo);
      return null;
    }

    try {
      const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const [owner, name] = githubRepo.split('/');

      console.log('[EditorContextWrapper] Fetching file content:', cleanPath, 'from', githubRepo);

      const response = await fetch(
        `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(cleanPath)}`
      );

      if (!response.ok) {
        console.error('[EditorContextWrapper] Failed to fetch file:', response.statusText);
        return null;
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

      return data.content || null;
    } catch (err) {
      console.error('[EditorContextWrapper] Error fetching file:', err);
      return null;
    }
  }, [githubRepo]);

  // Function to get GitHub repositories from context
  const getRepositories = useCallback(() => {
    const reposSlice = context.getSlice<{
      owned: Array<{ full_name: string; description: string | null; language: string | null; private: boolean }>;
      starred: Array<{ full_name: string; description: string | null; language: string | null; private: boolean }>;
      organizations: Array<{
        login: string;
        repositories: Array<{ full_name: string; description: string | null; language: string | null; private: boolean }>;
      }>;
    }>('github-repositories');

    if (!reposSlice?.data) return null;

    return {
      owned: reposSlice.data.owned || [],
      starred: reposSlice.data.starred || [],
      organizations: reposSlice.data.organizations || [],
    };
  }, [context]);

  // Layout state for AI providers
  const layoutState = useMemo(() => ({
    layout: {
      left: layout.left as string,
      middle: layout.middle as string,
      right: layout.right as string,
    },
    collapsed: {
      left: leftSidebarCollapsed,
      right: rightSidebarCollapsed,
    },
  }), [layout, leftSidebarCollapsed, rightSidebarCollapsed]);

  return (
    <PendingChangesProvider>
      <WebLLMProvider
        events={events}
        actions={actions}
        markdownFiles={markdownFiles}
        fetchFileContent={fetchFileContent}
      >
        <GeminiProvider
          events={events}
          actions={actions}
          markdownFiles={markdownFiles}
          fetchFileContent={fetchFileContent}
          getRepositories={getRepositories}
          layoutState={layoutState}
        >
          <EditorLayoutContent
            layout={layout}
            setLayout={setLayout}
            leftSidebarCollapsed={leftSidebarCollapsed}
            setLeftSidebarCollapsed={setLeftSidebarCollapsed}
            rightSidebarCollapsed={rightSidebarCollapsed}
            setRightSidebarCollapsed={setRightSidebarCollapsed}
            currentLayoutConfigId={currentLayoutConfigId}
            onLayoutConfigIdChange={handleConfigIdChange}
          />
        </GeminiProvider>
      </WebLLMProvider>
    </PendingChangesProvider>
  );
}
