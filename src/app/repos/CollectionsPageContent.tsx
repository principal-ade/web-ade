'use client';

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useCallback, useMemo } from "react";
import { usePanelProvider } from "@/contexts/PanelContext";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { Logo } from "@principal-ai/logo-component";
import dynamic from "next/dynamic";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import { Plus, FolderOpen, Edit2, Cloud, CloudOff, Share2, Check, Settings, Compass, Clock, GitFork, User, Library, ArrowRight, X, Home, Star, Users, Search, Map, Network, Shield, Package } from 'lucide-react';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { iconMap } from '@/components/collections/CollectionModal';
import type { Collection } from '@principal-ai/alexandria-collections';

const RECENT_REPOSITORIES_KEY = 'recent-repositories';
const RECENT_OWNERS_KEY = 'recent-owners';

interface RecentRepository {
  owner: string;
  repo: string;
  visitedAt: string;
}

interface RecentOwner {
  owner: string;
  visitedAt: string;
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

// Dynamically import panels with SSR disabled
const WorkspaceCollectionPanelLoader = dynamic(
  () => import('@industry-theme/alexandria-panels').then((mod) => mod.WorkspaceCollectionPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

const GitHubStarredPanelLoader = dynamic(
  () => import('@industry-theme/alexandria-panels').then((mod) => mod.GitHubStarredPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

const GitHubProjectsPanelLoader = dynamic(
  () => import('@industry-theme/alexandria-panels').then((mod) => mod.GitHubProjectsPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

const GitHubSearchPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => mod.GitHubSearchPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// Explore mode panels
const PrincipalViewPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => mod.panels[0]!.component),
  { ssr: false }
);

const CodeQualityPanelLoader = dynamic(
  () => import('@principal-ade/code-quality-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

const FileCityPanelLoader = dynamic(
  () => import('@industry-theme/file-city-panel').then((mod) => mod.panels[0]!.component),
  { ssr: false }
);

const PackageCompositionPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.PackageCompositionPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

const DependencyGraphPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.DependencyGraphPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

export type ViewMode = 'manage' | 'explore';

export interface CollectionsPageContentProps {
  isUserCollection: boolean;
  onAddRepository?: () => void;
  onEditCollection?: () => void;
  // Collection dropdown props
  allCollections: Collection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string) => void;
  onCreateNew: () => void;
  // Action to add a repo to the current collection
  onAddToCollection?: (repositoryId: string) => Promise<void>;
  // Action to remove a repo from the current collection
  onRemoveFromCollection?: (repositoryId: string) => Promise<void>;
  // GitHub state
  gitHubRepoExists: boolean;
  saving: boolean;
  gitHubRepoUrl: string | null;
  onOpenSyncModal: () => void;
  // Share
  onShare: () => void;
  shareSuccess: boolean;
  // Previewed repo for explore mode
  onPreviewChange?: (repo: string | null) => void;
  initialPreviewedRepo?: string | null;
  // Initial view mode based on collection content
  initialViewMode?: ViewMode;
}

export function CollectionsPageContent({
  isUserCollection,
  onAddRepository,
  onEditCollection,
  allCollections,
  selectedCollectionId,
  onSelectCollection,
  onCreateNew,
  onAddToCollection,
  onRemoveFromCollection,
  gitHubRepoExists,
  saving,
  gitHubRepoUrl,
  onOpenSyncModal,
  onShare,
  shareSuccess,
  onPreviewChange,
  initialPreviewedRepo,
  initialViewMode = 'manage',
}: CollectionsPageContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = usePanelProvider();
  const { isAuthenticated, user } = useAuth();
  const userCollections = useUserCollections();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(initialPreviewedRepo ?? null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const leftCollapsed = false;
  const rightCollapsed = false;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'recent' | 'collections' | 'following' | 'starred'>('recent');
  const [collectionDropdownOpen, setCollectionDropdownOpen] = useState(false);
  const [recentRepos, setRecentRepos] = useState<RecentRepository[]>([]);
  const [recentOwners, setRecentOwners] = useState<RecentOwner[]>([]);
  const [starredRepos, setStarredRepos] = useState<StarredRepo[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);

  // Load recent items from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedRepos = localStorage.getItem(RECENT_REPOSITORIES_KEY);
      if (storedRepos) setRecentRepos(JSON.parse(storedRepos));
      const storedOwners = localStorage.getItem(RECENT_OWNERS_KEY);
      if (storedOwners) setRecentOwners(JSON.parse(storedOwners));
    } catch (err) {
      console.error('Failed to load recent items:', err);
    }
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

  // Sync previewed repo with parent
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    onPreviewChange?.(repo);
  }, [onPreviewChange]);

  // Auto-select first repository when in explore mode and no repo is selected
  const workspaceReposSlice = context.getSlice('workspaceRepositories');
  const workspaceReposData = workspaceReposSlice?.data as { repositories?: Array<{ full_name: string; owner: { login: string }; name: string }> } | undefined;
  const workspaceReposLoading = workspaceReposSlice?.loading ?? true;

  useEffect(() => {
    if (viewMode !== 'explore' || workspaceReposLoading || previewedRepo) return;

    const repositories = workspaceReposData?.repositories;
    if (repositories && repositories.length > 0) {
      const sortedRepos = [...repositories].sort((a, b) => a.name.localeCompare(b.name));
      const firstRepo = sortedRepos[0];
      if (firstRepo?.full_name) {
        handlePreviewChange(firstRepo.full_name);
        (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(
          firstRepo.owner.login,
          firstRepo.name
        );
      }
    }
  }, [viewMode, workspaceReposLoading, workspaceReposData?.repositories, previewedRepo, handlePreviewChange, actions]);

  // Layout configurations for each mode
  const manageLayout: PanelLayout = {
    left: 'workspace-collection',
    middle: {
      type: 'tabs',
      panels: ['github-projects', 'github-starred', 'github-search'],
    },
    right: 'empty',
  };

  const exploreLayout: PanelLayout = {
    left: 'workspace-collection',
    middle: {
      type: 'tabs',
      panels: ['file-city', 'visual-validation', 'dependency-graph'],
    },
    right: {
      type: 'tabs',
      panels: ['code-quality', 'package-composition'],
    },
  };

  // Mobile layout: distribute panels across slots instead of tabs
  const mobileLayout: PanelLayout = {
    left: 'github-search',
    middle: 'github-projects',
    right: 'github-starred',
  };

  const layout = isMobile ? mobileLayout : (viewMode === 'manage' ? manageLayout : exploreLayout);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Extended actions for panels with addToCollection and searchRepositories
  const panelActions = useMemo(() => {
    return {
      ...actions,
      addToCollection: onAddToCollection
        ? async (repo: { full_name: string }) => {
            await onAddToCollection(repo.full_name);
          }
        : undefined,
      searchRepositories: async (query: string, options?: { perPage?: number }) => {
        const perPage = options?.perPage || 30;
        const response = await fetch(
          `/api/github/search?q=${encodeURIComponent(query)}&per_page=${perPage}`
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Search failed');
        }
        return response.json();
      },
    };
  }, [actions, onAddToCollection]);

  // Listen for repository events from panels
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      events.on('repository:selected', (event) => {
        const payload = event.payload as { repository?: { full_name?: string } };
        if (payload?.repository?.full_name) {
          const fullName = payload.repository.full_name;
          handlePreviewChange(fullName);
          const [owner, repo] = fullName.split('/');
          if (owner && repo) {
            (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(owner, repo);
          }
        }
      }),
      events.on('repository:navigate', (event) => {
        const payload = event.payload as { owner?: string; repo?: string };
        if (payload?.owner && payload?.repo) {
          router.push(`/${payload.owner}/${payload.repo}`);
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, router, handlePreviewChange, actions]);

  const panels = [
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
    {
      id: 'workspace-collection',
      label: 'Collection',
      icon: <Library size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <WorkspaceCollectionPanelLoader
            context={context}
            actions={{
              ...actions,
              navigateToRepository: (owner: string, repo: string) => {
                router.push(`/${owner}/${repo}`);
              },
              previewRepository: (repository: { full_name: string; owner: { login: string }; name: string }) => {
                handlePreviewChange(repository.full_name);
                (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(
                  repository.owner.login,
                  repository.name
                );
              },
              removeRepositoryFromWorkspace: onRemoveFromCollection
                ? async (repoKey: string) => {
                    await onRemoveFromCollection(repoKey);
                  }
                : undefined,
            }}
            events={events}
            selectedRepository={previewedRepo}
            defaultShowSearch
          />
        </div>
      ),
    },
    {
      id: 'github-starred',
      label: 'Starred',
      icon: <Star size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubStarredPanelLoader
            context={context}
            actions={panelActions}
            events={events}
            defaultShowSearch={true}
          />
        </div>
      ),
    },
    {
      id: 'github-projects',
      label: 'Your Repos',
      icon: <User size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubProjectsPanelLoader
            context={context}
            actions={panelActions}
            events={events}
            defaultShowSearch={true}
          />
        </div>
      ),
    },
    {
      id: 'github-search',
      label: 'Search',
      icon: <Search size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubSearchPanelLoader
            context={context}
            actions={panelActions}
            events={events}
          />
        </div>
      ),
    },
    // Explore mode panels
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
      id: 'dependency-graph',
      label: 'Dependencies',
      icon: <Network size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <DependencyGraphPanelLoader context={context} actions={actions} events={events} />
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
  ];

  return (
    <div className="h-full w-full flex flex-col">
      {/* Custom header with collection dropdown */}
      <header
        className="grid grid-cols-3 items-center px-4 border-b"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          paddingBottom: '0.75rem',
        }}
      >
        {/* Left: User Avatar, Collections label, and Collection Dropdown */}
        <div className="flex items-center gap-3">
          {user?.avatar_url ? (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center transition-all hover:opacity-80"
              title="Open recent activity"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <Image
                src={user.avatar_url}
                alt={user.name || user.login}
                width={32}
                height={32}
                style={{
                  borderRadius: '50%',
                  border: `2px solid ${theme.colors.border}`,
                }}
              />
            </button>
          ) : (
            <Link
              href="/"
              className="flex items-center transition-all hover:opacity-80"
              title="Home"
            >
              <Logo width={32} height={32} color={theme.colors.primary} />
            </Link>
          )}
          {isMobile ? (
            <span
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.semibold,
              }}
            >
              Repo
            </span>
          ) : (
            <CollectionDropdown
              collections={allCollections}
              selectedId={selectedCollectionId}
              onSelect={onSelectCollection}
              onCreateNew={onCreateNew}
              theme={theme}
              isOpen={collectionDropdownOpen}
              onToggle={() => setCollectionDropdownOpen(!collectionDropdownOpen)}
              onClose={() => setCollectionDropdownOpen(false)}
            />
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
                onClick={() => setViewMode('manage')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all"
                style={{
                  background: viewMode === 'manage' ? theme.colors.surface : 'transparent',
                  color: viewMode === 'manage' ? theme.colors.text : theme.colors.textSecondary,
                  boxShadow: viewMode === 'manage' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
                title="Manage repositories in collection"
              >
                <Settings size={14} />
                <span className="hidden sm:inline">Manage</span>
              </button>
              <button
                onClick={() => setViewMode('explore')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all"
                style={{
                  background: viewMode === 'explore' ? theme.colors.surface : 'transparent',
                  color: viewMode === 'explore' ? theme.colors.text : theme.colors.textSecondary,
                  boxShadow: viewMode === 'explore' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
                title="Explore collection with visualizations"
              >
                <Compass size={14} />
                <span className="hidden sm:inline">Explore</span>
              </button>
            </div>
          </div>
        )}

        {/* Right: Actions and toggles */}
        <div className="flex items-center justify-end gap-3">
          {/* User collection action buttons - only show in manage mode */}
          {!isMobile && isUserCollection && viewMode === 'manage' && (
            <div className="flex items-center gap-2">
              {onAddRepository && (
                <button
                  onClick={onAddRepository}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
                  style={{
                    background: theme.colors.primary,
                    color: theme.colors.textOnPrimary,
                  }}
                  title="Add repository to collection"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Add Repo</span>
                </button>
              )}
              {onEditCollection && (
                <button
                  onClick={onEditCollection}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
                  style={{
                    background: theme.colors.secondary,
                    color: theme.colors.text,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                  title="Edit collection"
                >
                  <Edit2 size={16} />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}
            </div>
          )}

          {/* Share Button (only show when repo exists) */}
          {!isMobile && isAuthenticated && gitHubRepoExists && (
            <button
              onClick={onShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: shareSuccess ? '#10b98120' : theme.colors.secondary,
                color: shareSuccess ? '#10b981' : theme.colors.text,
                border: `1px solid ${shareSuccess ? '#10b981' : theme.colors.border}`,
              }}
              title="Copy your collections URL to share"
            >
              {shareSuccess ? (
                <Check size={16} />
              ) : (
                <Share2 size={16} />
              )}
              <span className="hidden sm:inline">
                {shareSuccess ? 'Copied!' : 'Share'}
              </span>
            </button>
          )}

          {/* GitHub Sync Button */}
          {!isMobile && isAuthenticated && (
            <button
              onClick={onOpenSyncModal}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: gitHubRepoExists ? '#10b98120' : theme.colors.secondary,
                color: gitHubRepoExists ? '#10b981' : theme.colors.text,
                border: `1px solid ${gitHubRepoExists ? '#10b981' : theme.colors.border}`,
                opacity: saving ? 0.6 : 1,
              }}
              title={gitHubRepoExists ? `Synced to ${gitHubRepoUrl || 'GitHub'}` : 'Enable GitHub sync'}
            >
              {saving ? (
                <Cloud size={16} className="animate-pulse" />
              ) : gitHubRepoExists ? (
                <Cloud size={16} />
              ) : (
                <CloudOff size={16} />
              )}
              <span className="hidden sm:inline">
                {saving ? 'Saving...' : gitHubRepoExists ? 'Synced' : 'Sync'}
              </span>
            </button>
          )}

          {/* User Avatar Menu */}
          <UserAvatarMenu />
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            key={viewMode}
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={viewMode === 'manage'
              ? { left: 40, middle: 60, right: 0 }
              : { left: 25, middle: 50, right: 25 }
            }
            minSizes={viewMode === 'manage'
              ? { left: 20, middle: 40, right: 0 }
              : { left: 15, middle: 30, right: 15 }
            }
            collapsiblePanels={{ left: true, right: viewMode === 'explore' }}
            collapsed={{ left: leftCollapsed, right: viewMode === 'manage' ? true : rightCollapsed }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            key={viewMode}
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={viewMode === 'manage'
              ? { left: 40, middle: 60, right: 0 }
              : { left: 25, middle: 50, right: 25 }
            }
            minSizes={viewMode === 'manage'
              ? { left: 20, middle: 40, right: 0 }
              : { left: 15, middle: 30, right: 15 }
            }
            collapsiblePanels={{ left: true, right: viewMode === 'explore' }}
            collapsed={{ left: leftCollapsed, right: viewMode === 'manage' ? true : rightCollapsed }}
            showCollapseButtons={false}
          />
        )}
      </div>

      {/* Global Command Palette (Cmd+Shift+P) */}
      <GlobalCommandPalette
        events={events}
        autocompleteData={{
          collections: allCollections.map(c => ({ id: c.id, name: c.name })),
        }}
      />

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
              backgroundColor: theme.colors.background,
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
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {user?.avatar_url && (
                  <Image
                    src={user.avatar_url}
                    alt={user.name || user.login}
                    width={40}
                    height={40}
                    style={{
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
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
                          key={`${repo.owner}/${repo.repo}`}
                          href={`/${repo.owner}/${repo.repo}`}
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
                          <Image
                            src={`https://avatars.githubusercontent.com/${repo.owner}?size=64`}
                            alt={repo.owner}
                            width={28}
                            height={28}
                            style={{ borderRadius: '6px' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: `${theme.fontSizes[1]}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {repo.owner}/{repo.repo}
                            </div>
                            <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <GitFork size={10} />
                              {formatTimeAgo(repo.visitedAt)}
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
                      {recentOwners.slice(0, 5).map((owner) => (
                        <Link
                          key={owner.owner}
                          href={`/${owner.owner}`}
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
                          <Image
                            src={`https://avatars.githubusercontent.com/${owner.owner}?size=64`}
                            alt={owner.owner}
                            width={28}
                            height={28}
                            style={{ borderRadius: '6px' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: `${theme.fontSizes[1]}px` }}>{owner.owner}</div>
                            <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <User size={10} />
                              {formatTimeAgo(owner.visitedAt)}
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
                          onClick={() => {
                            setSidebarOpen(false);
                            onSelectCollection(collection.id);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            color: theme.colors.text,
                            marginBottom: '2px',
                            backgroundColor: collection.id === selectedCollectionId ? theme.colors.surface : 'transparent',
                          }}
                          onMouseEnter={(e) => { if (collection.id !== selectedCollectionId) e.currentTarget.style.backgroundColor = theme.colors.surface; }}
                          onMouseLeave={(e) => { if (collection.id !== selectedCollectionId) e.currentTarget.style.backgroundColor = 'transparent'; }}
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
                      <button
                        onClick={() => {
                          setSidebarOpen(false);
                          onCreateNew();
                        }}
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
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Create Collection
                        <ArrowRight size={14} />
                      </button>
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
                        <Image
                          src={followedUser.avatar_url}
                          alt={followedUser.login}
                          width={28}
                          height={28}
                          style={{ borderRadius: '50%' }}
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
                        <Image
                          src={repo.owner.avatar_url}
                          alt={repo.owner.login}
                          width={28}
                          height={28}
                          style={{ borderRadius: '6px' }}
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

interface CollectionDropdownProps {
  collections: Collection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function CollectionDropdown({
  collections,
  selectedId,
  onSelect,
  onCreateNew,
  theme,
  isOpen,
  onToggle,
  onClose,
}: CollectionDropdownProps) {
  const selected = collections.find(c => c.id === selectedId);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        onClick={onToggle}
        style={{
          color: theme.colors.textSecondary,
          fontSize: `${theme.fontSizes[2]}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
        title="Switch collection"
      >
        Collections
      </button>
      <span style={{ color: theme.colors.textSecondary, fontSize: `${theme.fontSizes[2]}px` }}>/</span>
      <span
        style={{
          color: theme.colors.text,
          fontSize: `${theme.fontSizes[2]}px`,
          fontWeight: theme.fontWeights.semibold,
        }}
      >
        {selected?.name || 'Select Collection'}
      </span>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
            }}
            onClick={onClose}
          />

          {/* Dropdown */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              minWidth: '280px',
              backgroundColor: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {/* Create New */}
            <button
              onClick={() => {
                onClose();
                onCreateNew();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${theme.colors.border}`,
                cursor: 'pointer',
                color: theme.colors.primary,
                fontSize: `${theme.fontSizes[1]}px`,
                fontWeight: theme.fontWeights.medium,
              }}
            >
              <Plus size={16} />
              Create New Collection
            </button>

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {collections.map(collection => (
                <button
                  key={collection.id}
                  onClick={() => {
                    onSelect(collection.id);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: collection.id === selectedId ? theme.colors.backgroundTertiary : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: theme.colors.text,
                    fontSize: `${theme.fontSizes[1]}px`,
                    textAlign: 'left',
                  }}
                >
                  <FolderOpen size={16} style={{ color: theme.colors.textSecondary }} />
                  <span style={{ flex: 1 }}>{collection.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
