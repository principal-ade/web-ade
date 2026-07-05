'use client';

import { useMemo, useState } from 'react';
import { Layers, Search, Star, Users, Plus, ChevronLeft } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { Collection } from '@/lib/starred-collections/types';
import { CreateCollectionModal } from './CreateCollectionModal';

// ---------------------------------------------------------------------------
// HomeCollectionsView — the "Collections" destination: a list of the user's
// curated collections of repositories. Each collection shows its name, icon,
// description, and counts of repos/users it contains.
// Presentational; reports clicks via `onSelectCollection`.
// ---------------------------------------------------------------------------

export interface HomeCollectionsViewProps {
  /** Collections list. `null` = loading. */
  collections: Collection[] | null;
  error?: string | null;
  selectedCollectionId?: string | null;
  onSelectCollection: (collection: Collection) => void;
  onBack: () => void;
  onCreateCollection: (name: string, description: string, visibility: 'public' | 'private') => Promise<void>;
  onRefresh?: () => void;
}

export function HomeCollectionsView({
  collections,
  error = null,
  selectedCollectionId = null,
  onSelectCollection,
  onBack,
  onCreateCollection,
  onRefresh,
}: HomeCollectionsViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filtered = useMemo(() => {
    if (!collections) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    );
  }, [collections, filter]);

  const handleCreateCollection = async (name: string, description: string, visibility: 'public' | 'private') => {
    await onCreateCollection(name, description, visibility);
    onRefresh?.();
  };

  return (
    <>
      {/* Custom header with add button */}
      <div
        className="px-3 py-2 border-b sticky top-0 z-10 shrink-0 flex items-center gap-1.5"
        style={{
          borderColor: theme.colors.border,
          background: theme.colors.background,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 -ml-1 px-1.5 py-1 rounded transition-opacity hover:opacity-70 shrink-0"
          style={{ color: theme.colors.textSecondary, cursor: 'pointer' }}
          title="Back to overview"
          aria-label="Back to overview"
        >
          <ChevronLeft size={16} />
          <span
            style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Collections
          </span>
          {collections != null && (
            <span
              style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
            >
              {collections.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="ml-auto flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{
            color: theme.colors.primary,
            cursor: 'pointer',
            background: `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`,
          }}
          title="Create collection"
          aria-label="Create collection"
        >
          <Plus size={16} />
        </button>
      </div>

      {collections != null && collections.length >= 8 && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2 shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <Search size={14} style={{ color: theme.colors.textMuted }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter collections"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[1],
            }}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
        {error ? (
          <ListMessage>Couldn&rsquo;t load collections: {error}</ListMessage>
        ) : filtered === null ? (
          <ListMessage>Loading collections…</ListMessage>
        ) : collections!.length === 0 ? (
          <ListMessage>
            No collections yet. Create collections to organize your starred repositories.
          </ListMessage>
        ) : filtered.length === 0 ? (
          <ListMessage>No collections match &ldquo;{filter}&rdquo;.</ListMessage>
        ) : (
          filtered.map((collection) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              selected={collection.id === selectedCollectionId}
              onSelect={() => onSelectCollection(collection)}
            />
          ))
        )}
      </div>

      <CreateCollectionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreateCollection}
      />
    </>
  );
}

function CollectionRow({
  collection,
  selected,
  onSelect,
}: {
  collection: Collection;
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const repoCount = collection.repos?.length ?? 0;
  const userCount = collection.users?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left px-3 py-3 border-b transition-colors"
      style={{
        borderColor: theme.colors.border,
        background: selected
          ? `color-mix(in srgb, ${theme.colors.primary} 8%, ${theme.colors.background})`
          : 'transparent',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 flex items-center justify-center rounded-md"
          style={{
            width: 36,
            height: 36,
            background: selected
              ? theme.colors.primary
              : theme.colors.backgroundSecondary,
            color: selected ? 'white' : theme.colors.textMuted,
          }}
        >
          <Layers size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            {collection.name}
            {collection.ownerType === 'org' && collection.ownerLogin && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: theme.fontSizes[0],
                  fontWeight: theme.fontWeights.body,
                  color: theme.colors.textMuted,
                }}
              >
                ({collection.ownerLogin})
              </span>
            )}
          </div>

          {collection.description && (
            <div
              className="mt-1"
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSizes[0],
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {collection.description}
            </div>
          )}

          {(repoCount > 0 || userCount > 0) && (
            <div
              className="mt-2 flex items-center gap-3"
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSizes[0],
              }}
            >
              {repoCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star size={11} />
                  {repoCount.toLocaleString()} {repoCount === 1 ? 'repo' : 'repos'}
                </span>
              )}
              {userCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users size={11} />
                  {userCount.toLocaleString()} {userCount === 1 ? 'user' : 'users'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function ListMessage({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      className="px-4 py-6"
      style={{
        color: theme.colors.textMuted,
        fontSize: theme.fontSizes[1],
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
