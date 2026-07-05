'use client';

import { useMemo, useState, useCallback } from 'react';
import { Search, Star, Trash2, ChevronLeft, Globe, Lock, Share2 } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RepoRowShell } from './RepoRowShell';
import type { Collection, CollectionRepo } from '@/lib/starred-collections/types';
import type { ProjectRepo } from './HomeProjectsView';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ---------------------------------------------------------------------------
// HomeCollectionDetailView — shows the repos within a selected collection.
// Similar to HomeProjectsView but for a single collection's repositories.
// Presentational; reports the picked repo via `onSelectRepo`.
// ---------------------------------------------------------------------------

export interface HomeCollectionDetailViewProps {
  /** The collection being viewed. */
  collection: Collection;
  /** full_name of the currently-open repo, highlighted in the list. */
  selectedFullName?: string | null;
  /** Current user's GitHub login (used to build share URLs for user-owned collections). */
  userLogin?: string;
  onSelectRepo: (repo: ProjectRepo) => void;
  onBack: () => void;
  onDeleteCollection: (collectionId: string) => Promise<void>;
  onUpdateCollection?: (collectionId: string, data: { visibility?: 'public' | 'private' }) => Promise<void>;
}

export function HomeCollectionDetailView({
  collection,
  selectedFullName = null,
  userLogin,
  onSelectRepo,
  onBack,
  onDeleteCollection,
  onUpdateCollection,
}: HomeCollectionDetailViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [showVisibilityInfo, setShowVisibilityInfo] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<'public' | 'private' | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    const ownerLogin =
      collection.ownerType === 'org'
        ? collection.ownerLogin
        : userLogin;
    if (!ownerLogin) return null;
    return `/collections/${ownerLogin}/${collection.id}`;
  }, [collection.ownerType, collection.ownerLogin, collection.id, userLogin]);

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    const url = `${window.location.origin}${shareUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in insecure contexts
    }
  }, [shareUrl]);

  const repos = useMemo(() => collection.repos ?? [], [collection.repos]);

  // Filter repos by owner/repo name or description
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        `${r.owner}/${r.repo}`.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false) ||
        (r.notes?.toLowerCase().includes(q) ?? false),
    );
  }, [repos, filter]);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await onDeleteCollection(collection.id);
      onBack();
    } catch (error) {
      console.error('Failed to delete collection:', error);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const executeToggle = async (next: 'public' | 'private') => {
    if (!onUpdateCollection) return;
    try {
      setTogglingVisibility(true);
      await onUpdateCollection(collection.id, { visibility: next });
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleToggleVisibility = () => {
    if (!onUpdateCollection) return;
    const next: 'public' | 'private' = collection.visibility === 'public' ? 'private' : 'public';

    // Check if user has dismissed the info modal
    if (typeof window !== 'undefined' && localStorage.getItem('collection-visibility-dismissed') === 'true') {
      executeToggle(next);
      return;
    }

    // Show the info modal first
    setPendingVisibility(next);
    setDontShowAgain(false);
    setShowVisibilityInfo(true);
  };

  const handleVisibilityInfoConfirm = () => {
    if (dontShowAgain && typeof window !== 'undefined') {
      localStorage.setItem('collection-visibility-dismissed', 'true');
    }
    setShowVisibilityInfo(false);
    if (pendingVisibility) {
      executeToggle(pendingVisibility);
      setPendingVisibility(null);
    }
  };

  const handleVisibilityInfoCancel = () => {
    setShowVisibilityInfo(false);
    setPendingVisibility(null);
  };

  return (
    <>
      {/* Custom header with delete button */}
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
          title="Back to collections"
          aria-label="Back to collections"
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
            {collection.name}
          </span>
          {repos.length > 0 && (
            <span
              style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
            >
              {repos.length}
            </span>
          )}
        </button>
        {shareUrl && collection.visibility === 'public' && (
          <button
            type="button"
            onClick={handleShare}
            className="ml-auto flex items-center justify-center w-7 h-7 rounded transition-colors"
            style={{
              color: copied ? theme.colors.primary : theme.colors.textMuted,
              cursor: 'pointer',
              background: copied
                ? `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`
                : `color-mix(in srgb, ${theme.colors.textMuted} 10%, transparent)`,
            }}
            title={copied ? 'Copied!' : 'Copy share link'}
            aria-label="Copy share link"
          >
            <Share2 size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={handleToggleVisibility}
          disabled={togglingVisibility}
          className="flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{
            color: collection.visibility === 'public' ? theme.colors.primary : theme.colors.textMuted,
            cursor: togglingVisibility ? 'not-allowed' : 'pointer',
            background: collection.visibility === 'public'
              ? `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`
              : `color-mix(in srgb, ${theme.colors.textMuted} 10%, transparent)`,
          }}
          title={collection.visibility === 'public' ? 'Make private' : 'Make public'}
          aria-label="Toggle collection visibility"
        >
          {collection.visibility === 'public' ? <Globe size={14} /> : <Lock size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{
            color: theme.colors.error,
            cursor: 'pointer',
            background: `color-mix(in srgb, ${theme.colors.error} 10%, transparent)`,
          }}
          title="Delete collection"
          aria-label="Delete collection"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {collection.description && (
        <div
          className="px-3 py-2 border-b"
          style={{
            borderColor: theme.colors.border,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textMuted,
            lineHeight: 1.4,
          }}
        >
          {collection.description}
        </div>
      )}

      {repos.length >= 8 && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2 shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <Search size={14} style={{ color: theme.colors.textMuted }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter repos"
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
        {repos.length === 0 ? (
          <ListMessage>
            This collection doesn&rsquo;t have any repositories yet.
          </ListMessage>
        ) : filtered.length === 0 ? (
          <ListMessage>No repos match &ldquo;{filter}&rdquo;.</ListMessage>
        ) : (
          filtered.map((repo) => (
            <CollectionRepoRow
              key={`${repo.owner}/${repo.repo}`}
              repo={repo}
              selected={`${repo.owner}/${repo.repo}` === selectedFullName}
              onSelect={() => {
                // Convert CollectionRepo to ProjectRepo format
                const projectRepo: ProjectRepo = {
                  id: 0, // Not used for selection
                  full_name: `${repo.owner}/${repo.repo}`,
                  name: repo.repo,
                  owner: {
                    login: repo.owner,
                    avatar_url: repo.avatarUrl,
                  },
                  description: repo.description ?? null,
                  stargazers_count: repo.stargazersCount,
                };
                onSelectRepo(projectRepo);
              }}
            />
          ))
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Collection"
          message={
            <>
              Are you sure you want to delete &ldquo;{collection.name}&rdquo;?
              <br />
              <br />
              This action cannot be undone. The repositories themselves will not be
              affected.
            </>
          }
          confirmLabel="Delete"
          destructive
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showVisibilityInfo && (
        <ConfirmDialog
          title={pendingVisibility === 'public' ? 'Make Public?' : 'Make Private?'}
          message={
            <>
              {pendingVisibility === 'public' ? (
                <>
                  Making this collection public means anyone can see the repos
                  and users you&rsquo;ve curated in it. It will appear on your
                  profile page.
                </>
              ) : (
                <>
                  Making this collection private means only you can see it. It
                  will no longer appear on your profile page.
                </>
              )}
              <br />
              <br />
              <label
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{ fontSize: 'inherit' }}
              >
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="rounded"
                />
                Don&rsquo;t show this again
              </label>
            </>
          }
          confirmLabel={pendingVisibility === 'public' ? 'Make Public' : 'Make Private'}
          busy={togglingVisibility}
          onConfirm={handleVisibilityInfoConfirm}
          onCancel={handleVisibilityInfoCancel}
        />
      )}
    </>
  );
}

function CollectionRepoRow({
  repo,
  selected,
  onSelect,
}: {
  repo: CollectionRepo;
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const fullName = `${repo.owner}/${repo.repo}`;

  return (
    <RepoRowShell fullName={fullName} selected={selected} onSelect={onSelect}>
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            repo.avatarUrl ??
            `https://github.com/${repo.owner}.png?size=72`
          }
          alt=""
          width={36}
          height={36}
          className="rounded-md shrink-0"
          style={{ background: theme.colors.backgroundSecondary }}
        />
        <div className="min-w-0 flex flex-col">
          <span
            className="truncate"
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
            }}
          >
            {repo.repo}
          </span>
          <span
            className="truncate"
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
            }}
          >
            {repo.owner}
          </span>
        </div>
      </div>

      {(repo.description || repo.notes) && (
        <div className="mt-1 flex flex-col gap-1">
          {repo.description && (
            <div
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSizes[0],
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {repo.description}
            </div>
          )}
          {repo.notes && (
            <div
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSizes[0],
                fontStyle: 'italic',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              Note: {repo.notes}
            </div>
          )}
        </div>
      )}

      {repo.stargazersCount != null && repo.stargazersCount > 0 && (
        <div
          className="mt-1 flex items-center gap-1"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[0],
          }}
        >
          <Star size={11} />
          {repo.stargazersCount.toLocaleString()}
        </div>
      )}
    </RepoRowShell>
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
