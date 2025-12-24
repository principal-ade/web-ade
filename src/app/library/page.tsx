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
import { ChevronDown, Plus, FolderOpen, Layers, Edit2, PanelRightOpen, PanelRightClose, User, Cloud, CloudOff, Share2, Check } from 'lucide-react';
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
}: LibraryPageContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = usePanelProvider();
  const { user, isAuthenticated, isLoading, login } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Layout: no left panel, middle is collection, right is starred/projects
  const layout: PanelLayout = {
    left: 'empty',
    middle: 'workspace-collection',
    right: {
      type: 'tabs',
      panels: ['github-starred', 'github-projects'],
    },
  };

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
          setPreviewedRepo(payload.repository.full_name);
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
  }, [events, router]);

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
                setPreviewedRepo(repository.full_name);
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
  ];

  return (
    <div className="h-full w-full flex flex-col">
      {/* Custom header with collection dropdown */}
      <header
        className="h-14 flex items-center justify-between px-4 border-b"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        {/* Left: Collection Dropdown */}
        <div className="flex items-center gap-3">
          <CollectionDropdown
            collections={allCollections}
            selectedId={selectedCollectionId}
            onSelect={onSelectCollection}
            onCreateNew={onCreateNew}
            theme={theme}
          />
        </div>

        {/* Right: Actions and toggles */}
        <div className="flex items-center gap-3">
          {/* User collection action buttons */}
          {isUserCollection && (
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

          {/* Right panel toggle */}
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{
              background: rightCollapsed ? theme.colors.primary : theme.colors.secondary,
              color: rightCollapsed ? theme.colors.background : theme.colors.text,
            }}
            title={rightCollapsed ? 'Expand right panel' : 'Collapse right panel'}
          >
            {rightCollapsed ? (
              <PanelRightOpen size={16} />
            ) : (
              <PanelRightClose size={16} />
            )}
          </button>

          {/* Login / User */}
          {isLoading ? (
            <div className="text-sm" style={{ color: theme.colors.textMuted }}>
              Loading...
            </div>
          ) : isAuthenticated && user ? (
            <button
              onClick={() => router.push(`/${user.login}`)}
              className="flex items-center rounded-full transition-all hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatar_url}
                alt={user.name || user.login}
                className="w-8 h-8 rounded-full"
              />
            </button>
          ) : (
            <button
              onClick={() => login()}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
              }}
              title="Login"
            >
              <User size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{ left: 0, middle: 60, right: 40 }}
            minSizes={{ left: 0, middle: 40, right: 20 }}
            collapsiblePanels={{ left: false, right: true }}
            collapsed={{ left: true, right: rightCollapsed }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={{ left: 0, middle: 60, right: 40 }}
            minSizes={{ left: 0, middle: 40, right: 20 }}
            collapsiblePanels={{ left: false, right: true }}
            collapsed={{ left: true, right: rightCollapsed }}
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
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
          cursor: 'pointer',
          color: theme.colors.text,
          fontSize: `${theme.fontSizes[2]}px`,
          fontWeight: theme.fontWeights.medium,
          minWidth: '200px',
        }}
      >
        <Layers size={18} style={{ color: theme.colors.primary }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {selected?.name || 'Select Collection'}
        </span>
        <ChevronDown size={16} style={{ color: theme.colors.textSecondary }} />
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
            key={selectedCollectionId}
            workspace={{
              name: selectedCollection.name,
              path: `/library`,
            }}
            repository={{
              name: selectedCollection.name,
              path: `/library`,
            }}
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
