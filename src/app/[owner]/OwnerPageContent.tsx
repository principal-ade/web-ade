'use client';

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useRef, useCallback } from "react";
import { useOwnerPageProvider } from "@/contexts/OwnerPageProvider";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { Logo } from "@principal-ai/logo-component";
import { addRecentOwner, type OwnerInfo, OwnerRepositoriesPanel } from "@industry-theme/github-panels";
import { panels as principalViewPanels } from "@industry-theme/principal-view-panels";
import { panels as codeQualityPanels } from "@principal-ade/code-quality-panels";
import { CodeCityPanel } from "@industry-theme/file-city-panel";
import { PackageCompositionPanel, CollectionMapPanel } from "@industry-theme/repository-composition-panels";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeftRight,
  GitFork,
  Compass,
  Shield,
  Package,
  Map,
  Settings,
} from 'lucide-react';

// Static layout configurations (outside component to avoid recreation)
const defaultLayout: PanelLayout = {
  left: 'owner-repositories',
  middle: {
    type: 'tabs',
    panels: ['file-city', 'visual-validation'],
  },
  right: {
    type: 'tabs',
    panels: ['code-quality', 'package-composition'],
  },
};

const worldLayout: PanelLayout = {
  left: 'owner-repositories',
  middle: 'collection-map',
  right: {
    type: 'tabs',
    panels: ['file-city', 'visual-validation'],
  },
};

// Save owner with full GitHub metadata
async function saveRecentOwnerWithMetadata(owner: string) {
  if (typeof window === 'undefined') return;

  try {
    // Try fetching as user first
    let response = await fetch(`https://api.github.com/users/${owner}`);
    let ownerData = null;
    let ownerType: 'User' | 'Organization' = 'User';

    if (response.ok) {
      ownerData = await response.json();
      ownerType = ownerData.type === 'Organization' ? 'Organization' : 'User';
    } else {
      // If user fetch fails, try as organization
      response = await fetch(`https://api.github.com/orgs/${owner}`);
      if (response.ok) {
        ownerData = await response.json();
        ownerType = 'Organization';
      }
    }

    if (ownerData) {
      // Save to recent owners panel
      const ownerInfo: OwnerInfo = {
        id: ownerData.id,
        login: ownerData.login,
        avatar_url: ownerData.avatar_url,
        name: ownerData.name || null,
        bio: ownerData.bio || null,
        type: ownerType,
        public_repos: ownerData.public_repos,
        followers: ownerData.followers,
      };

      addRecentOwner(ownerInfo);
    }
  } catch (err) {
    console.error('Failed to save recent owner with metadata:', err);
  }
}

// Static imports for all panels (for type safety)
const OwnerRepositoriesPanelLoader = OwnerRepositoriesPanel;
const PrincipalViewPanelLoader = principalViewPanels[0]!.component;
const CodeQualityPanelLoader = codeQualityPanels[0]!.component;
const FileCityPanelLoader = CodeCityPanel;
const PackageCompositionPanelLoader = PackageCompositionPanel;
const CollectionMapPanelLoader = CollectionMapPanel;

export type ViewMode = 'default' | 'world';

export interface OwnerPageContentProps {
  owner: string;
  onPreviewChange?: (repo: string | null) => void;
  initialPreviewedRepo?: string | null;
}

