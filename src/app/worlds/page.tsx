'use client';

import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { PanelProvider } from "@/contexts/PanelContext";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { CollectionModal } from "@/components/collections/CollectionModal";
import { AddRepositoryModal } from "@/components/collections/AddRepositoryModal";
import { GitHubSyncModal } from "@/components/collections/GitHubSyncModal";
import '@principal-ade/panel-layouts/styles.css';
import { Plus, Layers } from 'lucide-react';
import type { Collection } from '@principal-ai/alexandria-collections';
import { CollectionsPageContent } from './CollectionsPageContent';

function CollectionsPageWrapper() {
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCollections = useUserCollections();
  const { user, isAuthenticated } = useAuth();

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
        router.replace(`/worlds?collection=${firstId}`, { scroll: false });
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
    router.replace(`/worlds?collection=${id}`, { scroll: false });
  }, [router]);

  const handleCreateCollection = useCallback(async (name: string, description: string, icon: string) => {
    const newCollection = await userCollections.createCollection(name, description, icon);
    setSelectedCollectionId(newCollection.id);
    router.replace(`/worlds?collection=${newCollection.id}`, { scroll: false });
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
        router.replace('/worlds', { scroll: false });
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

    const shareUrl = `${window.location.origin}/repos/${user.login}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    });
  }, [user?.login]);

  if (userCollections.loading) {
    return (
      <div
        className="w-screen flex items-center justify-center"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          height: '100vh'
        }}
      >
        Loading collections...
      </div>
    );
  }

  // Show login prompt for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div
        className="w-screen flex flex-col items-center justify-center gap-6"
        style={{
          background: theme.colors.background,
          height: '100vh',
          padding: '2rem',
        }}
      >
        <Layers size={64} style={{ color: theme.colors.primary, opacity: 0.8 }} />
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h1
            style={{
              margin: 0,
              marginBottom: '12px',
              fontSize: `${theme.fontSizes[5]}px`,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            Sign in to manage your collections
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[2]}px`,
              color: theme.colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            Create and organize collections of repositories to streamline your development workflow.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/api/auth/github')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: theme.colors.primary,
              color: theme.colors.textOnPrimary,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.medium,
            }}
          >
            Sign in with GitHub
          </button>
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: theme.colors.secondary,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.medium,
            }}
          >
            Go Home
          </button>
        </div>
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
      {/* Main Content */}
      {selectedCollection ? (
        <div style={{ height: '100vh' }}>
          <PanelProvider
            key={selectedCollectionId}
            workspace={{
              name: selectedCollection.name,
              path: `/repos`,
            }}
            repository={{
              name: previewedRepo ? previewedRepo.split('/')[1] || selectedCollection.name : selectedCollection.name,
              path: previewedRepo ? `/GitHub/${previewedRepo}` : `/repos`,
            }}
            githubRepo={previewedRepo || undefined}
            collectionId={selectedCollectionId || undefined}
            collectionRepositories={repositories}
          >
            <CollectionsPageContent
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
              color: theme.colors.textOnPrimary,
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

function CollectionsPageLoading() {
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
      Loading collections...
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<CollectionsPageLoading />}>
      <CollectionsPageWrapper />
    </Suspense>
  );
}
