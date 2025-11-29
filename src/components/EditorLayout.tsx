'use client';

import {
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
  EditableConfigurablePanelLayout,
  CommandPalette,
  useCommandPalette,
  getPanelCommands,
} from '@principal-ade/panel-layouts';
import type { Command, CommandContext, PanelSlotId } from '@principal-ade/panel-layouts';
import { getGlobalToolRegistry, globalPanelRegistry } from '@principal-ade/panel-framework-core';
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
import { layoutConfigs, LayoutConfig } from './LayoutConfigDropdown';
import { AIChatPanel } from './AIChatPanel';
import '@principal-ade/panel-layouts/styles.css';
import '@principal-ade/industry-themed-ai-sdk/styles.css';
import '@industry-theme/visual-validation-panel/dist/panels.bundle.css';
import { useAuth } from '@/contexts/AuthContext';
import { ExternalLink } from 'lucide-react';

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

// Dynamically import the CodeCityPanel with SSR disabled
const CodeCityPanelLoader = dynamic(
  () => import('@industry-theme/code-city-panel').then((mod) => {
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

// Dynamically import the VisualValidationPanel with SSR disabled
const VisualValidationPanelLoader = dynamic(
  () => import('@industry-theme/visual-validation-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitHubProjectsPanel with SSR disabled
const GitHubProjectsPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the GitHubSearchPanel with SSR disabled
const GitHubSearchPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

type ViewMode = 'editor' | 'kanban' | 'visual-validation' | 'github-projects';
function EditorLayoutContent() {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const { login, isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [currentLayoutConfigId, setCurrentLayoutConfigId] = useState('default');
  const currentLayoutConfig = layoutConfigs.find((c) => c.id === currentLayoutConfigId) || layoutConfigs[0]!;
  const [layout, setLayout] = useState<PanelLayout>(currentLayoutConfig.layout);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(currentLayoutConfig.collapsed.left);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(currentLayoutConfig.collapsed.right);
  const [isMobile, setIsMobile] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<PanelSlotId | null>('middle');
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);

  // Register panel tools from external panel packages
  useEffect(() => {
    const registry = getGlobalToolRegistry();

    // Dynamically import github-panels metadata and register tools
    import('@industry-theme/github-panels').then((mod) => {
      // GitHub Projects panel has tools defined
      const githubProjectsPanel = mod.panels[0];
      if (githubProjectsPanel?.metadata?.tools) {
        registry.registerPanelTools(githubProjectsPanel.metadata);
        console.log(
          '[EditorLayout] Registered GitHub panel tools:',
          githubProjectsPanel.metadata.tools.length
        );
      }
    });

    // Layout tools are registered via utcp-panel-event in PanelContext

    return () => {
      // Cleanup on unmount
      registry.unregisterPanelTools('github-projects');
    };
  }, []);

  // Handle layout configuration change
  const handleLayoutConfigChange = useCallback((config: LayoutConfig) => {
    setCurrentLayoutConfigId(config.id);
    setLayout(config.layout);

    // Special handling for github-search config when user is not authenticated
    // Collapse left sidebar (github-projects needs auth) for 50/50 split of middle (search) and right (preview)
    if (config.id === 'github-search' && !isAuthenticated) {
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(false);
    } else {
      setLeftSidebarCollapsed(config.collapsed.left);
      setRightSidebarCollapsed(config.collapsed.right);
    }
    // Reset to editor view when changing layout config
    setViewMode('editor');
  }, [isAuthenticated]);

  // Create command context for the command palette
  const commandContext = useMemo<CommandContext>(
    () => ({
      panelContext: context,
      actions,
      events,
      focusedPanel,
      setFocus: setFocusedPanel,
      closeCommandPalette: () => {}, // Will be set by useCommandPalette
    }),
    [context, actions, events, focusedPanel]
  );

  // Custom commands for view mode and repository switching
  const customCommands = useMemo<Command[]>(
    () => [
      {
        id: 'view.switch-to-kanban',
        label: 'Switch to Kanban View',
        description: 'Open the Kanban board for task management',
        icon: '📋',
        category: 'View',
        keywords: ['kanban', 'board', 'tasks', 'view', 'switch'],
        priority: 90,
        execute: () => {
          setViewMode('kanban');
        },
        isAvailable: () => viewMode !== 'kanban',
      },
      {
        id: 'view.switch-to-editor',
        label: 'Switch to Editor View',
        description: 'Open the documentation editor',
        icon: '📝',
        category: 'View',
        keywords: ['editor', 'docs', 'markdown', 'view', 'switch'],
        priority: 90,
        execute: () => {
          setViewMode('editor');
        },
        isAvailable: () => viewMode !== 'editor',
      },
      {
        id: 'view.switch-to-visual-validation',
        label: 'Switch to Visual Validation View',
        description: 'Open the visual validation graph viewer',
        icon: '🕸️',
        category: 'View',
        keywords: ['visual', 'validation', 'graph', 'vvf', 'config', 'view', 'switch'],
        priority: 90,
        execute: () => {
          setViewMode('visual-validation');
        },
        isAvailable: () => viewMode !== 'visual-validation',
      },
      {
        id: 'view.switch-to-github-projects',
        label: 'Switch to GitHub Projects View',
        description: 'Browse and select GitHub repositories',
        icon: '🐙',
        category: 'View',
        keywords: ['github', 'projects', 'repositories', 'repos', 'view', 'switch'],
        priority: 90,
        execute: () => {
          setViewMode('github-projects');
        },
        isAvailable: () => viewMode !== 'github-projects',
      },
      {
        id: 'repository.switch',
        label: 'Switch Repository',
        description: 'Open a different GitHub repository',
        icon: '🔀',
        category: 'Repository',
        keywords: ['repository', 'repo', 'switch', 'change', 'github', 'project'],
        priority: 85,
        execute: (ctx) => {
          ctx.events?.emit({
            type: 'repository:open-switcher',
            source: 'command-palette',
            timestamp: Date.now(),
            payload: {},
          });
        },
      },
    ],
    [viewMode]
  );

  // Initialize command palette with panel commands
  const commandPalette = useCommandPalette({
    context: commandContext,
    commands: getPanelCommands(),
  });

  // Register custom commands (and update when they change)
  const { registerCommands, unregisterCommands } = commandPalette;
  useEffect(() => {
    const commandIds = customCommands.map((c) => c.id);
    registerCommands(customCommands);

    return () => {
      unregisterCommands(commandIds);
    };
  }, [customCommands, registerCommands, unregisterCommands]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
          right: 'code-city',
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
          window.location.href = `/editor/${payload.repository.full_name}`;
        }
      }),
      events.on('repository:preview', (event) => {
        const payload = event.payload as { repository: { full_name: string; owner: { login: string }; name: string } };
        if (payload?.repository?.full_name) {
          const parts = payload.repository.full_name.split('/');
          const owner = parts[0];
          const repo = parts[1];
          if (owner && repo) {
            // Store the previewed repo for the "Open" button
            setPreviewedRepo(payload.repository.full_name);
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
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [events, login, actions, layout, leftSidebarCollapsed, rightSidebarCollapsed]);

  // Sync layout and collapsed state when view mode changes (for special views)
  useEffect(() => {
    if (viewMode === 'kanban') {
      setLayout({
        left: 'docs',
        middle: 'kanban',
        right: 'sessions',
      });
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(true);
    } else if (viewMode === 'visual-validation') {
      setLayout({
        left: 'docs',
        middle: 'visual-validation',
        right: 'sessions',
      });
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(true);
    } else if (viewMode === 'github-projects') {
      setLayout({
        left: 'docs',
        middle: 'github-projects',
        right: 'sessions',
      });
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(true);
    } else if (viewMode === 'editor') {
      // Editor mode: restore layout from current config
      setLayout(currentLayoutConfig.layout);
      setLeftSidebarCollapsed(currentLayoutConfig.collapsed.left);
      setRightSidebarCollapsed(currentLayoutConfig.collapsed.right);
    }
  }, [viewMode, currentLayoutConfig]);

  const panels = [
    {
      id: 'docs',
      label: 'Docs',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AlexandriaDocsPanelLoader context={context} actions={actions} events={events} />
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
            actions={actions}
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
          <MarkdownPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'code-city',
      label: 'Code City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <CodeCityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'kanban',
      label: 'Kanban',
      content: (
        <div className="h-full w-full overflow-hidden">
          <KanbanPanelLoader context={context} actions={actions} events={events} />
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
      label: 'Visual Validation',
      content: (
        <div className="h-full w-full overflow-hidden">
          <VisualValidationPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'github-projects',
      label: 'GitHub Projects',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubProjectsPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'github-search',
      label: 'GitHub Search',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubSearchPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <EditorHeader
        currentLayoutConfigId={currentLayoutConfigId}
        onLayoutConfigChange={handleLayoutConfigChange}
        leftCollapsed={leftSidebarCollapsed}
        rightCollapsed={rightSidebarCollapsed}
        onToggleLeft={() => setLeftSidebarCollapsed(prev => !prev)}
        onToggleRight={() => setRightSidebarCollapsed(prev => !prev)}
      />
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

      {/* Open Repository Button - shows when previewing a repo */}
      {previewedRepo && (
        <button
          onClick={() => {
            window.location.href = `/editor/${previewedRepo}`;
          }}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transition-all hover:scale-105 z-50"
          style={{
            background: theme.colors.primary,
            color: theme.colors.background,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          <ExternalLink size={18} />
          Open {previewedRepo.split('/')[1]}
        </button>
      )}

      {/* Command Palette */}
      <CommandPalette
        commandPalette={commandPalette}
        context={commandContext}
      />

      {/* Repository Selection Modal */}
      <RepoSelectionModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
      />
    </div>
  );
}

interface EditorLayoutProps {
  githubRepo?: string;
}

export function EditorLayout({ githubRepo }: EditorLayoutProps = {}) {
  const { theme } = useTheme();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
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

  if (accessStatus !== 'granted') {
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
        <WebLLMWrapper />
      </PanelProvider>
    </div>
  );
}

/**
 * Wrapper component that provides WebLLM context with access to panel events/actions
 * and injects markdown file context for the AI assistant.
 */
function WebLLMWrapper() {
  const { events, actions, context } = usePanelProvider();

  // Get markdown files from context to provide to the AI
  const markdownSlice = context.getSlice<Array<{ path: string; title?: string }>>('markdown');
  const markdownFiles = markdownSlice?.data?.map((f) => ({
    path: f.path,
    title: f.title,
  }));

  // Get repository info for file fetching - use the full owner/repo path
  const githubRepo = (context.currentScope.repository as { githubRepo?: string })?.githubRepo
    || context.currentScope.repository?.path;

  // Function to fetch file content for READ_FILE action
  const fetchFileContent = useCallback(async (filePath: string): Promise<string | null> => {
    if (!githubRepo || !githubRepo.includes('/')) {
      console.warn('[WebLLMWrapper] No valid repository available for file fetch:', githubRepo);
      return null;
    }

    try {
      const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const [owner, name] = githubRepo.split('/');

      console.log('[WebLLMWrapper] Fetching file content:', cleanPath, 'from', githubRepo);

      const response = await fetch(
        `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(cleanPath)}`
      );

      if (!response.ok) {
        console.error('[WebLLMWrapper] Failed to fetch file:', response.statusText);
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
      console.error('[WebLLMWrapper] Error fetching file:', err);
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

  return (
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
      >
        <EditorLayoutContent />
      </GeminiProvider>
    </WebLLMProvider>
  );
}