export function OwnerPageContent({ owner, onPreviewChange, initialPreviewedRepo }: OwnerPageContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = useOwnerPageProvider();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(initialPreviewedRepo ?? null);
  const [canvasExists, setCanvasExists] = useState(false);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const canvasLoadedRef = useRef(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('default');

  const [layout, setLayout] = useState<PanelLayout>(defaultLayout);

  // Update layout when view mode changes
  useEffect(() => {
    setLayout(viewMode === 'world' ? worldLayout : defaultLayout);
  }, [viewMode]);

  // Notify parent when previewed repo changes
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    onPreviewChange?.(repo);
  }, [onPreviewChange]);

  // Save owner to recent history with full metadata
  useEffect(() => {
    saveRecentOwnerWithMetadata(owner);
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
  const fileTreeSlice = context.fileTree;
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
  const ownerReposSlice = context['owner-repositories'];
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
      icon: <GitFork size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <OwnerRepositoriesPanelLoader
            context={context}
            actions={actions}
            events={events}
            owner={owner}
            selectedRepository={previewedRepo ?? undefined}
            defaultShowSearch
          />
        </div>
      ),
    },
    {
      id: 'visual-validation',
      label: 'Architecture',
      icon: <Compass size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <PrincipalViewPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'code-quality',
      label: 'Quality',
      icon: <Shield size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <CodeQualityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'package-composition',
      label: 'Packages',
      icon: <Package size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <PackageCompositionPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'file-city',
      label: 'File City',
      icon: <Map size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'collection-map',
      label: 'World Map',
      icon: <Compass size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <CollectionMapPanelLoader
            context={context}
            actions={actions}
            events={events}
          />
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
    <div className="h-full w-full flex flex-col overflow-hidden">
        {/* Custom header with avatar button for sidebar */}
        <header
          className="grid grid-cols-3 items-center px-4 border-b relative z-50"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
            paddingBottom: '0.75rem',
          }}
        >
          {/* Left section: Logo and Owner info */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/"
              className="flex items-center transition-all hover:opacity-80"
              title="Home"
            >
              <Logo width={32} height={32} color={theme.colors.primary} />
            </Link>
            {/* Owner info */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Image
                src={`https://github.com/${owner}.png?size=64`}
                alt={owner}
                width={24}
                height={24}
                className="rounded-full"
              />
              <a
                href={`https://github.com/${owner}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontFamily: theme.fonts.body,
                  color: theme.colors.text,
                  textDecoration: 'none',
                }}
              >
                {owner}
              </a>
            </div>
            {/* Selected repository */}
            {previewedRepo && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span style={{ color: theme.colors.textMuted }}>/</span>
                <Link
                  href={`/${previewedRepo}`}
                  className="text-base font-semibold transition-opacity hover:opacity-80"
                  style={{
                    fontFamily: theme.fonts.body,
                    color: theme.colors.text,
                    textDecoration: 'none',
                  }}
                >
                  {previewedRepo.split('/')[1]}
                </Link>
                <Link
                  href={`/${previewedRepo}`}
                  className="px-2 py-0.5 rounded text-xs transition-all hover:opacity-80"
                  style={{
                    background: theme.colors.primary,
                    color: theme.colors.textOnPrimary,
                    textDecoration: 'none',
                  }}
                >
                  Open
                </Link>
              </div>
            )}
          </div>

          {/* Center: Mode Switch */}
          {!isMobile && (
            <div className="flex items-center justify-center">
              <div
                className="flex items-center rounded-lg p-0.5"
                style={{
                  background: theme.colors.backgroundTertiary,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <button
                  onClick={() => setViewMode('default')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all"
                  style={{
                    background: viewMode === 'default' ? theme.colors.surface : 'transparent',
                    color: viewMode === 'default' ? theme.colors.text : theme.colors.textSecondary,
                    boxShadow: viewMode === 'default' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                  title="Default repository view"
                >
                  <Settings size={14} />
                  <span className="hidden sm:inline">Default</span>
                </button>
                <button
                  onClick={() => setViewMode('world')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all"
                  style={{
                    background: viewMode === 'world' ? theme.colors.surface : 'transparent',
                    color: viewMode === 'world' ? theme.colors.text : theme.colors.textSecondary,
                    boxShadow: viewMode === 'world' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                  title="World map view of all repositories"
                >
                  <Compass size={14} />
                  <span className="hidden sm:inline">World</span>
                </button>
              </div>
            </div>
          )}

          {/* Right section: Panel controls and User menu */}
          <div className="flex items-center gap-3 flex-shrink-0 justify-end">
            {/* Panel collapse toggles */}
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setLeftCollapsed(!leftCollapsed)}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
                style={{
                  background: leftCollapsed ? theme.colors.primary : theme.colors.secondary,
                  color: theme.colors.textOnPrimary,
                }}
                title={leftCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              >
                {leftCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setLayout(prev => ({ ...prev, middle: prev.right, right: prev.middle }))}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
                style={{
                  background: theme.colors.secondary,
                  color: theme.colors.text,
                }}
                title="Swap middle and right panels"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRightCollapsed(!rightCollapsed)}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
                style={{
                  background: rightCollapsed ? theme.colors.primary : theme.colors.secondary,
                  color: theme.colors.textOnPrimary,
                }}
                title={rightCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              >
                {rightCollapsed ? (
                  <PanelRightOpen className="w-4 h-4" />
                ) : (
                  <PanelRightClose className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* User Avatar Menu */}
            <UserAvatarMenu />
          </div>
        </header>
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

        {/* Global Command Palette (Cmd+Shift+P) */}
        <GlobalCommandPalette events={events} />
    </div>
  );
}
