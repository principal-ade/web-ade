'use client';

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { WorldsPageProvider, useWorldsPageProvider } from "@/contexts/WorldsPageProvider";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { withTelemetrySpan } from "@/lib/telemetry";
import { WorkspaceCollectionPanel } from "@industry-theme/alexandria-panels";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import {
  Layers,
  ExternalLink,
  ArrowLeft,
  Download,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { CollectionModal } from "@/components/collections/CollectionModal";
import { AddRepositoryModal } from "@/components/collections/AddRepositoryModal";
import type { Collection, CollectionMembership } from '@principal-ai/alexandria-collections';

// Static import for type safety
const WorkspaceCollectionPanelLoader = WorkspaceCollectionPanel;

interface UserInfo {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
}

interface SharedCollectionsData {
  user: UserInfo;
  exists: boolean;
  collections: Collection[] | null;
  memberships: CollectionMembership[] | null;
  repoUrl: string | null;
}

interface SharedCollectionsContentProps {
  userData: SharedCollectionsData;
  collections: Collection[];
  memberships: CollectionMembership[];
  selectedCollectionId: string | null;
  onImportCollection: (collection: Collection, collectionMemberships: CollectionMembership[]) => Promise<void>;
  importingCollectionId: string | null;
  importedCollectionIds: Set<string>;
  // Edit mode props
  canEdit: boolean;
  onRemoveRepository?: (repositoryId: string) => Promise<void>;
}

function SharedCollectionsContent({
  userData,
  collections,
  memberships,
  selectedCollectionId,
  onImportCollection,
  importingCollectionId,
  importedCollectionIds,
  canEdit,
  onRemoveRepository,
}: SharedCollectionsContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = useWorldsPageProvider();
  const { user, isAuthenticated } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);

  // Layout: just the collection panel (no right side panels for shared view)
  const layout: PanelLayout = {
    left: 'empty',
    middle: 'workspace-collection',
    right: 'empty',
  };

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const selectedCollection = useMemo(() => {
    return collections.find(c => c.id === selectedCollectionId);
  }, [collections, selectedCollectionId]);

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
              removeRepositoryFromWorkspace: canEdit && onRemoveRepository
                ? async (repoKey: string) => {
                    await onRemoveRepository(repoKey);
                  }
                : undefined,
            }}
            events={events}
            selectedRepository={previewedRepo ?? undefined}
            defaultShowSearch
          />
        </div>
      ),
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 border-b"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          paddingBottom: '0.75rem',
        }}
      >
        {/* Left: Org/User info */}
        <div className="flex items-center gap-4">
          {/* Org/User info */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={userData.user.avatar_url}
              alt={userData.user.name || userData.user.login}
              className="w-10 h-10 rounded-full"
            />
            <div>
              <div className="flex items-center gap-2">
                <span
                  style={{
                    fontSize: `${theme.fontSizes[3]}px`,
                    fontWeight: theme.fontWeights.semibold,
                    color: theme.colors.text,
                  }}
                >
                  {userData.user.name || userData.user.login}
                </span>
                <a
                  href={userData.user.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: theme.colors.textSecondary }}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
              {userData.user.bio && (
                <p
                  style={{
                    margin: 0,
                    fontSize: `${theme.fontSizes[1]}px`,
                    color: theme.colors.textSecondary,
                    maxWidth: '300px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {userData.user.bio}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Import button */}
        <div className="flex items-center gap-3">
          {/* Import button (only for authenticated users viewing someone else's collection without edit access) */}
          {isAuthenticated && selectedCollection && user?.login !== userData.user.login && !canEdit && (
            <button
              onClick={() => {
                const colMemberships = memberships.filter(m => m.collectionId === selectedCollection.id);
                onImportCollection(selectedCollection, colMemberships);
              }}
              disabled={importingCollectionId === selectedCollection.id || importedCollectionIds.has(selectedCollection.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: importedCollectionIds.has(selectedCollection.id)
                  ? '#10b98120'
                  : theme.colors.primary,
                color: importedCollectionIds.has(selectedCollection.id)
                  ? '#10b981'
                  : theme.colors.textOnPrimary,
                border: importedCollectionIds.has(selectedCollection.id)
                  ? '1px solid #10b981'
                  : 'none',
                opacity: importingCollectionId === selectedCollection.id ? 0.6 : 1,
                cursor: importingCollectionId === selectedCollection.id ? 'not-allowed' : 'pointer',
              }}
              title="Import to your collections"
            >
              {importingCollectionId === selectedCollection.id ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="hidden sm:inline">Importing...</span>
                </>
              ) : importedCollectionIds.has(selectedCollection.id) ? (
                <>
                  <Check size={16} />
                  <span className="hidden sm:inline">Imported</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span className="hidden sm:inline">Import</span>
                </>
              )}
            </button>
          )}

          {/* Login prompt if not authenticated */}
          {!isAuthenticated && (
            <div
              style={{
                fontSize: `${theme.fontSizes[1]}px`,
                color: theme.colors.textSecondary,
              }}
            >
              <Link
                href="/worlds"
                style={{ color: theme.colors.primary }}
              >
                Login
              </Link>
              {' to import'}
            </div>
          )}

          {/* Signed-in user avatar */}
          {isAuthenticated && user && (
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
          )}
        </div>
      </header>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{ left: 0, middle: 100, right: 0 }}
            minSizes={{ left: 0, middle: 100, right: 0 }}
            collapsiblePanels={{ left: false, right: false }}
            collapsed={{ left: true, right: true }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={{ left: 0, middle: 100, right: 0 }}
            minSizes={{ left: 0, middle: 100, right: 0 }}
            collapsiblePanels={{ left: false, right: false }}
            collapsed={{ left: true, right: true }}
            showCollapseButtons={false}
          />
        )}
      </div>

      {/* Global Command Palette (Cmd+Shift+P) */}
      <GlobalCommandPalette
        events={events}
        autocompleteData={{
          collections: collections.map(c => ({ id: c.id, name: c.name })),
        }}
      />
    </div>
  );
}

