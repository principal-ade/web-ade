'use client';

import { useParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useRef, useCallback } from "react";
import { PanelProvider, usePanelProvider } from "@/contexts/PanelContext";
import { EditorHeader } from "@/components/EditorHeader";
import dynamic from "next/dynamic";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import { ExternalLink } from 'lucide-react';

const RECENT_OWNERS_KEY = 'recent-owners';
const MAX_RECENT_ITEMS = 10;

interface RecentOwner {
  owner: string;
  visitedAt: string;
}

function saveRecentOwner(owner: string) {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(RECENT_OWNERS_KEY);
    const owners: RecentOwner[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry for this owner if present
    const filtered = owners.filter(o => o.owner !== owner);

    // Add to front with current timestamp
    filtered.unshift({
      owner,
      visitedAt: new Date().toISOString(),
    });

    // Keep only the most recent items
    const trimmed = filtered.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_OWNERS_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save recent owner:', err);
  }
}

// Dynamically import the OwnerRepositoriesPanel with SSR disabled
const OwnerRepositoriesPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[2]!.component as React.ComponentType<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the MarkdownPanel with SSR disabled
const MarkdownPanelLoader = dynamic(
  () => import('@industry-theme/markdown-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the VisualValidationGraphPanel with SSR disabled
const VisualValidationPanelLoader = dynamic(
  () => import('@industry-theme/visual-validation-panel').then((mod) => {
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

// Dynamically import the ConfigLibraryBrowserPanel with SSR disabled
const ConfigLibraryBrowserPanelLoader = dynamic(
  () => import('@industry-theme/visual-validation-panel').then((mod) => {
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the QualityHexagonPanel with SSR disabled
const CodeQualityPanelLoader = dynamic(
  () => import('@principal-ade/code-quality-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

interface OwnerPageContentProps {
  owner: string;
  onPreviewChange?: (repo: string | null) => void;
}

function OwnerPageContent({ owner, onPreviewChange }: OwnerPageContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);
  const [canvasExists, setCanvasExists] = useState(false);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const canvasLoadedRef = useRef(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);

  // Layout with tabbed middle panel for Preview and Architecture
  // and tabbed right panel for Docs, Configs, and Quality
  const layout: PanelLayout = {
    left: 'owner-repositories',
    middle: {
      type: 'tabs',
      panels: ['markdown-viewer', 'visual-validation'],
    },
    right: {
      type: 'tabs',
      panels: ['alexandria-docs', 'config-library', 'code-quality'],
    },
  };

  // Notify parent when previewed repo changes
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    onPreviewChange?.(repo);
  }, [onPreviewChange]);

  // Save owner to recent history
  useEffect(() => {
    saveRecentOwner(owner);
  }, [owner]);

  // Check if .vgc/architecture.canvas exists when a repo is previewed
  const checkForCanvas = useCallback(async (repoOwner: string, repoName: string) => {
    setCanvasLoading(true);
    canvasLoadedRef.current = false;

    try {
      const canvasResponse = await fetch(
        `/api/github/repo/${repoOwner}/${repoName}?action=file&path=${encodeURIComponent('.vgc/architecture.canvas')}`
      );
      setCanvasExists(canvasResponse.ok);
    } catch (err) {
      console.error('[OwnerPage] Failed to check for architecture.canvas:', err);
      setCanvasExists(false);
    } finally {
      setCanvasLoading(false);
    }
  }, []);

  // Auto-load architecture.canvas when panel is ready and canvas exists
  // Wait for fileTree to be loaded before emitting the config selection event
  const fileTreeSlice = context.getSlice('fileTree');
  const fileTreeLoading = fileTreeSlice?.loading ?? true;

  useEffect(() => {
    if (!canvasExists || canvasLoading || canvasLoadedRef.current || !previewedRepo || fileTreeLoading) return;

    const [repoOwner, repoName] = previewedRepo.split('/');
    if (!repoOwner || !repoName) return;

    const configPath = `.vgc/architecture.canvas`;

    // Small delay to ensure the visual validation panel is mounted and ready
    const timer = setTimeout(() => {
      console.log('[OwnerPage] Emitting vv:config:selected for:', configPath);
      events.emit({
        type: 'vv:config:selected',
        source: 'owner-page',
        timestamp: Date.now(),
        payload: {
          configId: 'architecture',
          configPath: `/GitHub/${repoOwner}/${repoName}/${configPath}`,
          configName: 'Architecture'
        }
      });
      canvasLoadedRef.current = true;
    }, 500);

    return () => clearTimeout(timer);
  }, [canvasExists, canvasLoading, events, previewedRepo, fileTreeLoading]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Listen for repository preview events
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      events.on('repository:preview', (event) => {
        const payload = event.payload as { repository: { full_name: string } };
        if (payload?.repository?.full_name) {
          const parts = payload.repository.full_name.split('/');
          const repoOwner = parts[0];
          const repo = parts[1];
          if (repoOwner && repo) {
            handlePreviewChange(payload.repository.full_name);
            (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(repoOwner, repo);
            // Check if this repo has an architecture.canvas file
            checkForCanvas(repoOwner, repo);
          }
        }
      }),
      events.on('repository:selected', (event) => {
        const payload = event.payload as { repository: { full_name: string } };
        if (payload?.repository?.full_name) {
          window.location.href = `/${payload.repository.full_name}`;
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, actions, checkForCanvas, handlePreviewChange]);

  const panels = [
    {
      id: 'owner-repositories',
      label: 'Repositories',
      content: (
        <div className="h-full w-full overflow-hidden">
          <OwnerRepositoriesPanelLoader
            context={context}
            actions={actions}
            events={events}
            owner={owner}
          />
        </div>
      ),
    },
    {
      id: 'visual-validation',
      label: 'Architecture',
      content: (
        <div className="h-full w-full overflow-hidden">
          <VisualValidationPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'markdown-viewer',
      label: 'Preview',
      content: (
        <div className="h-full w-full overflow-hidden">
          <MarkdownPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'alexandria-docs',
      label: 'Docs',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AlexandriaDocsPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'config-library',
      label: 'Configs',
      content: (
        <div className="h-full w-full overflow-hidden">
          <ConfigLibraryBrowserPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'code-quality',
      label: 'Quality',
      content: (
        <div className="h-full w-full overflow-hidden">
          <CodeQualityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <EditorHeader
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
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
              right: 15,
            }}
            collapsiblePanels={{
              left: true,
              right: true,
            }}
            collapsed={{
              left: leftCollapsed,
              right: rightCollapsed,
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
            defaultSizes={{
              left: 25,
              middle: 50,
              right: 25,
            }}
            minSizes={{
              left: 15,
              middle: 30,
              right: 15,
            }}
            collapsiblePanels={{
              left: true,
              right: true,
            }}
            collapsed={{
              left: leftCollapsed,
              right: rightCollapsed,
            }}
            showCollapseButtons={false}
          />
        )}
      </div>

      {/* Open Repository Button - shows when previewing a repo */}
      {previewedRepo && (
        <button
          onClick={() => {
            window.location.href = `/${previewedRepo}`;
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
    </div>
  );
}

function OwnerPageWrapper({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <PanelProvider
        workspace={{
          name: 'web-ade',
          path: '/workspace',
        }}
        repository={{
          name: previewedRepo ? previewedRepo.split('/')[1] || owner : owner,
          path: previewedRepo ? `/GitHub/${previewedRepo}` : `/workspace/${owner}`,
        }}
        githubRepo={previewedRepo || undefined}
        initialOwner={owner}
      >
        <OwnerPageContent owner={owner} onPreviewChange={setPreviewedRepo} />
      </PanelProvider>
    </div>
  );
}

export default function OwnerPage() {
  const params = useParams();
  const owner = params.owner as string;

  return <OwnerPageWrapper owner={owner} />;
}
