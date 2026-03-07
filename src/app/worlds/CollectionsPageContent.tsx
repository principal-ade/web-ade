'use client';

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useMemo } from "react";
import { useWorldsPageProvider } from "@/contexts/WorldsPageProvider";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { Logo } from "@principal-ai/logo-component";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import { FolderOpen, Share2, Check, Settings, Clock, GitFork, User, Library, ArrowRight, X, Home, Star, Users, Search, Map, PanelRight, PanelRightClose, Plus } from 'lucide-react';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { iconMap } from '@/components/collections/CollectionModal';
import type { Collection } from '@principal-ai/alexandria-collections';
import {
  UserCollectionsPanel,
  GitHubStarredPanel,
  GitHubProjectsPanel,
  UserProfilePanel,
  WorkspaceCollectionPanel,
} from '@industry-theme/alexandria-panels';
import { GitHubSearchPanel } from '@industry-theme/github-panels';
import { CodeCityPanel } from '@industry-theme/file-city-panel';
import { CollectionMapPanel } from '@industry-theme/repository-composition-panels';

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

// Static imports for all panels (for type safety)
const UserCollectionsPanelLoader = UserCollectionsPanel;
const GitHubStarredPanelLoader = GitHubStarredPanel;
const GitHubProjectsPanelLoader = GitHubProjectsPanel;
const GitHubSearchPanelLoader = GitHubSearchPanel;
const UserProfilePanelLoader = UserProfilePanel;
const WorkspaceCollectionPanelLoader = WorkspaceCollectionPanel;

// Explore mode panels
const FileCityPanelLoader = CodeCityPanel;
const CollectionMapPanelLoader = CollectionMapPanel;

export type ViewMode = 'manage' | 'explore';

export interface CollectionsPageContentProps {
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
  allCollections,
  selectedCollectionId,
  onSelectCollection,
  onCreateNew,
  onAddToCollection,
  onRemoveFromCollection: _onRemoveFromCollection,
  gitHubRepoExists,
  onShare,
  shareSuccess,
  onPreviewChange: _onPreviewChange,
  initialPreviewedRepo: _initialPreviewedRepo,
  initialViewMode = 'manage',
}: CollectionsPageContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = useWorldsPageProvider();
  const { isAuthenticated, user } = useAuth();
  const userCollections = useUserCollections();
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const leftCollapsed = false;
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'recent' | 'collections' | 'following' | 'starred'>('recent');
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


  // Layout configurations for each mode
  const manageLayout: PanelLayout = {
    left: 'user-profile',
    middle: 'collection-map',
    right: {
      type: 'tabs',
      panels: ['github-projects', 'github-starred', 'github-search'],
    },
  };

  const exploreLayout: PanelLayout = {
    left: 'user-profile',
    middle: 'collection-map',
    right: actions.selectedRepositoryId ? 'file-city' : 'workspace-collection',
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

  // Auto-toggle right panel based on view mode
  useEffect(() => {
    if (viewMode === 'manage') {
      // Always open right panel in manage mode to show GitHub panels
      setRightCollapsed(false);
    } else if (viewMode === 'explore') {
      // Always open right panel in explore mode to show repo list or file-city
      setRightCollapsed(false);
    }
  }, [viewMode]);

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

  // Listen for repository and collection events from panels
  useEffect(() => {
    if (!events) return;

    console.log('[CollectionsPageContent] Setting up event listeners, events object:', events);

    const unsubscribers = [
      events.on('repository:navigate', (event) => {
        const payload = event.payload as { owner?: string; repo?: string };
        if (payload?.owner && payload?.repo) {
          router.push(`/${payload.owner}/${payload.repo}`);
        }
      }),
      // Listen for collection selection from UserCollectionsPanel
      events.on('industry-theme.user-collections:collection:selected', (event) => {
        const payload = event.payload as { collection?: Collection; collectionId?: string };
        if (payload?.collectionId) {
          onSelectCollection(payload.collectionId);
        }
      }),
      // Listen for collection selection from UserProfilePanel (left panel)
      events.on('industry-theme.user-profile:collection:selected', (event) => {
        const payload = event.payload as { collection?: Collection; collectionId?: string };
        if (payload?.collectionId) {
          onSelectCollection(payload.collectionId);
        }
      }),
      // Listen for create collection request from UserCollectionsPanel
      events.on('industry-theme.user-collections:create-collection-requested', () => {
        console.log('[CollectionsPageContent] Received create-collection-requested event');
        onCreateNew();
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, router, onSelectCollection, onCreateNew]);

  const panels = [
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
    {
      id: 'user-collections',
      label: 'Collections',
      icon: <Library size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <UserCollectionsPanelLoader
            context={context}
            actions={actions}
            events={events}
          />
        </div>
      ),
    },
    {
      id: 'user-profile',
      label: 'Profile',
      icon: <User size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <UserProfilePanelLoader
            context={context}
            actions={actions}
            events={events}
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
    {
      id: 'collection-map',
      label: 'Overworld Map',
      icon: <Map size={16} />,
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
    // Explore mode panels
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
                actions.onRepositoryClicked?.(repository.full_name);
              },
            }}
            events={events}
            selectedRepository={actions.selectedRepositoryId ?? undefined}
            defaultShowSearch
          />
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
        {/* Left: Logo and Collection Dropdown */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 transition-all hover:opacity-80"
            title="Home"
          >
            <Logo width={28} height={28} color={theme.colors.primary} />
            <span
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.semibold,
              }}
            >
              Principal AI
            </span>
          </Link>
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
                <Map size={14} />
                <span className="hidden sm:inline">Explore</span>
              </button>
            </div>
          </div>
        )}

        {/* Right: Actions and toggles */}
        <div className="flex items-center justify-end gap-3">
          {/* Add Collection button */}
          {!isMobile && isAuthenticated && (
            <button
              onClick={onCreateNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
              }}
              title="Create new collection"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">New Collection</span>
            </button>
          )}

          {/* Right panel toggle */}
          {!isMobile && (
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
              title={rightCollapsed ? 'Show right panel' : 'Hide right panel'}
            >
              {rightCollapsed ? (
                <PanelRight size={16} />
              ) : (
                <PanelRightClose size={16} />
              )}
              <span className="hidden sm:inline">
                {rightCollapsed ? 'Show Panel' : 'Hide Panel'}
              </span>
            </button>
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
              ? { left: 20, middle: 60, right: 20 }
              : { left: 25, middle: 50, right: 25 }
            }
            minSizes={viewMode === 'manage'
              ? { left: 20, middle: 30, right: 20 }
              : { left: 15, middle: 30, right: 15 }
            }
            collapsiblePanels={{ left: true, right: true }}
            collapsed={{ left: leftCollapsed, right: rightCollapsed }}
            onRightCollapseComplete={() => setRightCollapsed(true)}
            onRightExpandComplete={() => setRightCollapsed(false)}
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
              ? { left: 20, middle: 60, right: 20 }
              : { left: 25, middle: 50, right: 25 }
            }
            minSizes={viewMode === 'manage'
              ? { left: 20, middle: 30, right: 20 }
              : { left: 15, middle: 30, right: 15 }
            }
            collapsiblePanels={{ left: true, right: true }}
            collapsed={{ left: leftCollapsed, right: rightCollapsed }}
            onRightCollapseComplete={() => setRightCollapsed(true)}
            onRightExpandComplete={() => setRightCollapsed(false)}
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
                          href={`/worlds?collection=${collection.id}`}
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

