'use client';

import React, { useState, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Plus, Edit2 } from 'lucide-react';
import type { Collection } from '@principal-ai/alexandria-collections';
import { useUserCollections } from '@/contexts/UserCollectionsContext';
import { CollectionModal } from './CollectionModal';
import { AvatarStack, type RepositoryInfo } from './AvatarStack';

interface UserCollectionsPanelProps {
  onCollectionClick?: (collectionId: string) => void;
}

/**
 * Skeleton card for loading state
 */
const SkeletonCard: React.FC<{ theme: ReturnType<typeof useTheme>['theme'] }> = ({
  theme,
}) => {
  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        width: '280px',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '10px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div>
        <div
          style={{
            width: 168,
            height: 18,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
            marginBottom: '8px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
        <div
          style={{
            width: 210,
            height: 14,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

/**
 * Collection card component
 */
const CollectionCard: React.FC<{
  collection: Collection;
  repositories: RepositoryInfo[];
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
  onEdit: () => void;
}> = ({ collection, repositories, theme, onClick, onEdit }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        padding: '24px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${isHovered ? theme.colors.primary : theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        width: '280px',
        textAlign: 'center',
        transform: isHovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Edit button */}
      {isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '6px',
            padding: '6px',
            cursor: 'pointer',
            color: theme.colors.textSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Edit collection"
        >
          <Edit2 size={14} />
        </button>
      )}

      {/* Avatar Stack */}
      <AvatarStack repositories={repositories} size={36} maxAvatars={4} />
      <div>
        <div
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            marginBottom: '8px',
          }}
        >
          {collection.name}
        </div>
        <div
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {collection.description || `${repositories.length} repositories`}
        </div>
      </div>
    </button>
  );
};

/**
 * Create collection card
 */
const CreateCollectionCard: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ theme, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '24px',
        borderRadius: '12px',
        backgroundColor: 'transparent',
        border: `2px dashed ${isHovered ? theme.colors.primary : theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        width: '280px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '10px',
          backgroundColor: isHovered
            ? `${theme.colors.primary}15`
            : theme.colors.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isHovered ? theme.colors.primary : theme.colors.textSecondary,
          transition: 'all 0.2s ease',
        }}
      >
        <Plus size={24} />
      </div>
      <div>
        <div
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: isHovered ? theme.colors.primary : theme.colors.text,
            marginBottom: '8px',
          }}
        >
          New Collection
        </div>
        <div
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          Create a collection to organize repositories
        </div>
      </div>
    </button>
  );
};

export function UserCollectionsPanel({ onCollectionClick }: UserCollectionsPanelProps) {
  const { theme } = useTheme();
  const {
    collections,
    loading,
    createCollection,
    updateCollection,
    deleteCollection,
    getCollectionRepositoryInfos,
  } = useUserCollections();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);

  const handleCreate = useCallback(() => {
    setEditingCollection(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((collection: Collection) => {
    setEditingCollection(collection);
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(
    async (name: string, description: string, icon: string) => {
      if (editingCollection) {
        await updateCollection(editingCollection.id, { name, description, icon });
      } else {
        await createCollection(name, description, icon);
      }
    },
    [editingCollection, createCollection, updateCollection]
  );

  const handleDelete = useCallback(async () => {
    if (editingCollection) {
      await deleteCollection(editingCollection.id);
    }
  }, [editingCollection, deleteCollection]);

  const handleCollectionClick = useCallback(
    (collectionId: string) => {
      if (onCollectionClick) {
        onCollectionClick(collectionId);
      }
    },
    [onCollectionClick]
  );

  // Don't show section if not loading and no collections
  if (!loading && collections.length === 0) {
    return (
      <>
        <div
          style={{
            padding: '24px 32px 48px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${(theme.fontSizes[6] as number) || 32}px`,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.textSecondary,
              textAlign: 'center',
            }}
          >
            Your Collections
          </h2>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '1200px',
            }}
          >
            <CreateCollectionCard theme={theme} onClick={handleCreate} />
          </div>
        </div>

        <CollectionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          mode="create"
        />
      </>
    );
  }

  return (
    <>
      <div
        style={{
          padding: '24px 32px 48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: `${(theme.fontSizes[6] as number) || 32}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
            textAlign: 'center',
          }}
        >
          Your Collections
        </h2>
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: '1200px',
          }}
        >
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} theme={theme} />
            ))
          ) : (
            <>
              {collections.map((collection) => (
                <CollectionCard
                  key={collection.id}
                  collection={collection}
                  repositories={getCollectionRepositoryInfos(collection.id)}
                  theme={theme}
                  onClick={() => handleCollectionClick(collection.id)}
                  onEdit={() => handleEdit(collection)}
                />
              ))}
              <CreateCollectionCard theme={theme} onClick={handleCreate} />
            </>
          )}
        </div>
      </div>

      <CollectionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={editingCollection ? handleDelete : undefined}
        initialData={editingCollection || undefined}
        mode={editingCollection ? 'edit' : 'create'}
      />
    </>
  );
}
