'use client';

import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { PanelProvider, usePanelProvider } from "@/contexts/PanelContext";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { CollectionModal } from "@/components/collections/CollectionModal";
import { AddRepositoryModal } from "@/components/collections/AddRepositoryModal";
import { GitHubSyncModal } from "@/components/collections/GitHubSyncModal";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import dynamic from "next/dynamic";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import { Plus, FolderOpen, Layers, Edit2, Cloud, CloudOff, Share2, Check, ArrowLeftRight, Settings, Compass } from 'lucide-react';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import type { Collection } from '@principal-ai/alexandria-collections';

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

type ViewMode = 'manage' | 'explore';

interface LibraryPageContentProps {
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

function LibraryPageContent({
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
}: LibraryPageContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = usePanelProvider();
  const { isAuthenticated } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(initialPreviewedRepo ?? null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [leftCollapsed, _setLeftCollapsed] = useState(false);
  const [rightCollapsed, _setRightCollapsed] = useState(false);

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
      panels: ['github-starred', 'github-projects'],
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

  const layout = viewMode === 'manage' ? manageLayout : exploreLayout;

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Extended actions for panels with addToCollection
  const panelActions = useMemo(() => {
    return {
      ...actions,
      addToCollection: onAddToCollection
        ? async (repo: { full_name: string }) => {
            await onAddToCollection(repo.full_name);
          }
        : undefined,
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
          />
        </div>
      ),
    },
    {
      id: 'github-starred',
      label: 'Starred',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubStarredPanelLoader
            context={context}
            actions={panelActions}
            events={events}
          />
        </div>
      ),
    },
    {
      id: 'github-projects',
      label: 'Your Repos',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubProjectsPanelLoader
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
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={actions} events={events} />
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
      id: 'dependency-graph',
      label: 'Dependencies',
      content: (
        <div className="h-full w-full overflow-hidden">
          <DependencyGraphPanelLoader context={context} actions={actions} events={events} />
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
  ];

  return (
    <div className="h-full w-full flex flex-col">
      {/* Custom header with collection dropdown */}
      <header
        className="h-14 grid grid-cols-3 items-center px-4 border-b"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        {/* Left: Collection Dropdown */}
        <div className="flex items-center">
          <CollectionDropdown
            collections={allCollections}
            selectedId={selectedCollectionId}
            onSelect={onSelectCollection}
            onCreateNew={onCreateNew}
            theme={theme}
          />
        </div>

        {/* Center: Mode Switch */}
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

        {/* Right: Actions and toggles */}
        <div className="flex items-center justify-end gap-3">
          {/* User collection action buttons - only show in manage mode */}
          {isUserCollection && viewMode === 'manage' && (
            <div className="flex items-center gap-2">
              {onAddRepository && (
                <button
                  onClick={onAddRepository}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
                  style={{
                    background: theme.colors.primary,
                    color: '#fff',
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
          {isAuthenticated && gitHubRepoExists && (
            <button
              onClick={onShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: shareSuccess ? '#10b98120' : theme.colors.secondary,
                color: shareSuccess ? '#10b981' : theme.colors.text,
                border: `1px solid ${shareSuccess ? '#10b981' : theme.colors.border}`,
              }}
              title="Copy your library URL to share"
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
          {isAuthenticated && (
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
    </div>
  );
}

interface CollectionDropdownProps {
  collections: Collection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

function CollectionDropdown({
  collections,
  selectedId,
  onSelect,
  onCreateNew,
  theme,
}: CollectionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = collections.find(c => c.id === selectedId);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          color: theme.colors.text,
          fontSize: `${theme.fontSizes[2]}px`,
          fontWeight: theme.fontWeights.semibold,
        }}
      >
        {selected?.name || 'Select Collection'}
      </span>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Switch collection"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          color: theme.colors.textSecondary,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.surface;
          e.currentTarget.style.color = theme.colors.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = theme.colors.textSecondary;
        }}
      >
        <ArrowLeftRight size={16} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
            }}
            onClick={() => setIsOpen(false)}
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
                setIsOpen(false);
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
                    setIsOpen(false);
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

function LibraryPageWrapper() {
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCollections = useUserCollections();
  const { user } = useAuth();

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(
    searchParams.get('collection')
  );

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addRepoModalOpen, setAddRepoModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Previewed repo state for explore mode
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);

  // Handle preview change and update URL
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
  }, []);

  // All collections (just user collections now)
  const allCollections = useMemo(() => {
    return userCollections.collections;
  }, [userCollections.collections]);

  // Auto-select first collection if none selected
  useEffect(() => {
    if (!selectedCollectionId && allCollections.length > 0 && !userCollections.loading) {
      const firstId = allCollections[0]?.id;
      if (firstId) {
        setSelectedCollectionId(firstId);
        router.replace(`/library?collection=${firstId}`, { scroll: false });
      }
    }
  }, [selectedCollectionId, allCollections, userCollections.loading, router]);

  // Get selected collection and its repos
  const selectedCollection = useMemo(() => {
    return allCollections.find(c => c.id === selectedCollectionId) || null;
  }, [allCollections, selectedCollectionId]);

  const isUserCollection = useMemo(() => {
    return userCollections.isUserCollection(selectedCollectionId || '');
  }, [userCollections, selectedCollectionId]);

  const repositories = useMemo(() => {
    if (!selectedCollectionId) return [];
    return userCollections.getCollectionRepositories(selectedCollectionId);
  }, [selectedCollectionId, userCollections]);

  // Handlers
  const handleSelectCollection = useCallback((id: string) => {
    setSelectedCollectionId(id);
    router.replace(`/library?collection=${id}`, { scroll: false });
  }, [router]);

  const handleCreateCollection = useCallback(async (name: string, description: string, icon: string) => {
    const newCollection = await userCollections.createCollection(name, description, icon);
    setSelectedCollectionId(newCollection.id);
    router.replace(`/library?collection=${newCollection.id}`, { scroll: false });
  }, [userCollections, router]);

  const handleUpdateCollection = useCallback(async (name: string, description: string, icon: string) => {
    if (selectedCollectionId) {
      await userCollections.updateCollection(selectedCollectionId, { name, description, icon });
    }
  }, [userCollections, selectedCollectionId]);

  const handleDeleteCollection = useCallback(async () => {
    if (selectedCollectionId) {
      await userCollections.deleteCollection(selectedCollectionId);
      // Select first available collection
      const remaining = allCollections.filter(c => c.id !== selectedCollectionId);
      if (remaining.length > 0) {
        handleSelectCollection(remaining[0]!.id);
      } else {
        setSelectedCollectionId(null);
        router.replace('/library', { scroll: false });
      }
    }
  }, [userCollections, selectedCollectionId, allCollections, handleSelectCollection, router]);

  const handleAddRepository = useCallback(async (repositoryId: string) => {
    if (selectedCollectionId) {
      await userCollections.addRepository(selectedCollectionId, repositoryId);
    }
  }, [userCollections, selectedCollectionId]);

  const handleRemoveRepository = useCallback(async (repositoryId: string) => {
    if (selectedCollectionId) {
      await userCollections.removeRepository(selectedCollectionId, repositoryId);
    }
  }, [userCollections, selectedCollectionId]);

  const handleShare = useCallback(() => {
    if (!user?.login) return;

    const shareUrl = `${window.location.origin}/library/${user.login}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    });
  }, [user?.login]);

  if (userCollections.loading) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: theme.colors.background, color: theme.colors.text }}
      >
        Loading library...
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      {/* Main Content */}
      {selectedCollection ? (
        <div style={{ height: '100vh' }}>
          <PanelProvider
            key={`${selectedCollectionId}-${repositories.length}`}
            workspace={{
              name: selectedCollection.name,
              path: `/library`,
            }}
            repository={{
              name: previewedRepo ? previewedRepo.split('/')[1] || selectedCollection.name : selectedCollection.name,
              path: previewedRepo ? `/GitHub/${previewedRepo}` : `/library`,
            }}
            githubRepo={previewedRepo || undefined}
            collectionId={selectedCollectionId || undefined}
            collectionRepositories={repositories}
          >
            <LibraryPageContent
              isUserCollection={isUserCollection}
              onAddRepository={isUserCollection ? () => setAddRepoModalOpen(true) : undefined}
              onEditCollection={isUserCollection ? () => setEditModalOpen(true) : undefined}
              allCollections={allCollections}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={handleSelectCollection}
              onCreateNew={() => setCreateModalOpen(true)}
              onAddToCollection={isUserCollection ? handleAddRepository : undefined}
              onRemoveFromCollection={isUserCollection ? handleRemoveRepository : undefined}
              gitHubRepoExists={userCollections.gitHubRepoExists}
              saving={userCollections.saving}
              gitHubRepoUrl={userCollections.gitHubRepoUrl}
              onOpenSyncModal={() => setSyncModalOpen(true)}
              onShare={handleShare}
              shareSuccess={shareSuccess}
              onPreviewChange={handlePreviewChange}
              initialPreviewedRepo={previewedRepo}
              initialViewMode={repositories.length > 0 ? 'explore' : 'manage'}
            />
          </PanelProvider>
        </div>
      ) : (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: theme.colors.textSecondary,
          }}
        >
          <Layers size={48} style={{ opacity: 0.5 }} />
          <p>No collections yet. Create one to get started!</p>
          <button
            onClick={() => setCreateModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: theme.colors.primary,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.medium,
            }}
          >
            <Plus size={18} />
            Create Collection
          </button>
        </div>
      )}

      {/* Modals */}
      <CollectionModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSave={handleCreateCollection}
        mode="create"
      />

      {isUserCollection && selectedCollection && (
        <>
          <CollectionModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            onSave={handleUpdateCollection}
            onDelete={handleDeleteCollection}
            initialData={selectedCollection as Collection}
            mode="edit"
          />
          <AddRepositoryModal
            isOpen={addRepoModalOpen}
            onClose={() => setAddRepoModalOpen(false)}
            onAdd={handleAddRepository}
            onRemove={handleRemoveRepository}
            existingRepositories={repositories}
            collectionName={selectedCollection.name}
          />
        </>
      )}

      {/* GitHub Sync Modal */}
      <GitHubSyncModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onConfirm={async () => {
          if (!userCollections.gitHubRepoExists) {
            await userCollections.enableGitHub();
          }
        }}
        repoUrl={userCollections.gitHubRepoUrl}
        isSynced={userCollections.gitHubRepoExists}
      />
    </div>
  );
}

function LibraryPageLoading() {
  const { theme } = useTheme();
  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      Loading library...
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<LibraryPageLoading />}>
      <LibraryPageWrapper />
    </Suspense>
  );
}
