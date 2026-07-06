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

type SortBy = 'alphabetical' | 'stars' | 'updated';

export function HomeStarredView({
  repos,
  error = null,
  selectedFullName = null,
  onSelectRepo,
  onBack,
}: HomeStarredViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('alphabetical');

  const filtered = useMemo(() => {
    if (!repos) return null;
    const q = filter.trim().toLowerCase();
    const result = q
      ? repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            (r.description?.toLowerCase().includes(q) ?? false),
        )
      : [...repos];

    // Apply sorting
    switch (sortBy) {
      case 'alphabetical':
        result.sort((a, b) => a.full_name.toLowerCase().localeCompare(b.full_name.toLowerCase()));
        break;
      case 'stars':
        result.sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0));
        break;
      case 'updated':
        result.sort((a, b) => {
          if (!a.updated_at || !b.updated_at) return 0;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        break;
    }

    return result;
  }, [repos, filter, sortBy]);

  return (
    <>
      <RailPaneHeader
        icon={<Star size={14} />}
        label="Starred Projects"
        count={repos?.length || undefined}
        onClose={onBack}
        closeAsBack
      />

      {repos != null && repos.length > 0 && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2 shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          {repos.length >= 8 && (
            <>
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
            </>
          )}
          {repos.length < 8 && <div className="flex-1" />}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-transparent outline-none cursor-pointer"
            style={{
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[1],
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '4px',
              padding: '2px 6px',
            }}
          >
            <option value="alphabetical">A-Z</option>
            <option value="stars">Stars</option>
            <option value="updated">Updated</option>
          </select>
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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 86400 * 365)
    return `${Math.floor(diffSec / (86400 * 30))}mo ago`;
  return `${Math.floor(diffSec / (86400 * 365))}y ago`;
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
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            repo.owner.avatar_url ??
            `https://github.com/${repo.owner.login}.png?size=72`
          }
          alt=""
          width={36}
          height={36}
          className="rounded-md shrink-0"
          style={{ background: theme.colors.backgroundSecondary }}
        />
        <div className="min-w-0 flex flex-col">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className="truncate"
              style={{
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.semibold,
              }}
            >
              {repo.name}
            </span>
            {repo.private && (
              <Lock
                size={12}
                className="shrink-0"
                style={{ color: theme.colors.textMuted }}
              />
            )}
          </span>
          <span
            className="truncate"
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
            }}
          >
            {repo.owner.login}
          </span>
        </div>
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

      <div
        className="mt-1 flex items-center gap-3"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
      >
        <span className="flex items-center gap-3 min-w-0 flex-1">
          {(repo.stargazers_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={11} />
              {repo.stargazers_count!.toLocaleString()}
            </span>
          )}
          {repo.updated_at && (
            <span className="inline-flex items-center gap-1">
              Updated {relativeTime(repo.updated_at)}
            </span>
          )}
        </span>
        {repo.language && (
          <span className="inline-flex items-center gap-1.5 shrink-0">
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
      </div>
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
