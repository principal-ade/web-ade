'use client';

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { SharedCollectionsProvider, useSharedCollectionsProvider } from "@/contexts/SharedCollectionsProvider";
import { useAuth } from "@/contexts/AuthContext";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { WorkspaceCollectionPanel, UserProfilePanel } from "@industry-theme/alexandria-panels";
import { CollectionMapPanel } from "@industry-theme/repository-composition-panels";
import { CodeCityPanel } from "@industry-theme/file-city-panel";
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
  Loader2,
  AlertCircle,
  Map,
  User,
} from 'lucide-react';
import { CollectionModal } from "@/components/collections/CollectionModal";
import { AddRepositoryModal } from "@/components/collections/AddRepositoryModal";
import type { Collection, CollectionMembership } from '@principal-ai/alexandria-collections';
import type { CollectionsPermissionsResponse } from '@/types/api';

// Static imports for type safety
const WorkspaceCollectionPanelLoader = WorkspaceCollectionPanel;
const CollectionMapPanelLoader = CollectionMapPanel;
const UserProfilePanelLoader = UserProfilePanel;
const FileCityPanelLoader = CodeCityPanel;

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
  collections: Collection[];
  // Edit mode props
  canEdit: boolean;
  onRemoveRepository?: (repositoryId: string) => Promise<void>;
  // Repository preview state (lifted from parent)
  previewedRepo: string | null;
  setPreviewedRepo: (repo: string | null) => void;
}

function SharedCollectionsContent({
  collections,
  canEdit,
  onRemoveRepository,
  previewedRepo,
  setPreviewedRepo,
}: SharedCollectionsContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = useSharedCollectionsProvider();
  const [isMobile, setIsMobile] = useState(false);

  // Layout: user profile on left, map in middle, file-city or collection list on right
  const layout: PanelLayout = {
    left: 'user-profile',
    middle: 'collection-map',
    right: previewedRepo ? 'file-city' : 'workspace-collection',
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
  }, [events, router, setPreviewedRepo]);

  const panels = [
    {
      id: 'empty',
      label: '',
      content: <div />,
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
      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{ left: 20, middle: 55, right: 25 }}
            minSizes={{ left: 15, middle: 40, right: 20 }}
            collapsiblePanels={{ left: true, right: true }}
            collapsed={{ left: false, right: false }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={{ left: 20, middle: 55, right: 25 }}
            minSizes={{ left: 15, middle: 40, right: 20 }}
            collapsiblePanels={{ left: true, right: true }}
            collapsed={{ left: false, right: false }}
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
  const searchParams = useSearchParams();
  const username = params.username as string;
  const { isAuthenticated } = useAuth();

  const [collectionsData, setCollectionsData] = useState<SharedCollectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  // Edit mode state
  const [canEdit, setCanEdit] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addRepoModalOpen, setAddRepoModalOpen] = useState(false);

  // Previewed repo state for overworld map click -> file city integration
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);

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
        // Auto-select collection from query param or first collection
        if (data.exists && data.collections?.length) {
          const collectionFromQuery = searchParams.get('collection');
          const validCollection = collectionFromQuery &&
            data.collections.find(c => c.id === collectionFromQuery);

          setSelectedCollectionId(
            validCollection ? collectionFromQuery : data.collections[0]!.id
          );
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch shared collections:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [username, searchParams]);

  // Check permissions when authenticated
  useEffect(() => {
    if (!username || !isAuthenticated) {
      setCanEdit(false);
      return;
    }

    fetch(`/api/github/collections/${username}/permissions`)
      .then(res => res.json())
      .then((data: CollectionsPermissionsResponse) => {
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

  // Get selected collection
  const selectedCollection = useMemo(() => {
    return collections.find(c => c.id === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  // Get repositories for selected collection (use collection.members directly)
  const repositories = useMemo(() => {
    if (!selectedCollection?.members) return [];
    return selectedCollection.members.map(m => m.repositoryId);
  }, [selectedCollection]);

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

  return (
    <div
      className="w-screen overflow-hidden"
      style={{
        background: theme.colors.background,
        height: '100vh'
      }}
    >
      <div style={{ height: '100vh' }}>
        <SharedCollectionsProvider
          key={selectedCollectionId}
          collection={selectedCollection}
          collectionRepositories={repositories}
          username={username}
          userProfile={{
            login: collectionsData!.user.login,
            id: 0,
            avatar_url: collectionsData!.user.avatar_url,
            name: collectionsData!.user.name,
            company: null,
            location: null,
            email: null,
            bio: collectionsData!.user.bio,
            public_repos: 0,
            public_gists: 0,
            followers: 0,
            following: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }}
          onRepositoryClicked={setPreviewedRepo}
          selectedRepositoryId={previewedRepo}
        >
          <SharedCollectionsContent
            collections={collections}
            canEdit={canEdit}
            onRemoveRepository={canEdit ? handleRemoveRepository : undefined}
            previewedRepo={previewedRepo}
            setPreviewedRepo={setPreviewedRepo}
          />
        </SharedCollectionsProvider>
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
