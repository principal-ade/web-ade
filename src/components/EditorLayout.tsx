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
import { layoutConfigs, LayoutConfig } from './LayoutConfigDropdown';
import { AIChatPanel } from './AIChatPanel';
import '@principal-ade/panel-layouts/styles.css';
import '@principal-ade/industry-themed-ai-sdk-panel/styles.css';
// CSS removed from principal-view-panels exports - styles now bundled in JS
import { useAuth } from '@/contexts/AuthContext';
import { useGemini } from '@/contexts/GeminiContext';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@principal-ade/industry-theme';

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

// Dynamically import the PrincipalViewPanel (Graph) with SSR disabled
const PrincipalViewPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
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
  () => import('@industry-theme/file-editing-panels').then((mod) => ({
    default: mod.FileEditorPanel,
  })),
  { ssr: false }
);

type ViewMode = 'editor' | 'kanban' | 'visual-validation';
interface EditorLayoutContentProps {
  layout: PanelLayout;
  setLayout: React.Dispatch<React.SetStateAction<PanelLayout>>;
  leftSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  currentLayoutConfigId: string;
  setCurrentLayoutConfigId: React.Dispatch<React.SetStateAction<string>>;
}

function EditorLayoutContent({
  layout,
  setLayout,
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  rightSidebarCollapsed,
  setRightSidebarCollapsed,
  currentLayoutConfigId,
  setCurrentLayoutConfigId,
}: EditorLayoutContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const { login } = useAuth();
  const { setTheme, setColor, resetColor, resetAllColors } = useGlobalTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const currentLayoutConfig = layoutConfigs.find((c) => c.id === currentLayoutConfigId) || layoutConfigs[0]!;
  const [isMobile, setIsMobile] = useState(false);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // Get repository info for file fetching
  const githubRepo = (context.currentScope.repository as { githubRepo?: string })?.githubRepo
    || context.currentScope.repository?.path;

  // Create a file content provider for the FileEditorPanel
  const fileContentProvider = useMemo(() => ({
    readFile: async (filePath: string): Promise<string | null> => {
      if (!githubRepo || !githubRepo.includes('/')) {
        console.warn('[FileEditorPanel] No valid repository available for file fetch:', githubRepo);
        return null;
      }

      try {
        const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
        const [owner, name] = githubRepo.split('/');

        const response = await fetch(
          `/api/github/repo/${owner}/${name}?action=file&path=${encodeURIComponent(cleanPath)}`
        );

        if (!response.ok) {
          console.error('[FileEditorPanel] Failed to fetch file:', response.statusText);
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
        console.error('[FileEditorPanel] Error fetching file:', err);
        return null;
      }
    },
    // GitHub API is read-only for web-ade, so no writeFile
  }), [githubRepo]);

  // Handle layout configuration change
  const handleLayoutConfigChange = useCallback((config: LayoutConfig) => {
    setCurrentLayoutConfigId(config.id);
    setLayout(config.layout);
    setLeftSidebarCollapsed(config.collapsed.left);
    setRightSidebarCollapsed(config.collapsed.right);
    // Reset to editor view when changing layout config
    setViewMode('editor');
  }, [setCurrentLayoutConfigId, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed]);

  // Initialize Agent Command Palette (AI-driven, Cmd+Shift+P to open)
  const { sendMessage } = useGemini();
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
    ],
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
      // File editor events - open files in the editor panel
      events.on('file:open', (event) => {
        const payload = event.payload as { path?: string; filePath?: string };
        const filePath = payload.path || payload.filePath;
        if (filePath) {
          setSelectedFilePath(filePath);
          // If the file-editor panel is not currently visible, switch to it
          if (layout.middle !== 'file-editor') {
            setLayout((prev) => ({
              ...prev,
              middle: 'file-editor',
            }));
          }
        }
      }),
      events.on('file:close', () => {
        setSelectedFilePath(null);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [events, login, actions, layout, leftSidebarCollapsed, rightSidebarCollapsed, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed, setTheme, setColor, resetColor, resetAllColors, setSelectedFilePath]);

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
    } else if (viewMode === 'editor') {
      // Editor mode: restore layout from current config
      setLayout(currentLayoutConfig.layout);
      setLeftSidebarCollapsed(currentLayoutConfig.collapsed.left);
      setRightSidebarCollapsed(currentLayoutConfig.collapsed.right);
    }
  }, [viewMode, currentLayoutConfig, setLayout, setLeftSidebarCollapsed, setRightSidebarCollapsed]);

  // Memoize panels that don't depend on selectedFilePath to prevent unnecessary re-renders
  const stablePanels = useMemo(() => [
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
      id: 'file-city',
      label: 'File City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={actions} events={events} />
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
      label: 'Principal View',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PrincipalViewPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'quality-hexagon',
      label: 'Code Quality',
      content: (
        <div className="h-full w-full overflow-hidden">
          <QualityHexagonPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'theme-editor',
      label: 'Theme Editor',
      content: (
        <div className="h-full w-full overflow-hidden">
          <ThemeEditorPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'event-bus',
      label: 'Event Bus',
      content: (
        <div className="h-full w-full overflow-hidden">
          <EventBusPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'agent-tools',
      label: 'Agent Tools',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AgentToolsPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'git-changes',
      label: 'Git Changes',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitChangesPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
  ], [context, actions, events, theme.colors.textMuted]);

  // File editor panel needs selectedFilePath, so it's memoized separately
  const fileEditorPanel = useMemo(() => ({
    id: 'file-editor',
    label: 'File Editor',
    content: (
      <div className="h-full w-full overflow-hidden">
        <FileEditorPanelLoader
          filePath={selectedFilePath}
          contentProvider={fileContentProvider}
          source={{ type: 'remote' }}
          readOnly={true}
          onClose={() => setSelectedFilePath(null)}
        />
      </div>
    ),
  }), [selectedFilePath, fileContentProvider, setSelectedFilePath]);

  // Combine stable panels with file editor panel
  const panels = useMemo(() => [...stablePanels, fileEditorPanel], [stablePanels, fileEditorPanel]);

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
        <EditorContextWrapper />
      </PanelProvider>
    </div>
  );
}

/**
 * Wrapper component that provides AI contexts (WebLLM, Gemini) and manages
 * editor-level state including layout configuration.
 */
function EditorContextWrapper() {
  const { events, actions, context } = usePanelProvider();

  // Layout state - lifted here so GeminiProvider can access it
  const [currentLayoutConfigId, setCurrentLayoutConfigId] = useState('default');
  const currentLayoutConfig = layoutConfigs.find((c) => c.id === currentLayoutConfigId) || layoutConfigs[0]!;
  const [layout, setLayout] = useState<PanelLayout>(currentLayoutConfig.layout);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(currentLayoutConfig.collapsed.left);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(currentLayoutConfig.collapsed.right);

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
          setCurrentLayoutConfigId={setCurrentLayoutConfigId}
        />
      </GeminiProvider>
    </WebLLMProvider>
  );
}
