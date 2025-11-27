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
import { useTheme } from '@principal-ade/industry-theme';
import { ThemedAIChatPanel } from '@principal-ade/industry-themed-ai-sdk/components';
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';
import { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { EditorHeader } from './EditorHeader';
import { SessionsPanel } from './SessionsPanel';
import { AccessNotice, AccessStatus } from './AccessNotice';
import { RepoSelectionModal } from './RepoSelectionModal';
import '@principal-ade/panel-layouts/styles.css';
import '@principal-ade/industry-themed-ai-sdk/styles.css';
import '@industry-theme/visual-validation-panel/dist/panels.bundle.css';
import { useAuth } from '@/contexts/AuthContext';

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

type ViewMode = 'editor' | 'kanban' | 'visual-validation' | 'github-projects';
function EditorLayoutContent() {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const { login } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [layout, setLayout] = useState<PanelLayout>({
    left: 'docs',
    middle: 'markdown-viewer',
    right: 'code-city',
  });
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<PanelSlotId | null>('middle');
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);

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
        const payload = event.payload as { panelId?: string };
        if (payload.panelId === 'left') {
          setLeftSidebarCollapsed((prev) => !prev);
        } else if (payload.panelId === 'right') {
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
      events.on('github:login-requested', () => {
        login();
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [events, login]);

  // Handler functions for panel controls
  const handleToggleLeftSidebar = useCallback(() => {
    setLeftSidebarCollapsed((prev) => !prev);
  }, []);

  const handleToggleRightSidebar = useCallback(() => {
    setRightSidebarCollapsed((prev) => !prev);
  }, []);

  const handleSwitchLeftMiddlePanels = useCallback(() => {
    setLayout((prev) => ({
      left: prev.middle,
      middle: prev.left,
      right: prev.right,
    }));
  }, []);

  const handleSwitchRightMiddlePanels = useCallback(() => {
    setLayout((prev) => ({
      left: prev.left,
      middle: prev.right,
      right: prev.middle,
    }));
  }, []);

  const handleConfigurePanels = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  // Sync layout and collapsed state when view mode changes
  useEffect(() => {
    if (viewMode === 'kanban') {
      // Kanban mode: kanban in middle, sessions on right, sidebars collapsed
      setLayout({
        left: 'docs',
        middle: 'kanban',
        right: 'sessions',
      });
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(true);
    } else if (viewMode === 'visual-validation') {
      // Visual Validation mode: visual-validation graph in middle, sidebars collapsed
      setLayout({
        left: 'docs',
        middle: 'visual-validation',
        right: 'sessions',
      });
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(true);
    } else if (viewMode === 'github-projects') {
      // GitHub Projects mode: github-projects in middle, sidebars collapsed
      setLayout({
        left: 'docs',
        middle: 'github-projects',
        right: 'sessions',
      });
      setLeftSidebarCollapsed(true);
      setRightSidebarCollapsed(true);
    } else {
      // Editor mode: original layout with markdown in middle, code-city on right
      setLayout({
        left: 'docs',
        middle: 'markdown-viewer',
        right: 'code-city',
      });
      setLeftSidebarCollapsed(false);
      setRightSidebarCollapsed(false);
    }
  }, [viewMode]);

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
          <ThemedAIChatPanel
            context={context}
            actions={actions}
            events={events}
            api="/api/chat"
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
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <EditorHeader
        leftSidebarCollapsed={leftSidebarCollapsed}
        rightSidebarCollapsed={rightSidebarCollapsed}
        onToggleLeftSidebar={handleToggleLeftSidebar}
        onToggleRightSidebar={handleToggleRightSidebar}
        onSwitchLeftMiddlePanels={handleSwitchLeftMiddlePanels}
        onSwitchRightMiddlePanels={handleSwitchRightMiddlePanels}
        onConfigurePanels={handleConfigurePanels}
        isEditMode={isEditMode}
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
            isEditMode={isEditMode}
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
        <EditorLayoutContent />
      </PanelProvider>
    </div>
  );
}
