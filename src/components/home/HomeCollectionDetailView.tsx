'use client';

import { useMemo, useState } from 'react';
import { Layers, Search, Star } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import { RepoRowShell } from './RepoRowShell';
import type { Collection, CollectionRepo } from '@/lib/starred-collections/types';
import type { ProjectRepo } from './HomeProjectsView';

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
  onSelectRepo: (repo: ProjectRepo) => void;
  onBack: () => void;
}

export function HomeCollectionDetailView({
  collection,
  selectedFullName = null,
  onSelectRepo,
  onBack,
}: HomeCollectionDetailViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');

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

  return (
    <>
      <RailPaneHeader
        icon={<Layers size={14} />}
        label={collection.name}
        count={repos.length || undefined}
        onClose={onBack}
        closeAsBack
      />

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
