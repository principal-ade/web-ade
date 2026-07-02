'use client';

import { useMemo, useState } from 'react';
import { Lock, Search, Star } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import { RepoRowShell } from './RepoRowShell';
import type { ProjectRepo } from './HomeProjectsView';
import { getLanguageColor } from './languageColors';

// ---------------------------------------------------------------------------
// HomeStarredView — the "Starred Projects" destination: a flat list of the repos
// the viewer has starred. Unlike Your Projects (grouped by owner), starred repos
// span many owners, so each row leads with the owner avatar + full name.
// Presentational; reports the picked repo via `onSelectRepo`.
// ---------------------------------------------------------------------------

export interface HomeStarredViewProps {
  /** Starred repos. `null` = loading. */
  repos: ProjectRepo[] | null;
  error?: string | null;
  selectedFullName?: string | null;
  onSelectRepo: (repo: ProjectRepo) => void;
  onBack: () => void;
}

export function HomeStarredView({
  repos,
  error = null,
  selectedFullName = null,
  onSelectRepo,
  onBack,
}: HomeStarredViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!repos) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    );
  }, [repos, filter]);

  return (
    <>
      <RailPaneHeader
        icon={<Star size={14} />}
        label="Starred Projects"
        count={repos?.length || undefined}
        onClose={onBack}
        closeAsBack
      />

      {repos != null && repos.length >= 8 && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2 shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <Search size={14} style={{ color: theme.colors.textMuted }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter starred"
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
          <ListMessage>Couldn&rsquo;t load starred repos: {error}</ListMessage>
        ) : filtered === null ? (
          <ListMessage>Loading starred repos…</ListMessage>
        ) : repos!.length === 0 ? (
          <ListMessage>
            No starred repos yet. Repositories you star on GitHub show up here.
          </ListMessage>
        ) : filtered.length === 0 ? (
          <ListMessage>No starred repos match “{filter}”.</ListMessage>
        ) : (
          filtered.map((repo) => (
            <StarredRow
              key={repo.id}
              repo={repo}
              selected={repo.full_name === selectedFullName}
              onSelect={() => onSelectRepo(repo)}
            />
          ))
        )}
      </div>
    </>
  );
}

function StarredRow({
  repo,
  selected,
  onSelect,
}: {
  repo: ProjectRepo;
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  return (
    <RepoRowShell
      fullName={repo.full_name}
      selected={selected}
      onSelect={onSelect}
    >
      <div className="flex items-center gap-2 min-w-0">
        {repo.owner.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={repo.owner.avatar_url}
            alt=""
            width={18}
            height={18}
            className="rounded shrink-0"
            style={{ background: theme.colors.backgroundSecondary }}
          />
        )}
        <span
          className="truncate"
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {repo.full_name}
        </span>
        {repo.private && (
          <Lock
            size={12}
            className="shrink-0"
            style={{ color: theme.colors.textMuted }}
          />
        )}
      </div>

      {repo.description && (
        <div
          className="mt-1"
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

      {(repo.language || (repo.stargazers_count ?? 0) > 0) && (
        <div
          className="mt-1 flex items-center gap-3"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
        >
          {repo.language && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: getLanguageColor(repo.language),
                }}
              />
              {repo.language}
            </span>
          )}
          {(repo.stargazers_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={11} />
              {repo.stargazers_count!.toLocaleString()}
            </span>
          )}
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
