'use client';

import { useParams, useSearchParams, useRouter } from "next/navigation";
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
  () => import('@industry-theme/github-panels').then((mod) => mod.OwnerRepositoriesPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// Dynamically import the PrincipalViewGraphPanel with SSR disabled
const PrincipalViewPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
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

// Dynamically import the CodeCityPanel with SSR disabled
const CodeCityPanelLoader = dynamic(
  () => import('@industry-theme/code-city-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the PackageCompositionPanel with SSR disabled
const PackageCompositionPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.PackageCompositionPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

interface OwnerPageContentProps {
  owner: string;
  onPreviewChange?: (repo: string | null) => void;
  initialPreviewedRepo?: string | null;
}

function OwnerPageContent({ owner, onPreviewChange, initialPreviewedRepo }: OwnerPageContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(initialPreviewedRepo ?? null);
  const [canvasExists, setCanvasExists] = useState(false);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const canvasLoadedRef = useRef(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Layout matching collection view
  const layout: PanelLayout = {
    left: 'owner-repositories',
    middle: {
      type: 'tabs',
      panels: ['code-city', 'visual-validation'],
    },
    right: {
      type: 'tabs',
      panels: ['code-quality', 'package-composition'],
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

  // Load initial repo data if provided via URL
  useEffect(() => {
    if (!initialPreviewedRepo || !actions) return;

    const parts = initialPreviewedRepo.split('/');
    const repoOwner = parts[0];
    const repo = parts[1];
    if (repoOwner && repo) {
      (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(repoOwner, repo);
      checkForCanvas(repoOwner, repo);
    }
  }, [initialPreviewedRepo, actions, checkForCanvas]);

  // Auto-select first repository when repositories are loaded
  const ownerReposSlice = context.getSlice('owner-repositories');
  const ownerReposData = ownerReposSlice?.data as { repositories?: Array<{ full_name: string }> } | undefined;
  const ownerReposLoading = ownerReposSlice?.loading ?? true;

  useEffect(() => {
    if (!events || ownerReposLoading || previewedRepo) return;

    const repositories = ownerReposData?.repositories;
    if (repositories && repositories.length > 0) {
      const firstRepo = repositories[0];
      if (firstRepo?.full_name) {
        // Emit repository:preview event for the first repository
        events.emit({
          type: 'repository:preview',
          source: 'owner-page-auto-select',
          timestamp: Date.now(),
          payload: {
            repository: firstRepo,
          },
        });
      }
    }
  }, [events, ownerReposLoading, ownerReposData?.repositories, previewedRepo]);

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
            selectedRepository={previewedRepo}
          />
        </div>
      ),
    },
    {
      id: 'visual-validation',
      label: 'Architecture',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PrincipalViewPanelLoader context={context} actions={actions} events={events} />
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
      id: 'package-composition',
      label: 'Packages',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PackageCompositionPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'code-city',
      label: 'File City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <CodeCityPanelLoader context={context} actions={actions} events={events} />
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
        selectedRepository={previewedRepo}
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

    </div>
  );
}

function OwnerPageWrapper({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(() => {
    // Initialize from URL query param
    return searchParams.get('project');
  });

  // Update URL when previewed repo changes
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    const params = new URLSearchParams(searchParams.toString());
    if (repo) {
      params.set('project', repo);
    } else {
      params.delete('project');
    }
    router.replace(`/${owner}?${params.toString()}`, { scroll: false });
  }, [owner, router, searchParams]);

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
        <OwnerPageContent owner={owner} onPreviewChange={handlePreviewChange} initialPreviewedRepo={previewedRepo} />
      </PanelProvider>
    </div>
  );
}

export default function OwnerPage() {
  const params = useParams();
  const owner = params.owner as string;

  return <OwnerPageWrapper owner={owner} />;
}
