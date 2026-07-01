'use client';

import { useMemo, useState } from 'react';
import { FolderGit2, Lock, Search, Star } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';

// ---------------------------------------------------------------------------
// HomeProjectsView — the "Your Projects" destination of the home rail: the
// signed-in user's own repos plus their orgs' repos, grouped by owner. A rail-
// shaped (narrow, vertical) list, the counterpart to the owner/repo Structure
// pane. Presentational: it takes grouped sections as props and reports the
// picked repo via `onSelectRepo` (which the two-pane shell will route to the
// right-pane File City).
// ---------------------------------------------------------------------------

export interface ProjectRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url?: string };
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  private?: boolean;
}

export interface ProjectSection {
  /** Stable key — 'you' for personal repos, or the org login. */
  key: string;
  /** Section heading, e.g. "Your repositories" or the org name. */
  label: string;
  /** Org avatar, shown beside the heading. */
  avatar_url?: string;
  repos: ProjectRepo[];
}

export interface HomeProjectsViewProps {
  /** Grouped repos. `null` = loading. */
  sections: ProjectSection[] | null;
  error?: string | null;
  /** full_name of the currently-open repo, highlighted in the list. */
  selectedFullName?: string | null;
  onSelectRepo: (repo: ProjectRepo) => void;
  onBack: () => void;
}

export function HomeProjectsView({
  sections,
  error = null,
  selectedFullName = null,
  onSelectRepo,
  onBack,
}: HomeProjectsViewProps) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');

  const totalRepos = useMemo(
    () => (sections ?? []).reduce((n, s) => n + s.repos.length, 0),
    [sections],
  );

  // Filter every section by name / full_name / description, dropping any section
  // left empty.
  const filtered = useMemo(() => {
    if (!sections) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        repos: s.repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            (r.description?.toLowerCase().includes(q) ?? false),
        ),
      }))
      .filter((s) => s.repos.length > 0);
  }, [sections, filter]);

  return (
    <>
      <RailPaneHeader
        icon={<FolderGit2 size={14} />}
        label="Your Projects"
        count={totalRepos || undefined}
        onClose={onBack}
        closeAsBack
      />

      {/* Filter — shown once there are enough repos to warrant it. */}
      {sections != null && totalRepos >= 8 && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2 shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <Search size={14} style={{ color: theme.colors.textMuted }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects"
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
          <ListMessage>Couldn&rsquo;t load your projects: {error}</ListMessage>
        ) : filtered === null ? (
          <ListMessage>Loading your projects…</ListMessage>
        ) : totalRepos === 0 ? (
          <ListMessage>
            No projects yet. Repos you own and your organizations&rsquo; repos
            will show up here.
          </ListMessage>
        ) : filtered.length === 0 ? (
          <ListMessage>No projects match “{filter}”.</ListMessage>
        ) : (
          filtered.map((section) => (
            <div key={section.key}>
              <SectionHeader section={section} />
              {section.repos.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  selected={repo.full_name === selectedFullName}
                  onSelect={() => onSelectRepo(repo)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function SectionHeader({ section }: { section: ProjectSection }) {
  const { theme } = useTheme();
  return (
    <div
      className="sticky top-0 z-[1] px-4 py-1.5 flex items-center gap-2 border-b"
      style={{
        background: theme.colors.backgroundSecondary,
        borderColor: theme.colors.border,
      }}
    >
      {section.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={section.avatar_url}
          alt=""
          width={16}
          height={16}
          className="rounded"
          style={{ background: theme.colors.background }}
        />
      )}
      <span
        className="truncate"
        style={{
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.semibold,
          color: theme.colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {section.label}
      </span>
      <span
        style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
      >
        {section.repos.length}
      </span>
    </div>
  );
}

function RepoRow({
  repo,
  selected,
  onSelect,
}: {
  repo: ProjectRepo;
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const selectedBg = `color-mix(in srgb, ${theme.colors.primary} 12%, ${theme.colors.background})`;
  const hoverBg = `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full text-left px-4 py-2.5 border-b transition-colors"
      style={{
        background: selected ? selectedBg : 'transparent',
        borderColor: theme.colors.border,
        color: theme.colors.text,
        cursor: 'pointer',
      }}
      // Inline `background` wins over a Tailwind hover: class, so tint the
      // non-selected rows on hover via handlers (mirrors UserReposGrid).
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
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

// Subset of GitHub's language colors (mirrors UserReposGrid).
function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Rust: '#dea584',
    Go: '#00ADD8',
    Java: '#b07219',
    Ruby: '#701516',
    PHP: '#4F5D95',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#178600',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Scala: '#c22d40',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Vue: '#41b883',
    Svelte: '#ff3e00',
  };
  return colors[language] || '#8b949e';
}