function SharedCollectionsWrapper() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useParams();
  const username = params.username as string;
  const userCollections = useUserCollections();
  const { isAuthenticated } = useAuth();

  const [collectionsData, setCollectionsData] = useState<SharedCollectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [importingCollectionId, setImportingCollectionId] = useState<string | null>(null);
  const [importedCollectionIds, setImportedCollectionIds] = useState<Set<string>>(new Set());

  // Edit mode state
  const [canEdit, setCanEdit] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addRepoModalOpen, setAddRepoModalOpen] = useState(false);

  // Fetch user's public collections
  useEffect(() => {
    if (!username) return;

    setLoading(true);
    setError(null);

    fetch(`/api/github/collections/${username}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch collections');
        }
        return res.json();
      })
      .then((data: SharedCollectionsData) => {
        setCollectionsData(data);
        // Auto-select first collection
        if (data.exists && data.collections?.length) {
          setSelectedCollectionId(data.collections[0]!.id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch shared collections:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [username]);

  // Check permissions when authenticated
  useEffect(() => {
    if (!username || !isAuthenticated) {
      setCanEdit(false);
      return;
    }

    fetch(`/api/github/collections/${username}/permissions`)
      .then(res => res.json())
      .then(data => {
        setCanEdit(data.canEdit === true);
      })
      .catch(() => {
        setCanEdit(false);
      });
  }, [username, isAuthenticated]);

  // Get collections array
  const collections = useMemo(() => {
    return collectionsData?.collections || [];
  }, [collectionsData]);

  // Get memberships array
  const memberships = useMemo(() => {
    return collectionsData?.memberships || [];
  }, [collectionsData]);

  // Get repositories for selected collection
  const repositories = useMemo(() => {
    if (!selectedCollectionId) return [];
    return memberships
      .filter(m => m.collectionId === selectedCollectionId)
      .map(m => m.repositoryId);
  }, [selectedCollectionId, memberships]);

  // Handle import collection
  const handleImportCollection = useCallback(async (collection: Collection, collectionMemberships: CollectionMembership[]) => {
    await withTelemetrySpan('api.collections.import', async (emit) => {
      try {
        setImportingCollectionId(collection.id);

        emit('collection.import.started', {
          sourceUsername: username,
          collectionName: collection.name,
        });

        emit('collection.import.fetch-source');

        // Create a new collection with the same name (maybe add "from @username")
        const importedName = `${collection.name} (from @${username})`;

        emit('collection.import.create-copy', {
          newCollectionName: importedName,
        });

        const newCollection = await userCollections.createCollection(
          importedName,
          collection.description,
          collection.icon
        );

        emit('collection.import.copy-memberships', {
          membershipCount: collectionMemberships.length,
        });

        // Add all repositories from memberships
        for (const membership of collectionMemberships) {
          await userCollections.addRepository(newCollection.id, membership.repositoryId);
        }

        emit('collection.import.github.sync');

        // Mark as imported
        setImportedCollectionIds(prev => new Set([...prev, collection.id]));

        emit('collection.import.success', {
          newCollectionId: newCollection.id,
        });
      } catch (err) {
        emit('collection.import.error', {
          'error.message': err instanceof Error ? err.message : 'Unknown error',
        });
        // Could show an error toast here
        throw err;
      } finally {
        setImportingCollectionId(null);
      }
    });
  }, [username, userCollections]);

  // Save collections and memberships to GitHub
  const saveToGitHub = useCallback(async (
    updatedCollections: Collection[],
    updatedMemberships: CollectionMembership[]
  ) => {
    const response = await fetch(`/api/github/collections/${username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collections: updatedCollections, memberships: updatedMemberships }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save collections');
    }

    // Update local state
    setCollectionsData(prev => prev ? {
      ...prev,
      collections: updatedCollections,
      memberships: updatedMemberships,
    } : null);
  }, [username]);

  // Handle create collection
  const handleCreateCollection = useCallback(async (name: string, description: string, icon: string) => {
    const newCollection: Collection = {
      id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      icon,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      members: [],
    };

    const updatedCollections = [...collections, newCollection];
    await saveToGitHub(updatedCollections, memberships);
    setSelectedCollectionId(newCollection.id);
  }, [collections, memberships, saveToGitHub]);

  // Handle update collection
  const handleUpdateCollection = useCallback(async (name: string, description: string, icon: string) => {
    if (!selectedCollectionId) return;

    const updatedCollections = collections.map(col =>
      col.id === selectedCollectionId
        ? { ...col, name, description, icon, updatedAt: Date.now() }
        : col
    );

    await saveToGitHub(updatedCollections, memberships);
  }, [collections, memberships, selectedCollectionId, saveToGitHub]);

  // Handle delete collection
  const handleDeleteCollection = useCallback(async () => {
    if (!selectedCollectionId) return;

    const updatedCollections = collections.filter(col => col.id !== selectedCollectionId);
    const updatedMemberships = memberships.filter(m => m.collectionId !== selectedCollectionId);
    await saveToGitHub(updatedCollections, updatedMemberships);

    // Select first remaining collection
    if (updatedCollections.length > 0) {
      setSelectedCollectionId(updatedCollections[0]!.id);
    } else {
      setSelectedCollectionId(null);
    }
  }, [collections, memberships, selectedCollectionId, saveToGitHub]);

  // Handle add repository
  const handleAddRepository = useCallback(async (repositoryId: string) => {
    if (!selectedCollectionId) return;

    // Add a new membership
    const newMembership: CollectionMembership = {
      repositoryId,
      collectionId: selectedCollectionId,
      addedAt: Date.now(),
    };

    const updatedMemberships = [...memberships, newMembership];

    // Update the collection's updatedAt
    const updatedCollections = collections.map(col =>
      col.id === selectedCollectionId
        ? { ...col, updatedAt: Date.now() }
        : col
    );

    await saveToGitHub(updatedCollections, updatedMemberships);
  }, [collections, memberships, selectedCollectionId, saveToGitHub]);

  // Handle remove repository
  const handleRemoveRepository = useCallback(async (repositoryId: string) => {
    if (!selectedCollectionId) return;

    // Remove the membership
    const updatedMemberships = memberships.filter(
      m => !(m.collectionId === selectedCollectionId && m.repositoryId === repositoryId)
    );

    // Update the collection's updatedAt
    const updatedCollections = collections.map(col =>
      col.id === selectedCollectionId
        ? { ...col, updatedAt: Date.now() }
        : col
    );

    await saveToGitHub(updatedCollections, updatedMemberships);
  }, [collections, memberships, selectedCollectionId, saveToGitHub]);

  // Loading state
  if (loading) {
    return (
      <div
        className="w-screen flex items-center justify-center"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          height: '100vh'
        }}
      >
        <Loader2 size={32} className="animate-spin" style={{ color: theme.colors.primary }} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="w-screen flex flex-col items-center justify-center gap-4"
        style={{
          background: theme.colors.background,
          height: '100vh'
        }}
      >
        <AlertCircle size={48} style={{ color: '#ef4444' }} />
        <h2
          style={{
            margin: 0,
            fontSize: `${theme.fontSizes[4]}px`,
            color: theme.colors.text,
          }}
        >
          {error === 'User not found' ? 'User Not Found' : 'Failed to Load'}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: `${theme.fontSizes[2]}px`,
            color: theme.colors.textSecondary,
          }}
        >
          {error === 'User not found'
            ? `The user "${username}" doesn't exist on GitHub.`
            : error}
        </p>
        <button
          onClick={() => router.push('/collections')}
          className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:opacity-80"
          style={{
            background: theme.colors.primary,
            color: theme.colors.textOnPrimary,
            border: 'none',
            cursor: 'pointer',
            fontSize: `${theme.fontSizes[2]}px`,
          }}
        >
          <ArrowLeft size={16} />
          Back to Collections
        </button>
      </div>
    );
  }

  // User doesn't have collections repo
  if (collectionsData && !collectionsData.exists) {
    return (
      <div
        className="w-screen flex flex-col items-center justify-center gap-4"
        style={{
          background: theme.colors.background,
          height: '100vh'
        }}
      >
        <div className="flex items-center gap-4 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={collectionsData.user.avatar_url}
            alt={collectionsData.user.name || collectionsData.user.login}
            className="w-16 h-16 rounded-full"
          />
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[5]}px`,
                color: theme.colors.text,
              }}
            >
              {collectionsData.user.name || collectionsData.user.login}
            </h2>
            <a
              href={collectionsData.user.html_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: `${theme.fontSizes[2]}px`,
                color: theme.colors.textSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              @{collectionsData.user.login}
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <Layers size={48} style={{ opacity: 0.5, color: theme.colors.textSecondary }} />
        <p
          style={{
            margin: 0,
            fontSize: `${theme.fontSizes[2]}px`,
            color: theme.colors.textSecondary,
            textAlign: 'center',
          }}
        >
          {collectionsData.user.name || collectionsData.user.login} hasn&apos;t shared any collections yet.
        </p>
        <button
          onClick={() => router.push('/collections')}
          className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:opacity-80"
          style={{
            background: theme.colors.secondary,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            cursor: 'pointer',
            fontSize: `${theme.fontSizes[2]}px`,
          }}
        >
          <ArrowLeft size={16} />
          Back to Collections
        </button>
      </div>
    );
  }

  // No collections in repo
  if (!collections.length) {
    return (
      <div
        className="w-screen flex flex-col items-center justify-center gap-4"
        style={{
          background: theme.colors.background,
          height: '100vh'
        }}
      >
        <Layers size={48} style={{ opacity: 0.5, color: theme.colors.textSecondary }} />
        <p
          style={{
            margin: 0,
            fontSize: `${theme.fontSizes[2]}px`,
            color: theme.colors.textSecondary,
          }}
        >
          {username}&apos;s collections are empty.
        </p>
        <button
          onClick={() => router.push('/collections')}
          className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:opacity-80"
          style={{
            background: theme.colors.secondary,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            cursor: 'pointer',
            fontSize: `${theme.fontSizes[2]}px`,
          }}
        >
          <ArrowLeft size={16} />
          Back to Collections
        </button>
      </div>
    );
  }

  // Get selected collection for PanelProvider
  const selectedCollection = collections.find(c => c.id === selectedCollectionId);

  return (
    <div
      className="w-screen overflow-hidden"
      style={{
        background: theme.colors.background,
        height: '100vh'
      }}
    >
      <div style={{ height: '100vh' }}>
        <WorldsPageProvider
          key={selectedCollectionId}
          workspace={{
            name: selectedCollection?.name || 'Shared Collections',
            path: `/collections/${username}`,
          }}
          repository={{
            name: selectedCollection?.name || 'Shared Collections',
            path: `/collections/${username}`,
          }}
          collectionId={selectedCollectionId || undefined}
          collectionRepositories={repositories}
        >
          <SharedCollectionsContent
            userData={collectionsData!}
            collections={collections}
            memberships={memberships}
            selectedCollectionId={selectedCollectionId}
            onImportCollection={handleImportCollection}
            importingCollectionId={importingCollectionId}
            importedCollectionIds={importedCollectionIds}
            canEdit={canEdit}
            onRemoveRepository={canEdit ? handleRemoveRepository : undefined}
          />
        </WorldsPageProvider>
      </div>

      {/* Modals (only when canEdit) */}
      {canEdit && (
        <>
          <CollectionModal
            isOpen={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            onSave={handleCreateCollection}
            mode="create"
          />

          {selectedCollection && (
            <>
              <CollectionModal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSave={handleUpdateCollection}
                onDelete={handleDeleteCollection}
                initialData={{
                  id: selectedCollection.id,
                  name: selectedCollection.name,
                  description: selectedCollection.description,
                  icon: selectedCollection.icon,
                  createdAt: selectedCollection.createdAt,
                  updatedAt: selectedCollection.updatedAt,
                  members: selectedCollection.members || [],
                }}
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
        </>
      )}
    </div>
  );
}

function SharedCollectionsLoading() {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex items-center justify-center"
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
        height: '100vh'
      }}
    >
      <Loader2 size={32} className="animate-spin" style={{ color: theme.colors.primary }} />
    </div>
  );
}

export default function SharedCollectionsPage() {
  return (
    <Suspense fallback={<SharedCollectionsLoading />}>
      <SharedCollectionsWrapper />
    </Suspense>
  );
}
