'use client';

import {
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
  EditableConfigurablePanelLayout,
  AgentCommandPalette,
  useAgentCommandPalette,
  ConfigurablePanelLayoutHandle,
} from '@principal-ade/panel-layouts';
import { globalPanelRegistry } from '@principal-ade/panel-framework-core';
import type { PanelContextValue } from '@principal-ade/panel-framework-core';
import { useTheme } from '@principal-ade/industry-theme';
import { RepositoryPageProvider, useRepositoryPageProvider } from '@/contexts/RepositoryPageProvider';
import { WebLLMProvider } from '@/contexts/WebLLMContext';
import { GeminiProvider } from '@/contexts/GeminiContext';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { EditorHeader } from './EditorHeader';
import { SessionsPanel } from './SessionsPanel';
import { AccessNotice, AccessStatus } from './AccessNotice';
import { RepoSelectionModal } from './RepoSelectionModal';
import { CommitModal } from './CommitModal';
import { LayoutSidebar } from './LayoutSidebar';
import { layoutConfigs, LayoutConfig } from './LayoutConfigDropdown';
import { AIChatPanel } from './AIChatPanel';
import { RepositoryActivityFeedPanel } from '@/panels/RepositoryActivityFeedPanel';
import { PendingChangesProvider, usePendingChanges } from '@/contexts/PendingChangesContext';
import { useVFS } from '@/contexts/VFSContext';
import '@principal-ade/industry-themed-ai-sdk-panel/styles.css';
// CSS removed from principal-view-panels exports - styles now bundled in JS
import { useAuth } from '@/contexts/AuthContext';
import { useGemini } from '@/contexts/GeminiContext';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import { useNavigationCommands } from '@/hooks/useNavigationCommands';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useServiceStatus } from '@/hooks/useServiceStatus';
import type { Theme } from '@principal-ade/industry-theme';
import type { LocalFileSystemAdapter } from '@/lib/client/LocalFileSystemAdapter';
import { useLocalFileSystem } from '@/contexts/LocalFileSystemContext';
import type { FileInfo } from '@principal-ai/repository-abstraction';
import type { WorkflowTemplate, ExtendedCanvas, RegisteredTrace } from '@principal-ai/principal-view-core';
import { buildStoryboardContext, type StoryboardReference } from '@principal-ai/principal-view-core';
import { parseTaskMarkdown, serializeTaskMarkdown, DEFAULT_TASK_STATUSES } from '@backlog-md/core';
import { markTourAsShown } from '@/lib/tourStorage';
import { trpc } from '@/lib/trpc/client';
import type { OpenWorkflowScenariosPayload } from '@/types/panel-events';
import { withSpanSync } from '@/lib/telemetry';

// Static panel imports for type safety
import dynamic from 'next/dynamic';
import type { MarkdownPanelProps } from '@industry-theme/markdown-panels';
import { panels as alexandriaDocsPanels } from '@industry-theme/alexandria-docs-panel';
import { panels as backlogmdPanels } from '@industry-theme/backlogmd-kanban-panel';
import { panels as principalViewPanels, TraceDetailsPanel } from '@industry-theme/principal-view-panels';
import { panels as codeQualityPanels } from '@principal-ade/code-quality-panels';
import { panels as repositoryCompositionPanels, PackageCompositionPanel } from '@industry-theme/repository-composition-panels';
import { panels as gitPanels } from '@industry-theme/git-panels';
import { panels as githubPanels } from '@industry-theme/github-panels';
import { panels as fileEditingPanels } from '@industry-theme/file-editing-panels';
import { panels as agentPanels } from '@industry-theme/agent-panels';
import {
  BookOpen, MessageSquare, FileText, Map, LayoutGrid,
  CheckSquare, Terminal, Users, Compass, Shield, Bug,
  GitBranch, History, GitCommit, Package,
  Zap, File, Edit, Activity, Workflow
} from 'lucide-react';
import { SharedSequenceDiagramsListPanel } from './panels/SharedSequenceDiagramsListPanel';
import type {
  FileCityExplorerPanelActions,
  FileCityExplorerPanelContext,
  SequenceDiagramPayload,
} from '@industry-theme/file-city-panel';
import type { GitHubCommitDetailResponse } from '@/types/api';

// Dynamic imports for panels that access document at import time
const MarkdownPanel = dynamic<MarkdownPanelProps>(
  () => import('@industry-theme/markdown-panels').then(m => m.MarkdownPanel),
  { ssr: false }
);
const CodeCityPanel = dynamic(
  () => import('@industry-theme/file-city-panel').then(m => m.CodeCityPanel),
  { ssr: false }
);
const FileCityExplorerPanel = dynamic(
  () => import('@industry-theme/file-city-panel').then(m => m.FileCityExplorerPanel),
  { ssr: false }
);

// Static panel loaders (type-safe, no SSR)
const MarkdownPanelLoader = MarkdownPanel;
const AlexandriaDocsPanelLoader = alexandriaDocsPanels[0]!.component;
const FileCityPanelLoader = CodeCityPanel;
const KanbanPanelLoader = backlogmdPanels[0]!.component;
const TaskDetailPanelLoader = backlogmdPanels[1]!.component;
const PrincipalViewPanelLoader = principalViewPanels[0]!.component;
const QualityHexagonPanelLoader = codeQualityPanels[0]!.component;
const LensDataDebugPanelLoader = codeQualityPanels[2]!.component;
const GitChangesPanelLoader = repositoryCompositionPanels[0]!.component;
const PackageCompositionPanelLoader = PackageCompositionPanel;
const GitCommitHistoryPanelLoader = gitPanels[0]!.component;
const GitCommitDetailPanelLoader = gitPanels[1]!.component;
const GitHubMessagesPanelLoader = githubPanels[6]!.component;
const FileEditorPanelLoader = fileEditingPanels[0]!.component;
const SkillsListPanelLoader = agentPanels[0]!.component;
const SkillDetailPanelLoader = agentPanels[1]!.component;

// Principal View panels - find by metadata ID (static)
const StoryboardListPanelLoader = principalViewPanels.find(
  (p) => p.metadata?.id === 'principal-ai.storyboard-list'
)!.component;
const CanvasEditorPanelLoader = principalViewPanels.find(
  (p) => p.metadata?.id === 'principal-ai.canvas-editor'
)!.component;
const TraceListPanelLoader = principalViewPanels.find(
  (p) => p.metadata?.id === 'principal-ai.trace-list'
)!.component;
const TraceDetailsPanelLoader = TraceDetailsPanel;

/**
 * Build the GitHub issue body for a backlog task (without @claude tag)
 * The @claude tag will be added in a separate comment after the task file is updated
 */
