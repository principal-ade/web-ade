'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Layers, Globe, Lock, Plus, Check, Loader2, X, FolderPlus } from 'lucide-react';
import type { BookmarkRepo } from './types';
import type { Collection } from '@/lib/starred-collections/types';

interface CollectionsBookmarkPanelProps {
  currentRepo: BookmarkRepo;
  onClose: () => void;
}

export function CollectionsBookmarkPanel({
  currentRepo,
  onClose,
}: CollectionsBookmarkPanelProps) {
  const { theme } = useTheme();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create collection state
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [newCollectionVis, setNewCollectionVis] = useState<'public' | 'private'>('private');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Toggle in-progress states keyed by collectionId
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});

  const fetchCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/starred-collections');
      if (!res.ok) {
        throw new Error('Failed to fetch collections');
      }
      const data = await res.json();
      setCollections(data.collections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleToggleRepo = async (collection: Collection) => {
    const isSaved = collection.repos.some(
      (r) =>
        r.owner.toLowerCase() === currentRepo.owner.login.toLowerCase() &&
        r.repo.toLowerCase() === currentRepo.name.toLowerCase()
    );

    setTogglingIds((prev) => ({ ...prev, [collection.id]: true }));

    try {
      if (isSaved) {
        // DELETE
        const res = await fetch(
          `/api/starred-collections/${collection.id}/repos/${currentRepo.owner.login}/${currentRepo.name}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          throw new Error('Failed to remove repository');
        }
      } else {
        // POST
        const res = await fetch(`/api/starred-collections/${collection.id}/repos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: currentRepo.owner.login,
            repo: currentRepo.name,
          }),
        });
        if (!res.ok) {
          throw new Error('Failed to add repository');
        }
      }
      // Re-fetch to get updated collections state
      await fetchCollections();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setTogglingIds((prev) => ({ ...prev, [collection.id]: false }));
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) {
      setCreateError('Name is required');
      return;
    }

    try {
      setCreateLoading(true);
      setCreateError(null);
      const res = await fetch('/api/starred-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCollectionName.trim(),
          description: newCollectionDesc.trim() || undefined,
          visibility: newCollectionVis,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create collection');
      }

      const newCol = await res.json();
      
      // Auto-add current repo to the newly created collection
      await fetch(`/api/starred-collections/${newCol.id}/repos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: currentRepo.owner.login,
          repo: currentRepo.name,
        }),
      });

      setNewCollectionName('');
      setNewCollectionDesc('');
      setNewCollectionVis('private');
      setIsCreating(false);
      await fetchCollections();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        background: theme.colors.background,
        borderLeft: `1px solid ${theme.colors.border}`,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div>
          <div
            style={{
              fontSize: theme.fontSizes[3],
              fontWeight: theme.fontWeights.bold,
              letterSpacing: '0.4px',
            }}
          >
            Collections
          </div>
          <div
            style={{
              fontSize: theme.fontSizes[0],
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: theme.colors.accent,
              fontWeight: theme.fontWeights.bold,
            }}
          >
            ✦ Starred Lists ✦
          </div>
        </div>
        <button
          type="button"
          aria-label="Close collections"
          onClick={onClose}
          className="flex items-center justify-center transition-opacity hover:opacity-70"
          style={{
            width: 30,
            height: 30,
            borderRadius: theme.radii[1] ?? 6,
            color: theme.colors.textMuted,
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Main body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Current Repository Context */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: theme.radii[2] ?? 10,
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div
            style={{
              fontSize: theme.fontSizes[0],
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: theme.colors.textMuted,
              marginBottom: 8,
            }}
          >
            Add/Remove Repository
          </div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${currentRepo.owner.avatar_url}${
                currentRepo.owner.avatar_url.includes('?') ? '&' : '?'
              }s=48`}
              alt=""
              width={28}
              height={28}
              style={{ borderRadius: theme.radii[1] ?? 5, flexShrink: 0 }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate font-semibold"
                style={{ fontSize: theme.fontSizes[2], color: theme.colors.text }}
              >
                {currentRepo.name}
              </div>
              <div
                className="truncate"
                style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}
              >
                {currentRepo.owner.login}
              </div>
            </div>
          </div>
        </div>

        {/* Collections List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm" style={{ color: theme.colors.textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading collections...
          </div>
        ) : error ? (
          <div className="py-4 text-center text-sm" style={{ color: theme.colors.error }}>
            {error}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: theme.fontSizes[1], color: theme.colors.textSecondary, fontWeight: 500 }}>
                Select Collections
              </span>
              {!isCreating && (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity"
                  style={{ color: theme.colors.primary }}
                >
                  <Plus size={14} />
                  New Collection
                </button>
              )}
            </div>

            {/* Create inline form */}
            {isCreating && (
              <form
                onSubmit={handleCreateCollection}
                className="flex flex-col gap-3 p-3.5 rounded-lg border mb-2"
                style={{
                  background: theme.colors.surface,
                  borderColor: theme.colors.border,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.colors.textMuted }}>
                    New Starred Collection
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setCreateError(null);
                    }}
                    style={{ color: theme.colors.textMuted }}
                    className="hover:opacity-75 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="col-name" className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    Name *
                  </label>
                  <input
                    id="col-name"
                    type="text"
                    required
                    disabled={createLoading}
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="e.g. My Favorites"
                    className="w-full px-2.5 py-1.5 rounded text-sm border focus:outline-none focus:ring-1"
                    style={{
                      background: theme.colors.background,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="col-desc" className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    Description
                  </label>
                  <textarea
                    id="col-desc"
                    disabled={createLoading}
                    value={newCollectionDesc}
                    onChange={(e) => setNewCollectionDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full px-2.5 py-1.5 rounded text-sm border focus:outline-none focus:ring-1 resize-none"
                    style={{
                      background: theme.colors.background,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                      height: 50,
                    }}
                  />
                </div>

                <div className="flex items-center gap-4 py-0.5">
                  <span className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>Visibility:</span>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="radio"
                      disabled={createLoading}
                      checked={newCollectionVis === 'private'}
                      onChange={() => setNewCollectionVis('private')}
                      className="cursor-pointer"
                    />
                    <Lock size={12} style={{ color: theme.colors.textMuted }} /> Private
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="radio"
                      disabled={createLoading}
                      checked={newCollectionVis === 'public'}
                      onChange={() => setNewCollectionVis('public')}
                      className="cursor-pointer"
                    />
                    <Globe size={12} style={{ color: theme.colors.textMuted }} /> Public
                  </label>
                </div>

                {createError && (
                  <div className="text-xs" style={{ color: theme.colors.error }}>
                    {createError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                  style={{
                    background: theme.colors.primary,
                    color: theme.colors.background,
                  }}
                >
                  {createLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FolderPlus size={13} />
                  )}
                  Create & Add Repo
                </button>
              </form>
            )}

            {collections.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: theme.colors.textMuted }}>
                No starred collections yet. Create one above!
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {collections.map((col) => {
                  const isSaved = col.repos.some(
                    (r) =>
                      r.owner.toLowerCase() === currentRepo.owner.login.toLowerCase() &&
                      r.repo.toLowerCase() === currentRepo.name.toLowerCase()
                  );
                  const isToggling = togglingIds[col.id];

                  return (
                    <button
                      key={col.id}
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleToggleRepo(col)}
                      className="w-full flex items-center justify-between p-3.5 rounded-lg border text-left hover:scale-[1.01] active:scale-[0.99] transition-all"
                      style={{
                        background: theme.colors.surface,
                        borderColor: isSaved ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <div className="min-w-0 flex-1 flex items-start gap-2.5">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
                          style={{
                            background: isSaved
                              ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
                              : theme.colors.backgroundSecondary,
                            color: isSaved ? theme.colors.primary : theme.colors.textMuted,
                          }}
                        >
                          <Layers size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate text-sm" style={{ color: theme.colors.text }}>
                            {col.name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: theme.colors.textMuted }}>
                            <span className="flex items-center gap-0.5">
                              {col.visibility === 'public' ? <Globe size={10} /> : <Lock size={10} />}
                              {col.visibility}
                            </span>
                            <span>•</span>
                            <span>{col.repos.length} {col.repos.length === 1 ? 'repo' : 'repos'}</span>
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center justify-center w-5 h-5 rounded-md border transition-all"
                        style={{
                          borderColor: isSaved ? theme.colors.primary : theme.colors.border,
                          background: isSaved ? theme.colors.primary : 'transparent',
                          color: theme.colors.background,
                        }}
                      >
                        {isToggling ? (
                          <Loader2 size={12} className="animate-spin" style={{ color: isSaved ? theme.colors.background : theme.colors.textMuted }} />
                        ) : isSaved ? (
                          <Check size={12} strokeWidth={3} />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
