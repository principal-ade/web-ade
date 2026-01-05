'use client';

import Link from "next/link";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePanelProvider } from "@/contexts/PanelContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { Logo } from "@principal-ai/logo-component";
import { iconMap } from "@/components/collections/CollectionModal";
import dynamic from "next/dynamic";
import { addRecentOwner, type OwnerInfo } from "@industry-theme/github-panels";
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
  Clock,
  FolderOpen,
  GitFork,
  User,
  Library,
  ArrowRight,
  X,
  Home,
  Star,
  Users,
} from 'lucide-react';

interface LibraryRecentRepository {
  type: 'repository';
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  visitedAt: number;
}

interface LibraryRecentOwner {
  type: 'owner';
  id: number;
  login: string;
  avatar_url: string;
  visitedAt: number;
}

interface StarredRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  stargazers_count: number;
}

interface FollowingUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  bio: string | null;
}

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

// Dynamically import the FileCityPanel with SSR disabled
const FileCityPanelLoader = dynamic(
  () => import('@industry-theme/file-city-panel').then((mod) => {
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

export interface OwnerPageContentProps {
  owner: string;
  onPreviewChange?: (repo: string | null) => void;
  initialPreviewedRepo?: string | null;
}

export function OwnerPageContent({ owner, onPreviewChange, initialPreviewedRepo }: OwnerPageContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const { isAuthenticated, user } = useAuth();
  const userCollections = useUserCollections();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(initialPreviewedRepo ?? null);
  const [canvasExists, setCanvasExists] = useState(false);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const canvasLoadedRef = useRef(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'recent' | 'collections' | 'following' | 'starred'>('recent');
  const [recentRepos, setRecentRepos] = useState<LibraryRecentRepository[]>([]);
  const [recentOwners, setRecentOwners] = useState<LibraryRecentOwner[]>([]);
  const [starredRepos, setStarredRepos] = useState<StarredRepo[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);

  const [layout, setLayout] = useState<PanelLayout>({
    left: 'owner-repositories',
    middle: {
      type: 'tabs',
      panels: ['file-city', 'visual-validation'],
    },
    right: {
      type: 'tabs',
      panels: ['code-quality', 'package-composition'],
    },
  });

  // Load recent items from library's localStorage format
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadRecentItems = () => {
      try {
        const storedRepos = localStorage.getItem('recent-repositories');
        if (storedRepos) {
          const repos: LibraryRecentRepository[] = JSON.parse(storedRepos);
          setRecentRepos(repos);
        }

        const storedOwners = localStorage.getItem('recent-owners');
        if (storedOwners) {
          const owners: LibraryRecentOwner[] = JSON.parse(storedOwners);
          setRecentOwners(owners);
        }
      } catch (err) {
        console.error('Failed to load recent items:', err);
      }
    };

    loadRecentItems();

    // Listen for updates from the library
    window.addEventListener('recent-items-updated', loadRecentItems);
    return () => window.removeEventListener('recent-items-updated', loadRecentItems);
  }, []);

  // Fetch starred repos and following users when sidebar opens
  useEffect(() => {
    if (!sidebarOpen || !isAuthenticated) return;

    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/github/user/repos');
        if (response.ok) {
          const data = await response.json();
          if (data.starred) setStarredRepos(data.starred);
          if (data.following) setFollowingUsers(data.following);
        }
      } catch (err) {
        console.error('Failed to fetch user data:', err);
      }
    };

    fetchUserData();
  }, [sidebarOpen, isAuthenticated]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

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
            defaultShowSearch
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
      id: 'file-city',
      label: 'File City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={actions} events={events} />
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
          className="flex items-center justify-between px-4 border-b relative z-50"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
            paddingBottom: '0.75rem',
          }}
        >
          {/* Left section: Logo and Owner info */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-1">
            <Link
              href="/"
              className="flex items-center transition-all hover:opacity-80"
              title="Home"
            >
              <Logo width={32} height={32} color={theme.colors.primary} />
            </Link>
            {/* Owner info */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="transition-opacity hover:opacity-80"
                title="Open navigation"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <img
                  src={`https://github.com/${owner}.png?size=64`}
                  alt={owner}
                  className="w-6 h-6 rounded-full"
                />
              </button>
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

          {/* Right section: Panel controls and User menu */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
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

        {/* Sidebar Overlay */}
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 50,
              }}
              onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: '400px',
                // Layer surface color on solid black to ensure opacity regardless of theme
                background: `linear-gradient(${theme.colors.surface}, ${theme.colors.surface}), #000`,
                borderRight: `1px solid ${theme.colors.border}`,
                zIndex: 51,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideIn 0.2s ease-out',
              }}
            >
              {/* Sidebar Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                  paddingLeft: '20px',
                  paddingRight: '20px',
                  paddingBottom: '16px',
                  borderBottom: `1px solid ${theme.colors.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {user?.avatar_url && (
                    <img
                      src={user.avatar_url}
                      alt={user.name || user.login}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: `2px solid ${theme.colors.border}`,
                      }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: `${theme.fontSizes[2]}px`, fontWeight: theme.fontWeights.semibold, color: theme.colors.text }}>
                      {user?.name || user?.login || 'User'}
                    </div>
                    {user?.login && user?.name && (
                      <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted }}>
                        @{user.login}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: theme.colors.textMuted,
                    borderRadius: '4px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Home Link */}
              <Link
                href="/"
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  color: theme.colors.text,
                  textDecoration: 'none',
                  borderBottom: `1px solid ${theme.colors.border}`,
                }}
              >
                <Home size={16} />
                <span style={{ fontSize: `${theme.fontSizes[1]}px` }}>Home</span>
              </Link>

              {/* Tab Header */}
              <div style={{ display: 'flex', gap: '4px', padding: '16px 20px 12px', flexWrap: 'wrap' }}>
                {(['recent', 'collections', 'following', 'starred'] as const).map((tab) => {
                  const tabConfig = {
                    recent: { icon: Clock, label: 'Recent' },
                    collections: { icon: FolderOpen, label: 'Collections' },
                    following: { icon: Users, label: 'Following' },
                    starred: { icon: Star, label: 'Starred' },
                  };
                  const { icon: Icon, label } = tabConfig[tab];
                  return (
                    <button
                      key={tab}
                      onClick={() => setSidebarTab(tab)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        fontSize: `${theme.fontSizes[1]}px`,
                        fontWeight: theme.fontWeights.semibold,
                        color: sidebarTab === tab ? theme.colors.text : theme.colors.textMuted,
                        backgroundColor: sidebarTab === tab ? theme.colors.surface : 'transparent',
                        border: sidebarTab === tab ? `1px solid ${theme.colors.border}` : '1px solid transparent',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontFamily: theme.fonts.body,
                      }}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, overflowY: 'auto', paddingTop: '0', paddingLeft: '20px', paddingRight: '20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
                {sidebarTab === 'recent' && (
                  <>
                    {recentRepos.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <div
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            fontWeight: theme.fontWeights.medium,
                            color: theme.colors.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '8px',
                          }}
                        >
                          Repositories
                        </div>
                        {recentRepos.slice(0, 5).map((repo) => (
                          <Link
                            key={repo.full_name}
                            href={`/${repo.full_name}`}
                            onClick={() => setSidebarOpen(false)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              color: theme.colors.text,
                              marginBottom: '2px',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.colors.surface; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <img
                              src={repo.owner.avatar_url}
                              alt={repo.owner.login}
                              style={{ width: 28, height: 28, borderRadius: '6px' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: `${theme.fontSizes[1]}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {repo.full_name}
                              </div>
                              <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <GitFork size={10} />
                                {formatTimeAgo(new Date(repo.visitedAt).toISOString())}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {recentOwners.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            fontWeight: theme.fontWeights.medium,
                            color: theme.colors.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '8px',
                          }}
                        >
                          Owners
                        </div>
                        {recentOwners.slice(0, 5).map((recentOwner) => (
                          <Link
                            key={recentOwner.login}
                            href={`/${recentOwner.login}`}
                            onClick={() => setSidebarOpen(false)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              color: theme.colors.text,
                              marginBottom: '2px',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.colors.surface; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <img
                              src={recentOwner.avatar_url}
                              alt={recentOwner.login}
                              style={{ width: 28, height: 28, borderRadius: '6px' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: `${theme.fontSizes[1]}px` }}>{recentOwner.login}</div>
                              <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <User size={10} />
                                {formatTimeAgo(new Date(recentOwner.visitedAt).toISOString())}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {recentRepos.length === 0 && recentOwners.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: theme.colors.textMuted }}>
                        <Clock size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: `${theme.fontSizes[1]}px` }}>No recent activity</p>
                      </div>
                    )}
                  </>
                )}

                {sidebarTab === 'collections' && (
                  <>
                    {userCollections.collections.length > 0 ? (
                      userCollections.collections.map((collection) => {
                        const IconComponent = collection.icon ? iconMap[collection.icon] : null;
                        const repoCount = userCollections.getCollectionRepositories(collection.id).length;
                        return (
                          <Link
                            key={collection.id}
                            href={`/repos?collection=${collection.id}`}
                            onClick={() => setSidebarOpen(false)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              color: theme.colors.text,
                              marginBottom: '2px',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.colors.surface; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '6px',
                                backgroundColor: theme.colors.surface,
                                border: `1px solid ${theme.colors.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {IconComponent ? (
                                <IconComponent size={14} style={{ color: theme.colors.textMuted }} />
                              ) : (
                                <FolderOpen size={14} style={{ color: theme.colors.textMuted }} />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: `${theme.fontSizes[1]}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {collection.name}
                              </div>
                              <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted }}>
                                {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: theme.colors.textMuted }}>
                        <Library size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: `${theme.fontSizes[1]}px`, marginBottom: '16px' }}>No collections yet</p>
                        <Link
                          href="/repos"
                          onClick={() => setSidebarOpen(false)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            fontSize: `${theme.fontSizes[1]}px`,
                            fontWeight: theme.fontWeights.semibold,
                            color: theme.colors.background,
                            backgroundColor: theme.colors.text,
                            borderRadius: '6px',
                            textDecoration: 'none',
                          }}
                        >
                          Create Collection
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    )}
                  </>
                )}

                {sidebarTab === 'following' && (
                  <>
                    {followingUsers.length > 0 ? (
                      followingUsers.map((followedUser) => (
                        <Link
                          key={followedUser.id}
                          href={`/${followedUser.login}`}
                          onClick={() => setSidebarOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            color: theme.colors.text,
                            marginBottom: '2px',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.colors.surface; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <img
                            src={followedUser.avatar_url}
                            alt={followedUser.login}
                            style={{ width: 28, height: 28, borderRadius: '50%' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: `${theme.fontSizes[1]}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {followedUser.name || followedUser.login}
                            </div>
                            <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted }}>
                              @{followedUser.login}
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: theme.colors.textMuted }}>
                        <Users size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: `${theme.fontSizes[1]}px` }}>Not following anyone yet</p>
                      </div>
                    )}
                  </>
                )}

                {sidebarTab === 'starred' && (
                  <>
                    {starredRepos.length > 0 ? (
                      starredRepos.map((repo) => (
                        <Link
                          key={repo.id}
                          href={`/${repo.full_name}`}
                          onClick={() => setSidebarOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            color: theme.colors.text,
                            marginBottom: '2px',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.colors.surface; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <img
                            src={repo.owner.avatar_url}
                            alt={repo.owner.login}
                            style={{ width: 28, height: 28, borderRadius: '6px' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: `${theme.fontSizes[1]}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {repo.full_name}
                            </div>
                            <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Star size={10} />
                              {repo.stargazers_count.toLocaleString()}
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: theme.colors.textMuted }}>
                        <Star size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: `${theme.fontSizes[1]}px` }}>No starred repos yet</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <style>{`
              @keyframes slideIn {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
              }
            `}</style>
          </>
        )}
    </div>
  );
}