function buildClaudeIssueBody(task: {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  labels?: string[];
  acceptanceCriteria?: Array<{ text: string; checked: boolean }>;
  implementationPlan?: string;
  rawContent?: string;
}): string {
  const lines: string[] = [];

  lines.push(`## Task: ${task.title}`);
  lines.push('');

  if (task.priority) {
    lines.push(`**Priority:** ${task.priority}`);
    lines.push('');
  }

  if (task.description) {
    lines.push('### Description');
    lines.push(task.description);
    lines.push('');
  }

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    lines.push('### Acceptance Criteria');
    for (const criterion of task.acceptanceCriteria) {
      const checkbox = criterion.checked ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${criterion.text}`);
    }
    lines.push('');
  }

  if (task.implementationPlan) {
    lines.push('### Implementation Plan');
    lines.push(task.implementationPlan);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Backlog Task ID: ${task.id}*`);

  return lines.join('\n');
}

interface EditorLayoutContentProps {
  layout: PanelLayout;
  setLayout: React.Dispatch<React.SetStateAction<PanelLayout>>;
  leftSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  currentLayoutConfigId: string;
  onLayoutConfigIdChange: (configId: string) => void;
  initialWalkthroughId?: string;
  onWalkthroughChange?: (id: string | null) => void;
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
  initialWalkthroughId,
  onWalkthroughChange,
}: EditorLayoutContentProps) {
  const { theme } = useTheme();
  const { context, actions, events, selectedColorMode, clearColorMode } = useRepositoryPageProvider();

  // Count triaged items from fileTree (files in backlog/tasks/)
  const fileTreeSlice = context.fileTree;
  const triagedCount = useMemo(() => {
    const allFiles = fileTreeSlice?.data?.allFiles;
    if (!allFiles) return 0;
    return allFiles.filter((file: { path: string }) => file.path.includes('backlog/tasks/')).length;
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Ref for imperative panel layout control (collapse/expand)
  const panelLayoutRef = useRef<ConfigurablePanelLayoutHandle>(null);

  // Store initial collapsed state in a ref - this is what we pass to the component
  // The component only uses this for initial state, then we control via imperative API
  const initialCollapsedRef = useRef({ left: leftSidebarCollapsed, right: rightSidebarCollapsed });

  // Handlers for collapse/expand using imperative API
  const handleToggleLeft = useCallback(() => {
    if (leftSidebarCollapsed) {
      panelLayoutRef.current?.expandPanel('left');
      // After expand, ensure panel is at least 20% (library may restore to small size)
      const currentLayout = panelLayoutRef.current?.getLayout();
      if (currentLayout && currentLayout.left < 20) {
        panelLayoutRef.current?.setLayout({ left: 25, middle: 50, right: currentLayout.right });
      }
    } else {
      panelLayoutRef.current?.collapsePanel('left');
    }
    setLeftSidebarCollapsed(prev => !prev);
  }, [leftSidebarCollapsed, setLeftSidebarCollapsed]);

  const handleToggleRight = useCallback(() => {
    if (rightSidebarCollapsed) {
      panelLayoutRef.current?.expandPanel('right');
      // After expand, ensure panel is at least 20% (library may restore to small size)
      const currentLayout = panelLayoutRef.current?.getLayout();
      if (currentLayout && currentLayout.right < 20) {
        panelLayoutRef.current?.setLayout({ left: currentLayout.left, middle: 50, right: 25 });
      }
    } else {
      panelLayoutRef.current?.collapsePanel('right');
    }
    setRightSidebarCollapsed(prev => !prev);
  }, [rightSidebarCollapsed, setRightSidebarCollapsed]);

  // State for selected canvas and workflow (for Stories view)
  const [selectedCanvasData, setSelectedCanvasData] = useState<{
    canvasId?: string;
    canvasPath?: string;
    canvasName?: string;
    canvasFileInfo?: FileInfo | null;
  } | null>(null);

  const [selectedWorkflowData, setSelectedWorkflowData] = useState<{
    workflowId?: string;
    workflowPath?: string;
    workflow?: WorkflowTemplate | null;
    workflowFileInfo?: FileInfo | null;
  } | null>(null);

  // State for selected trace (for Telemetry view)
  const [selectedTrace, setSelectedTrace] = useState<RegisteredTrace | null>(null);

  // Active sequence-diagram payload for the Walkthroughs layout. The
  // SharedSequenceDiagramsListPanel writes it; the FileCityExplorerPanel
  // reads it via its `sequenceDiagram` slice. Lives here (rather than in
  // a separate context) because both panels render in this tree.
  const [activeSequencePayload, setActiveSequencePayload] =
    useState<SequenceDiagramPayload | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  // Overlay panel state for single-panel mode - shows panel on top without losing base panel state
  const [overlayPanelId, setOverlayPanelId] = useState<string | null>(null);

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

  // Extract service name for OTEL status (use repo name from owner/repo)
  const serviceName = useMemo(() => {
    if (!githubRepo || !githubRepo.includes('/')) return null;
    const parts = githubRepo.split('/');
    return parts[1] || null; // Return repo name (second part)
  }, [githubRepo]);

  // Check OTEL service status to conditionally show traces layout
  const { isAlive: serviceIsAlive } = useServiceStatus(serviceName);

  // Listen for tour:loaded event from File City panel and cache tour availability
  // When a tour is detected in a fork, cache it under the parent repo
  useEffect(() => {
    if (!events || !githubRepo || !githubRepo.includes('/')) return;

    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) return;

    const cleanup = events.on('tour:loaded', (event) => {
      const payload = event.payload as { tourPath: string; tourId?: string; tourName?: string } | undefined;
      if (!payload?.tourPath) return;

      console.log(`[EditorLayout] Tour loaded at ${owner}/${repo}/${payload.tourPath}, caching...`);

      // Fire and forget - cache the tour availability under parent repo
      trpc.github.cacheTourAvailability.mutate({
        owner,
        repo,
        tourPath: payload.tourPath,
        tourId: payload.tourId,
        tourName: payload.tourName,
      }).then((result) => {
        if (result.cached) {
          console.log(`[EditorLayout] Tour cached for parent: ${result.parentRepo}`);
        }
      }).catch((error) => {
        console.warn('[EditorLayout] Failed to cache tour availability:', error);
      });
    });

    return cleanup;
  }, [events, githubRepo]);

  // Filter layout configs based on service status
  // Show traces layout only when OTEL heartbeat is successful
  const filteredLayoutConfigs = useMemo(() => {
    return layoutConfigs.map(config => {
      if (config.id === 'traces') {
        return { ...config, hidden: !serviceIsAlive };
      }
      return config;
    });
  }, [serviceIsAlive]);

  // Listen for tour:exit event to mark tour as shown
  useEffect(() => {
    if (!events || !githubRepo || !githubRepo.includes('/')) return;

    const cleanup = events.on('tour:exit', () => {
      const [owner, repo] = githubRepo.split('/');
      if (owner && repo) {
        markTourAsShown(owner, repo);
      }
    });

    return cleanup;
  }, [events, githubRepo]);

  // Handle layout configuration change
  const handleLayoutConfigChange = useCallback((config: LayoutConfig) => {
    // Telemetry: layout switch (only emit for stories layout)
    if (config.id === 'stories' && githubRepo && githubRepo.includes('/')) {
      const [owner, repo] = githubRepo.split('/');
      // Span: stories.panel.storyboard-list.mount (spanPattern from layout-init.workflow.json)
      withSpanSync('stories.panel.storyboard-list.mount', (span) => {
        span.addEvent('stories.layout.switch', {
          layoutId: config.id,
        });
        span.addEvent('stories.panel.storyboard-list.mount', {
          owner: owner!,
          repo: repo!,
        });
      });
    }

    onLayoutConfigIdChange(config.id);
    setLayout(config.layout);
    setLeftSidebarCollapsed(config.collapsed.left);
    setRightSidebarCollapsed(config.collapsed.right);

    // Drop the `?walkthrough=` URL param when leaving the walkthroughs
    // layout — keeps share links honest about what's actually visible.
    if (config.id !== 'walkthroughs') {
      onWalkthroughChange?.(null);
    }
  }, [onLayoutConfigIdChange, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed, githubRepo, onWalkthroughChange]);

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

  // Speech recognition for voice input to command palette
  const { startListening: startSpeechRecognition, isSupported: isSpeechSupported } = useSpeechRecognition({
    onTranscript: (transcript, isFinal) => {
      // Update the command palette query as speech is recognized
      agentPalette.setQuery(transcript);

      // Auto-submit when final transcript is received
      if (isFinal && transcript.trim()) {
        // Small delay to let user see the final text before submitting
        setTimeout(() => {
          agentPalette.submit();
        }, 300);
      }
    },
    onEnd: () => {
      // Speech recognition ended
    },
    onError: (error) => {
      console.error('Speech recognition error:', error);
    },
  });

  // Handler to open command palette with voice input
  const handleOpenWithMic = useCallback(() => {
    agentPalette.open();
    // Start listening after a small delay to ensure palette is open
    setTimeout(() => {
      startSpeechRecognition();
    }, 100);
  }, [agentPalette, startSpeechRecognition]);

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

  // Handle Escape key to close overlay panel in single-panel mode
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && overlayPanelId) {
        setOverlayPanelId(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [overlayPanelId]);

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
          left: 'packages',
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
      events.on('package:select', async (event) => {
        const payload = event.payload as {
          name: string;
          path: string;
          version?: string;
        } | null;

        if (!payload?.path) return;

        if (!actions.openFile) return;

        // Try to load the README from the package directory
        const readmePath = payload.path.endsWith('/')
          ? `${payload.path}README.md`
          : `${payload.path}/README.md`;

        try {
          // Open the README file - this updates the active-file slice
          await actions.openFile(readmePath);

          // Switch middle panel to markdown viewer
          setLayout((prev) => ({
            ...prev,
            middle: 'markdown-viewer',
          }));
        } catch (_err) {
          // README doesn't exist - that's fine, just log it
          console.log('[EditorLayout] No README found for package:', payload.path);
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
      // Toast notification events
      events.on('toast:show', (event) => {
        const payload = event.payload as { message: string; type?: 'error' | 'success' | 'info' };
        if (payload?.message) {
          setToast({ message: payload.message, type: payload.type || 'info' });
          // Auto-dismiss after 4 seconds
          setTimeout(() => setToast(null), 4000);
        }
      }),
      // File editor events - switch to appropriate panel when file is opened
      events.on('file:open', async (event) => {
        const payload = event.payload as { path?: string; filePath?: string };
        const filePath = payload.path || payload.filePath;
        if (filePath) {
          // Use actions.openFile for ALL files - it updates the active-file slice
          // which both markdown-viewer and file-editor panels use
          if (actions.openFile) {
            try {
              await actions.openFile(filePath);

              // Switch to the appropriate panel based on file type
              const isMarkdown = /\.(md|mdx|markdown)$/i.test(filePath);
              const targetPanel = isMarkdown ? 'markdown-viewer' : 'file-editor';

              // Check if we're in single-panel mode
              const currentConfig = layoutConfigs.find((c) => c.id === currentLayoutConfigId);
              const isSinglePanelMode = currentConfig?.singlePanelMode ?? false;

              if (isSinglePanelMode) {
                // In single-panel mode, show file viewer as overlay instead of switching
                setOverlayPanelId(targetPanel);
              } else {
                // Normal mode - switch the middle panel
                if (layout.middle !== targetPanel) {
                  setLayout((prev) => ({
                    ...prev,
                    middle: targetPanel,
                  }));
                }
              }
            } catch (error) {
              // Show toast for file not found or other errors
              const message = error instanceof Error ? error.message : 'Failed to open file';
              setToast({ message, type: 'error' });
              setTimeout(() => setToast(null), 4000);
            }
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

        // Listen for openWorkflowScenarios action from TraceListPanel
        if (payload?.action === 'openWorkflowScenarios') {
          console.log('[EditorLayout] Opening workflow scenarios:', payload);

          // Type guard: ensure payload is OpenWorkflowScenariosPayload
          const isValidPayload = (p: unknown): p is OpenWorkflowScenariosPayload => {
            const candidate = p as Partial<OpenWorkflowScenariosPayload>;
            return (
              candidate.action === 'openWorkflowScenarios' &&
              typeof candidate.workflowId === 'string' &&
              typeof candidate.workflowPath === 'string' &&
              typeof candidate.canvasId === 'string' &&
              candidate.workflowTemplate !== undefined &&
              candidate.workflowTemplate !== null &&
              typeof candidate.workflowTemplate === 'object' &&
              'scenarios' in candidate.workflowTemplate &&
              Array.isArray(candidate.workflowTemplate.scenarios)
            );
          };

          if (!isValidPayload(payload)) {
            console.error('[EditorLayout] Invalid openWorkflowScenarios payload - missing required workflowTemplate with scenarios:', payload);
            return;
          }

          // Span: stories.state.selectedCanvasData (spanPattern from canvas-editor.workflow.json)
          withSpanSync('stories.state.selectedCanvasData', (span) => {
            // Event: receive openWorkflowScenarios
            span.addEvent('stories.editor.receive.openWorkflowScenarios', {
              workflowId: payload.workflowId,
              workflowPath: payload.workflowPath,
              scenarioCount: payload.workflowTemplate.scenarios.length,
            });

            // Event: workflow data stored
            span.addEvent('stories.state.selectedWorkflowData', {
              workflowId: payload.workflowId,
              workflowPath: payload.workflowPath,
              scenarioCount: payload.workflowTemplate.scenarios.length,
            });

            // Event: canvas data stored
            span.addEvent('stories.state.selectedCanvasData', {
              canvasId: payload.canvasId,
              canvasPath: payload.canvasPath || '',
              canvasName: payload.canvasName || '',
            });
          });

          // Now TypeScript knows payload is OpenWorkflowScenariosPayload
          setSelectedWorkflowData({
            workflowId: payload.workflowId,
            workflowPath: payload.workflowPath,
            workflow: payload.workflowTemplate, // Guaranteed to have scenarios[]
          });

          // Update selected canvas data
          setSelectedCanvasData({
            canvasId: payload.canvasId,
            canvasPath: payload.canvasPath,
            canvasName: payload.canvasName,
          });

          // Switch to canvas-editor panel in the middle slot (has workflow scenarios functionality)
          setLayout((prev) => ({
            ...prev,
            middle: 'canvas-editor',
          }));
        }
      }),
      // Storyboard focus event - switch to canvas list panel
      events.on('storyboard:focus', (event) => {
        const payload = event.payload as { id: string; name: string; path: string };
        console.log('[EditorLayout] Storyboard focus requested:', payload);
        setLayout((prev) => ({
          ...prev,
          middle: 'canvas-list',
        }));
      }),
      // Workflow focus event - switch to canvas-editor panel (has workflow scenarios functionality)
      events.on('workflow:focus', (event) => {
        const payload = event.payload as { id: string; name: string; path: string };
        console.log('[EditorLayout] Workflow focus requested:', payload);
        setLayout((prev) => ({
          ...prev,
          middle: 'canvas-editor',
        }));
      }),
      // Trace selection event - update selected trace for trace details panel
      events.on('trace:selected', (event) => {
        const payload = event.payload as { trace: RegisteredTrace; traceId: string };
        console.log('[EditorLayout] Trace selected:', payload.traceId);
        setSelectedTrace(payload.trace);
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
      // Handle "Assign to Claude" from kanban panel
      events.on('task:assign-to-claude', async (event) => {
        const payload = event.payload as {
          taskId: string;
          task: {
            id: string;
            title: string;
            description?: string;
            priority?: string;
            labels?: string[];
            acceptanceCriteria?: Array<{ text: string; checked: boolean }>;
            implementationPlan?: string;
            rawContent?: string;
            filePath?: string;
            status?: string;
            references?: string[];
          };
        };

        if (!payload?.task || !githubRepo || !githubRepo.includes('/')) {
          console.error('[EditorLayout] Cannot assign to Claude: missing task or repo');
          return;
        }

        const [owner, name] = githubRepo.split('/');
        const task = payload.task;

        // Build issue body with task details
        const issueBody = buildClaudeIssueBody(task);

        try {
          // 1. Create the GitHub issue (without @claude tag)
          const issueResponse = await fetch(`/api/github/repo/${owner}/${name}/issues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              title: `[${task.id}] ${task.title}`,
              body: issueBody,
              labels: ['claude-task'],
            }),
          });

          if (!issueResponse.ok) {
            const errorData = await issueResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to create issue: ${issueResponse.statusText}`);
          }

          const { issue } = await issueResponse.json();
          const issueUrl = issue.html_url as string;
          const issueNumber = issue.number as number;

          console.log(`[EditorLayout] Created GitHub issue #${issueNumber} for task ${task.id}`);

          // 2. Update task file with issue reference and commit
          if (task.filePath) {
            try {
              // Read current task file content and get SHA
              const fileResponse = await fetch(
                `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(task.filePath)}`
              );

              if (fileResponse.ok) {
                const fileData = await fileResponse.json();
                let content = '';
                if (fileData.content && fileData.encoding === 'base64') {
                  const binaryString = atob(fileData.content.replace(/\n/g, ''));
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  content = new TextDecoder('utf-8').decode(bytes);
                }

                // Parse task, add reference, set status to in-progress, and serialize back
                const parsedTask = parseTaskMarkdown(content, task.filePath);
                const existingRefs = parsedTask.references || [];
                if (!existingRefs.includes(issueUrl)) {
                  parsedTask.references = [...existingRefs, issueUrl];
                }
                // Set status to "In Progress" when assigning to Claude
                parsedTask.status = DEFAULT_TASK_STATUSES.IN_PROGRESS;
                const updatedContent = serializeTaskMarkdown(parsedTask);

                // Commit the updated file
                const commitResponse = await fetch(`/api/github/repo/${owner}/${name}/commit`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    files: [{
                      path: task.filePath,
                      content: updatedContent,
                      sha: fileData.sha,
                    }],
                    message: `Assign task ${task.id} to Claude (issue #${issueNumber})`,
                  }),
                });

                if (!commitResponse.ok) {
                  console.warn('[EditorLayout] Failed to commit task file update, but issue was created');
                } else {
                  console.log(`[EditorLayout] Committed task file update with issue reference`);
                }
              }
            } catch (fileErr) {
              console.warn('[EditorLayout] Failed to update task file, but issue was created:', fileErr);
            }
          }

          // 3. Add @claude comment to trigger the workflow
          try {
            const commentResponse = await fetch(`/api/github/repo/${owner}/${name}/issues/${issueNumber}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                comment: '@claude Please work on this task. Follow the acceptance criteria and implementation plan in the issue description.',
              }),
            });

            if (!commentResponse.ok) {
              console.warn('[EditorLayout] Failed to add @claude comment, but issue was created');
            } else {
              console.log(`[EditorLayout] Added @claude comment to issue #${issueNumber}`);
            }
          } catch (commentErr) {
            console.warn('[EditorLayout] Failed to add @claude comment:', commentErr);
          }

          // 4. Emit success event so kanban panel can update UI
          events.emit({
            type: 'task:assigned-to-claude',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              taskId: task.id,
              issueNumber,
              issueUrl,
              issue, // Include full issue object for state updates
            },
          });

        } catch (err) {
          console.error('[EditorLayout] Failed to assign task to Claude:', err);
          events.emit({
            type: 'task:assign-to-claude:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              taskId: task.id,
              error: err instanceof Error ? err.message : 'Failed to assign to Claude',
            },
          });
        }
      }),
      // Handle "Create Task from Issue" from GitHub issue detail panel
      events.on('issue:create-task', async (event) => {
        const payload = event.payload as {
          issue: {
            number: number;
            title: string;
            body: string | null;
            html_url: string;
            labels: Array<{ name: string; color: string }>;
            state: string;
          };
          owner: string;
          repo: string;
          taskType: 'investigate' | 'fix';
          additionalInstructions?: string;
        };

        if (!payload?.issue || !githubRepo || !githubRepo.includes('/')) {
          console.error('[EditorLayout] Cannot create task: missing issue or repo');
          events.emit({
            type: 'issue:create-task:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              issueNumber: payload?.issue?.number,
              error: 'Missing issue data or repository context',
            },
          });
          return;
        }

        const [owner, name] = githubRepo.split('/');
        const issue = payload.issue;

        try {
          // Call the backlog task creation API
          const response = await fetch('/api/backlog/tasks/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              owner,
              repo: name,
              issue,
              taskType: payload.taskType,
              additionalInstructions: payload.additionalInstructions,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to create task: ${response.statusText}`);
          }

          const data = await response.json();

          console.log(`[EditorLayout] Created task ${data.taskId} from issue #${issue.number}`);

          // Update the issue with the new label
          const labelName = `backlog-task:${payload.taskType}`;
          if (!issue.labels.some(l => l.name === labelName)) {
            issue.labels.push({
              name: labelName,
              color: '0e8a16',
            });
          }

          // Emit success event
          events.emit({
            type: 'issue:task-created',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              issueNumber: issue.number,
              taskId: data.taskId,
            },
          });

          // Re-emit issue:selected to refresh the panel with updated labels
          events.emit({
            type: 'issue:selected',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              issue,
              owner,
              repo: name,
            },
          });

        } catch (err) {
          console.error('[EditorLayout] Failed to create task from issue:', err);
          events.emit({
            type: 'issue:create-task:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              issueNumber: issue.number,
              error: err instanceof Error ? err.message : 'Failed to create task',
            },
          });
        }
      }),
      // Handle task selection - focus TaskDetailPanel
      events.on('task:selected', () => {
        // Emit focus event to the task detail panel
        events.emit({
          type: 'panel:focus',
          source: 'web-ade',
          timestamp: Date.now(),
          payload: {
            panelId: 'task-detail',
            panelSlot: 'middle', // or wherever the task detail panel is located
          },
        });
      }),
      // Handle task deletion from TaskDetailPanel
      events.on('task:delete-requested', async (event) => {
        const payload = event.payload as {
          taskId: string;
          task: {
            id: string;
            title: string;
            filePath?: string;
          };
        };

        if (!payload?.task || !githubRepo || !githubRepo.includes('/')) {
          console.error('[EditorLayout] Cannot delete task: missing task or repo');
          events.emit({
            type: 'task:deleted:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              taskId: payload?.taskId,
              error: 'Missing task data or repository context',
            },
          });
          return;
        }

        const [owner, name] = githubRepo.split('/');
        const task = payload.task;

        if (!task.filePath) {
          console.error('[EditorLayout] Cannot delete task: missing file path');
          events.emit({
            type: 'task:deleted:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              taskId: task.id,
              error: 'Task file path is missing',
            },
          });
          return;
        }

        try {
          // Read the file to get its SHA
          const fileResponse = await fetch(
            `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(task.filePath)}`,
            { credentials: 'include' }
          );

          if (!fileResponse.ok) {
            throw new Error(`Failed to read task file: ${fileResponse.statusText}`);
          }

          const fileData = await fileResponse.json();

          // Delete the file by committing with empty content and sha
          const deleteResponse = await fetch(`/api/github/repo/${owner}/${name}/commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              files: [{
                path: task.filePath,
                content: null, // null indicates deletion
                sha: fileData.sha,
              }],
              message: `Delete task: ${task.title}`,
            }),
          });

          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to delete task: ${deleteResponse.statusText}`);
          }

          console.log(`[EditorLayout] Successfully deleted task ${task.id}`);

          // Emit success event
          events.emit({
            type: 'task:deleted:success',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: { taskId: task.id },
          });

          // Emit focus event to return focus to kanban panel
          setTimeout(() => {
            events.emit({
              type: 'panel:focus',
              source: 'web-ade',
              timestamp: Date.now(),
              payload: {
                panelId: 'backlog-kanban',
                panelSlot: 'left',
              },
            });
          }, 2100); // Slightly after the 2s success display

        } catch (err) {
          console.error('[EditorLayout] Failed to delete task:', err);
          events.emit({
            type: 'task:deleted:error',
            source: 'web-ade',
            timestamp: Date.now(),
            payload: {
              taskId: task.id,
              error: err instanceof Error ? err.message : 'Failed to delete task',
            },
          });
        }
      }),
      // Handle skill selection - focus SkillDetailPanel
      events.on('skill:selected', () => {
        // Emit focus event to the skill detail panel
        events.emit({
          type: 'panel:focus',
          source: 'web-ade',
          timestamp: Date.now(),
          payload: {
            panelId: 'skill-detail',
            panelSlot: 'middle', // or wherever the skill detail panel is located
          },
        });
      }),
      // Handle storyboard canvas/workflow selection - switch middle panel based on openMode
      events.on('custom', (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = event.payload as any;

        // Check if this is an openCanvas action from storyboard-list-panel
        if (event.source === 'storyboard-list-panel' && payload?.action === 'openCanvas') {
          console.log('[EditorLayout] openCanvas event received:', payload);

          // Store canvas data
          if (payload.canvas) {
            // Span: stories.state.selectedCanvasData (spanPattern from canvas-editor.workflow.json)
            withSpanSync('stories.state.selectedCanvasData', (span) => {
              // Event: receive openCanvas
              span.addEvent('stories.editor.receive.openCanvas', {
                canvasPath: payload.canvas?.path || '',
                openMode: payload.openMode || 'view',
              });

              // Event: canvas data stored
              span.addEvent('stories.state.selectedCanvasData', {
                canvasId: payload.canvasId || payload.canvas.id,
                canvasPath: payload.canvas.path,
                canvasName: payload.canvas.name || payload.canvas.id,
              });
            });

            setSelectedCanvasData({
              canvasId: payload.canvasId || payload.canvas.id,
              canvasPath: payload.canvas.path,
              canvasName: payload.canvas.name || payload.canvas.id,
              canvasFileInfo: payload.canvasFileInfo,
            });
          }

          if (payload.openMode === 'editor') {
            // Open canvas editor for canvas editing (no workflow)
            console.log('[EditorLayout] Switching to canvas-editor (no workflow)');
            setSelectedWorkflowData(null); // Clear workflow when opening canvas editor
            setLayout((prev) => ({
              ...prev,
              middle: 'canvas-editor',
            }));
          } else if (payload.openMode === 'detail' && payload.workflow) {
            // Store workflow data and open canvas editor with workflow integration (v0.12.1+)
            // CanvasEditorPanel now shows ScenariosList side panel when workflowTemplate is provided
            console.log('[EditorLayout] Switching to canvas-editor with workflow:', payload.workflow);
            const workflowPath = payload.workflowFileInfo?.path;
            console.log('[EditorLayout] Workflow path extracted:', workflowPath);
            setSelectedWorkflowData({
              workflowId: payload.workflowId,
              workflowPath,
              workflow: payload.workflow,
              workflowFileInfo: payload.workflowFileInfo || null,
            });

            setLayout((prev) => ({
              ...prev,
              middle: 'canvas-editor', // Use canvas-editor with workflow props instead of workflow-scenarios
            }));
          }
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [events, login, actions, layout, leftSidebarCollapsed, rightSidebarCollapsed, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed, setTheme, setColor, resetColor, resetAllColors, githubRepo, currentLayoutConfigId]);

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

  // Build and emit storyboard context when canvas/workflow selection changes
  useEffect(() => {
    const buildAndEmitStoryboardContext = async () => {
      // If no canvas selected, clear the context
      if (!selectedCanvasData?.canvasPath) {
        events.emit({
          type: 'storyboard:context:update',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: null,
        });
        return;
      }

      try {
        // Load canvas content
        const canvasContent = await enhancedActions.readFile(selectedCanvasData.canvasPath);
        const canvas: ExtendedCanvas = JSON.parse(canvasContent);

        // Build storyboard reference
        const storyboardRef: StoryboardReference = {
          id: selectedCanvasData.canvasId || selectedCanvasData.canvasPath,
          name: selectedCanvasData.canvasName || selectedCanvasData.canvasId || 'Unknown',
          path: selectedCanvasData.canvasPath,
        };

        // Span: stories.event.context.update (spanPattern from context-propagation.workflow.json)
        withSpanSync('stories.event.context.update', (span) => {
          // Event: building storyboard context
          span.addEvent('stories.context.build', {
            canvasPath: selectedCanvasData.canvasPath,
            hasWorkflow: !!(selectedWorkflowData?.workflow && selectedWorkflowData?.workflowPath),
            hasScenario: false, // TODO: track selected scenario
          });

          // Build storyboard context (with or without workflow)
          const storyboardContext = buildStoryboardContext({
            canvas,
            storyboard: storyboardRef,
            workflow: (selectedWorkflowData?.workflow && selectedWorkflowData?.workflowPath) ? {
              template: selectedWorkflowData.workflow,
              path: selectedWorkflowData.workflowPath,
            } : undefined,
          });

          console.log('[EditorLayout] Built storyboard context:', storyboardContext);

          // Event: emitting context update
          span.addEvent('stories.event.context.update', {
            source: 'editor-layout',
            type: 'storyboard:context:update',
            hasContext: !!storyboardContext,
          });

          // Emit the context update
          events.emit({
            type: 'storyboard:context:update',
            source: 'editor-layout',
            timestamp: Date.now(),
            payload: storyboardContext,
          });
        });
      } catch (error) {
        console.error('[EditorLayout] Failed to build storyboard context:', error);
        // Clear context on error
        events.emit({
          type: 'storyboard:context:update',
          source: 'editor-layout',
          timestamp: Date.now(),
          payload: null,
        });
      }
    };

    buildAndEmitStoryboardContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCanvasData, selectedWorkflowData]);

  // === Walkthroughs layout: FileCityExplorerPanel wiring ===

  const sequenceRepoSplit = useMemo(() => {
    if (!githubRepo || !githubRepo.includes('/')) return null;
    const [owner, repo] = githubRepo.split('/');
    return { owner: owner!, repo: repo! };
  }, [githubRepo]);

  const explorerContext = useMemo<PanelContextValue<FileCityExplorerPanelContext>>(() => {
    const nullSlice = <T,>(name: string) => ({
      scope: 'repository' as const,
      name,
      data: null as T | null,
      loading: false,
      error: null,
      refresh: async () => {},
    });
    return {
      // Spread first to inherit currentScope / refresh / adapters from the
      // host's PanelContextValue; override slices below.
      ...context,
      fileTree: context.fileTree,
      gitStatusWithFiles: nullSlice('gitStatusWithFiles'),
      lineCounts: context.lineCounts ?? nullSlice('lineCounts'),
      latestCommit: nullSlice('latestCommit'),
      scopeWorkspace: nullSlice('scopeWorkspace'),
      areaWorkspace: nullSlice('areaWorkspace'),
      sequenceDiagram: {
        scope: 'repository' as const,
        name: 'sequenceDiagram',
        data: activeSequencePayload,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      repository: sequenceRepoSplit
        ? { owner: sequenceRepoSplit.owner, name: sequenceRepoSplit.repo }
        : null,
    };
  }, [context, activeSequencePayload, sequenceRepoSplit]);

  const explorerActions = useMemo<FileCityExplorerPanelActions>(() => ({
    ...actions,
    openFile: (filePath: string, _line?: number) => {
      // Host's openFile is single-arg; line navigation isn't wired yet.
      if (typeof actions.openFile === 'function') {
        actions.openFile(filePath);
      }
    },
    readFile: (path: string) => enhancedActions.readFile(path),
    getCommitDiff: async (commitHash: string): Promise<string> => {
      if (!sequenceRepoSplit) {
        throw new Error('Repository not selected.');
      }
      const { owner, repo } = sequenceRepoSplit;
      const res = await fetch(
        `/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(commitHash)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch commit ${commitHash}: ${res.statusText}`);
      }
      const data: GitHubCommitDetailResponse = await res.json();
      // GitHub's per-file `patch` is already in unified-diff hunk form;
      // prepend the file headers so the join is a complete unified diff.
      return (data.files ?? [])
        .filter((f) => typeof f.patch === 'string')
        .map((f) => {
          const oldPath = f.previous_filename ?? f.filename;
          const newPath = f.filename;
          return [
            `diff --git a/${oldPath} b/${newPath}`,
            `--- a/${oldPath}`,
            `+++ b/${newPath}`,
            f.patch,
          ].join('\n');
        })
        .join('\n');
    },
    getWorkingTreeDiff: async () => '',
    // Scope/area workspaces are wired with `data: null`, so these
    // actions are unreachable from the panel UI — the throws are
    // defensive in case a host wires the slice without wiring the action.
    addToScope: async () => {
      throw new Error('addToScope is not supported on web-ade yet.');
    },
    addArea: async () => {
      throw new Error('addArea is not supported on web-ade yet.');
    },
    addPathToArea: async () => {
      throw new Error('addPathToArea is not supported on web-ade yet.');
    },
    // Notes CRUD: stubbed for v1. Returning null signals "host couldn't
    // persist" — the overlay surfaces this gracefully.
    createSequenceNote: async () => null,
    updateSequenceNote: async () => null,
    deleteSequenceNote: async () => {},
  }), [actions, enhancedActions, sequenceRepoSplit]);

  // Memoize panels that use stable props to prevent unnecessary re-renders
  const stablePanels = useMemo(() => [
    {
      id: 'docs',
      label: 'Docs',
      icon: <BookOpen size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <AlexandriaDocsPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'ai-chat',
      label: 'AI Chat',
      icon: <MessageSquare size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <AIChatPanel
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai-sdk-panel uses older PanelContextValue type
            context={context as any}
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
      icon: <FileText size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <MarkdownPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'file-city',
      label: 'File City',
      icon: <Map size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'sequence-diagrams-list',
      label: 'Trails',
      icon: <Workflow size={16} strokeWidth={1.5} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <SharedSequenceDiagramsListPanel
            owner={sequenceRepoSplit?.owner ?? null}
            repo={sequenceRepoSplit?.repo ?? null}
            activeId={activeSequencePayload?.id ?? null}
            initialActivateId={initialWalkthroughId}
            onActivate={(payload) => {
              setActiveSequencePayload(payload);
              onWalkthroughChange?.(payload.id);
            }}
          />
        </div>
      ),
    },
    {
      id: 'file-city-explorer',
      label: 'File City Explorer',
      icon: <Map size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityExplorerPanel
            context={explorerContext}
            actions={explorerActions}
            events={events}
          />
        </div>
      ),
    },
    {
      id: 'repo-activity',
      label: 'Activity',
      icon: <Activity size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          {githubRepo && githubRepo.includes('/') ? (
            <RepositoryActivityFeedPanel
              owner={githubRepo.split('/')[0]!}
              repo={githubRepo.split('/')[1]!}
              events={events}
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: theme.colors.textMuted }}>
              No repository selected
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'kanban',
      label: 'Kanban',
      icon: <LayoutGrid size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <KanbanPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'task-detail',
      label: 'Task Detail',
      icon: <CheckSquare size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <TaskDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <Terminal size={16} />,
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
      icon: <Users size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <SessionsPanel />
        </div>
      ),
    },
    {
      id: 'visual-validation',
      label: 'Principal View',
      icon: <Compass size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <PrincipalViewPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'quality-hexagon',
      label: 'Code Quality',
      icon: <Shield size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <QualityHexagonPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'lens-debug',
      label: 'Lens Debug',
      icon: <Bug size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <LensDataDebugPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'git-changes',
      label: 'Git Changes',
      icon: <GitBranch size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitChangesPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'commit-history',
      label: 'Commit History',
      icon: <History size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitCommitHistoryPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'commit-detail',
      label: 'Commit Detail',
      icon: <GitCommit size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitCommitDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'packages',
      label: 'Packages',
      icon: <Package size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <PackageCompositionPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'github-messages',
      label: 'Conversation',
      icon: <MessageSquare size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubMessagesPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'skills-list',
      label: 'Skills',
      icon: <Zap size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <SkillsListPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'skill-detail',
      label: 'Skill Detail',
      icon: <Zap size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <SkillDetailPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'storyboard-list',
      label: 'Storyboards',
      icon: <BookOpen size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <StoryboardListPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'canvas-editor',
      label: 'Canvas Editor',
      icon: <Edit size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <CanvasEditorPanelLoader
            context={context}
            actions={enhancedActions}
            events={events}
            {...(selectedCanvasData && {
              canvasPath: selectedCanvasData.canvasPath,
              canvasName: selectedCanvasData.canvasName,
              canvasFileInfo: selectedCanvasData.canvasFileInfo,
            })}
            {...(selectedWorkflowData && {
              workflowTemplate: selectedWorkflowData.workflow,
              selectedWorkflowId: selectedWorkflowData.workflowId,
              workflowPath: selectedWorkflowData.workflowPath,
              workflowFileInfo: selectedWorkflowData.workflowFileInfo,
            })}
          />
        </div>
      ),
    },
    {
      id: 'trace-list',
      label: 'Traces',
      icon: <Activity size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <TraceListPanelLoader context={context} actions={enhancedActions} events={events} />
        </div>
      ),
    },
    {
      id: 'trace-details',
      label: 'Trace Details',
      icon: <Activity size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <TraceDetailsPanelLoader context={context} actions={enhancedActions} events={events} selectedTrace={selectedTrace} />
        </div>
      ),
    },
  ], [context, enhancedActions, events, theme.colors.textMuted, selectedCanvasData, selectedWorkflowData, selectedTrace, sequenceRepoSplit, activeSequencePayload, explorerContext, explorerActions, initialWalkthroughId, onWalkthroughChange]);

  // File editing panels - now use the standard panel framework pattern
  const fileEditingPanels = useMemo(() => [
    {
      id: 'file-editor',
      label: 'Files',
      icon: <File size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileEditorPanelLoader
            {...({
              context,
              actions: enhancedActions,
              events,
              // FileEditorPanel will use the active-file slice from context
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)}
          />
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

  // Check if current layout is in single-panel mode
  const currentConfig = layoutConfigs.find((c) => c.id === currentLayoutConfigId);
  const isSinglePanelMode = currentConfig?.singlePanelMode ?? false;

  // If in single-panel mode, render only the middle panel
  if (isSinglePanelMode) {
    const middlePanel = panels.find((p) => p.id === layout.middle);

    return (
      <div className="h-full w-full flex">
        {/* Layout Sidebar - Far Left */}
        <LayoutSidebar
          currentConfigId={currentLayoutConfigId}
          onConfigChange={handleLayoutConfigChange}
          collapsed={layoutSidebarCollapsed}
          onToggleCollapse={() => setLayoutSidebarCollapsed((prev: boolean) => !prev)}
          owner={repositoryInfo?.owner}
          badges={(triagedCount > 0) ? {
            'kanban': triagedCount,
          } : undefined}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          currentRepoId={githubRepo}
          layoutConfigs={filteredLayoutConfigs}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <EditorHeader
            currentLayoutConfigId={currentLayoutConfigId}
            leftCollapsed={leftSidebarCollapsed}
            rightCollapsed={rightSidebarCollapsed}
            onToggleLeft={handleToggleLeft}
            onToggleRight={handleToggleRight}
            onSwapRightPanels={() => setLayout(prev => ({ ...prev, middle: prev.right, right: prev.middle }))}
            pendingChangesCount={isLocalMode ? 0 : effectivePendingChangesCount}
            onCommitClick={() => setIsCommitModalOpen(true)}
            vimMode={vimMode}
            onVimModeToggle={handleVimModeToggle}
            selectedColorMode={selectedColorMode}
            onClearColorMode={clearColorMode}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onOpenWithMic={isSpeechSupported ? handleOpenWithMic : undefined}
          />

          {/* Single Panel Content */}
          <div className="flex-1 overflow-hidden relative">
            {/* Base panel (always rendered to maintain state) */}
            {middlePanel ? middlePanel.content : (
              <div className="h-full w-full flex items-center justify-center">
                <p style={{ color: theme.colors.textMuted }}>Panel not found</p>
              </div>
            )}

            {/* Overlay panel (shown on top when file is opened) */}
            {overlayPanelId && (() => {
              const overlayPanel = panels.find((p) => p.id === overlayPanelId);
              return overlayPanel ? (
                <div
                  className="absolute inset-0 flex flex-col"
                  style={{
                    background: theme.colors.background,
                    zIndex: 10,
                  }}
                >
                  {/* Overlay header with close button */}
                  <div
                    className="flex items-center justify-between px-4 py-2 border-b"
                    style={{
                      background: theme.colors.surface,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: theme.fonts.body,
                        fontSize: theme.fontSizes[2],
                        color: theme.colors.text,
                        fontWeight: 600,
                      }}
                    >
                      {overlayPanel.label}
                    </span>
                    <button
                      onClick={() => setOverlayPanelId(null)}
                      className="flex items-center justify-center hover:opacity-70 transition-opacity"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.colors.textMuted,
                        padding: '4px',
                      }}
                      title="Close and return to base view"
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L10 9.293l4.646-4.647a.5.5 0 0 1 .708.708L10.707 10l4.647 4.646a.5.5 0 0 1-.708.708L10 10.707l-4.646 4.647a.5.5 0 0 1-.708-.708L9.293 10 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </button>
                  </div>

                  {/* Overlay panel content */}
                  <div className="flex-1 overflow-hidden">
                    {overlayPanel.content}
                  </div>
                </div>
              ) : null;
            })()}
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

          {/* Toast Notification */}
          {toast && (
            <div
              className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom-2"
              style={{
                background: toast.type === 'error' ? theme.colors.error :
                           toast.type === 'success' ? theme.colors.success :
                           theme.colors.backgroundSecondary,
                color: toast.type === 'error' || toast.type === 'success' ? '#fff' : theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              {toast.type === 'error' && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7 4.5a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Zm1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
                </svg>
              )}
              <span style={{ fontSize: theme.fontSizes[1] }}>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                className="ml-2 opacity-70 hover:opacity-100"
                style={{ color: 'inherit' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L7 6.293l1.646-1.647a.5.5 0 0 1 .708.708L7.707 7l1.647 1.646a.5.5 0 0 1-.708.708L7 7.707l-1.646 1.647a.5.5 0 0 1-.708-.708L6.293 7 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex">
      {/* Layout Sidebar - Far Left */}
      <LayoutSidebar
        currentConfigId={currentLayoutConfigId}
        onConfigChange={handleLayoutConfigChange}
        collapsed={layoutSidebarCollapsed}
        onToggleCollapse={() => setLayoutSidebarCollapsed((prev: boolean) => !prev)}
        owner={repositoryInfo?.owner}
        badges={(triagedCount > 0) ? {
          'kanban': triagedCount,
        } : undefined}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        currentRepoId={githubRepo}
        layoutConfigs={filteredLayoutConfigs}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <EditorHeader
          currentLayoutConfigId={currentLayoutConfigId}
          leftCollapsed={leftSidebarCollapsed}
          rightCollapsed={rightSidebarCollapsed}
          onToggleLeft={handleToggleLeft}
          onToggleRight={handleToggleRight}
          onSwapRightPanels={() => setLayout(prev => ({ ...prev, middle: prev.right, right: prev.middle }))}
          pendingChangesCount={isLocalMode ? 0 : effectivePendingChangesCount}
          onCommitClick={() => setIsCommitModalOpen(true)}
          vimMode={vimMode}
          onVimModeToggle={handleVimModeToggle}
          selectedColorMode={selectedColorMode}
          onClearColorMode={clearColorMode}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenWithMic={isSpeechSupported ? handleOpenWithMic : undefined}
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
              collapsiblePanels={{
                left: true,
                right: true,
              }}
              collapsed={initialCollapsedRef.current}
              showCollapseButtons={false}
              mobileBreakpoint="(max-width: 768px)"
            />
          ) : (
            <EditableConfigurablePanelLayout
              ref={panelLayoutRef}
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
              collapsiblePanels={{
                left: true,
                right: true,
              }}
              collapsed={initialCollapsedRef.current}
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

        {/* Toast Notification */}
        {toast && (
          <div
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom-2"
            style={{
              background: toast.type === 'error' ? theme.colors.error :
                         toast.type === 'success' ? theme.colors.success :
                         theme.colors.backgroundSecondary,
              color: toast.type === 'error' || toast.type === 'success' ? '#fff' : theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {toast.type === 'error' && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7 4.5a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Zm1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
              </svg>
            )}
            <span style={{ fontSize: theme.fontSizes[1] }}>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 opacity-70 hover:opacity-100"
              style={{ color: 'inherit' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L7 6.293l1.646-1.647a.5.5 0 0 1 .708.708L7.707 7l1.647 1.646a.5.5 0 0 1-.708.708L7 7.707l-1.646 1.647a.5.5 0 0 1-.708-.708L6.293 7 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface EditorLayoutProps {
  githubRepo?: string;
  localAdapter?: LocalFileSystemAdapter | null;
  initialConfigId?: string;
  onConfigChange?: (configId: string) => void;
  /** Walkthrough id to auto-activate on first render (from `?walkthrough=`). */
  initialWalkthroughId?: string;
  /** Notified when the active walkthrough changes; the page mirrors this into the URL. */
  onWalkthroughChange?: (id: string | null) => void;
}

export function EditorLayout({ githubRepo, localAdapter: _localAdapter, initialConfigId, onConfigChange, initialWalkthroughId, onWalkthroughChange }: EditorLayoutProps = {}) {
  const { theme } = useTheme();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { adapter: localAdapter } = useLocalFileSystem();
  const isLocalMode = !!localAdapter;
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);

  // Calculate whether to auto-show tour for first-time visitors
  // Note: autoShowTour was removed from RepositoryPageProvider
  // Kept here for future implementation if needed
  // const autoShowTour = useMemo(() => {
  //   if (!githubRepo || !githubRepo.includes('/')) {
  //     return false;
  //   }
  //   const [owner, repo] = githubRepo.split('/');
  //   return !hasTourBeenShown(owner!, repo!);
  // }, [githubRepo]);

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
        {accessStatus !== 'not-found' && accessStatus !== 'loading' && <EditorHeader />}
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
      <RepositoryPageProvider
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
          initialWalkthroughId={initialWalkthroughId}
          onWalkthroughChange={onWalkthroughChange}
        />
      </RepositoryPageProvider>
    </div>
  );
}

interface EditorContextWrapperProps {
  initialConfigId?: string;
  onConfigChange?: (configId: string) => void;
  initialWalkthroughId?: string;
  onWalkthroughChange?: (id: string | null) => void;
}

/**
 * Wrapper component that provides AI contexts (WebLLM, Gemini) and manages
 * editor-level state including layout configuration.
 */
function EditorContextWrapper({ initialConfigId, onConfigChange, initialWalkthroughId, onWalkthroughChange }: EditorContextWrapperProps) {
  const { events, actions, context } = useRepositoryPageProvider();

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
  // Note: github-repositories slice is not available in RepositoryPageContextType
  // This would need to be fetched separately if needed
  const getRepositories = useCallback(() => {
    // RepositoryPageContextType doesn't include github-repositories slice
    return null;
  }, []);

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
            initialWalkthroughId={initialWalkthroughId}
            onWalkthroughChange={onWalkthroughChange}
          />
        </GeminiProvider>
      </WebLLMProvider>
    </PendingChangesProvider>
  );
}
