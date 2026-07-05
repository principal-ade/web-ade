'use client';

import { useMemo, useState } from 'react';
import { Layers, Search, Star, Users } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import type { Collection } from '@/lib/starred-collections/types';

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
}

export function HomeCollectionsView({
  collections,
  error = null,
  selectedCollectionId = null,
  onSelectCollection,
  onBack,
}: HomeCollectionsViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');

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

  return (
    <>
      <RailPaneHeader
        icon={<Layers size={14} />}
        label="Collections"
        count={collections?.length || undefined}
        onClose={onBack}
        closeAsBack
      />

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
