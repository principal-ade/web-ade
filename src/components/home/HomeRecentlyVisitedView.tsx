'use client';

import Link from 'next/link';
import { FolderGit2, Footprints, History } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import type { ProjectRepo } from './HomeProjectsView';

// ---------------------------------------------------------------------------
// HomeRecentlyVisitedView — the "Recently Visited" destination: repos the user
// recently opened (which select into the right-pane File City) plus trails they
// recently opened (which navigate to the trail page). Topics have no
// recently-visited source yet, so they're omitted for now.
// ---------------------------------------------------------------------------

export interface RecentTrailItem {
  id: string;
  title: string;
  owner: string;
  repo: string;
  /** ISO 8601 — when the user last opened the trail. */
  lastVisitedAt: string;
}

export interface HomeRecentlyVisitedViewProps {
  /** Recently-opened repos, as ProjectRepos. `null` = loading. */
  projects: ProjectRepo[] | null;
  /** Recently-opened trails. `null` = loading. */
  trails: RecentTrailItem[] | null;
  selectedFullName?: string | null;
  onSelectRepo: (repo: ProjectRepo) => void;
  onBack: () => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function HomeRecentlyVisitedView({
  projects,
  trails,
  selectedFullName = null,
  onSelectRepo,
  onBack,
}: HomeRecentlyVisitedViewProps) {
  const loading = projects === null && trails === null;
  const empty =
    !loading && (projects?.length ?? 0) === 0 && (trails?.length ?? 0) === 0;

  return (
    <>
      <RailPaneHeader
        icon={<History size={14} />}
        label="Recently Visited"
        onClose={onBack}
        closeAsBack
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
        {loading ? (
          <ListMessage>Loading recent activity…</ListMessage>
        ) : empty ? (
          <ListMessage>
            Nothing yet. Projects and trails you open will show up here.
          </ListMessage>
        ) : (
          <>
            {projects && projects.length > 0 && (
              <div>
                <SectionHeader icon={<FolderGit2 size={12} />} label="Projects" />
                {projects.map((repo) => (
                  <ProjectRow
                    key={repo.id}
                    repo={repo}
                    selected={repo.full_name === selectedFullName}
                    onSelect={() => onSelectRepo(repo)}
                  />
                ))}
              </div>
            )}
            {trails && trails.length > 0 && (
              <div>
                <SectionHeader icon={<Footprints size={12} />} label="Trails" />
                {trails.map((trail) => (
                  <TrailRow key={trail.id} trail={trail} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  const { theme } = useTheme();
  return (
    <div
      className="sticky top-0 z-[1] px-4 py-1.5 flex items-center gap-2 border-b"
      style={{
        background: theme.colors.backgroundSecondary,
        borderColor: theme.colors.border,
        color: theme.colors.textSecondary,
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span
        style={{
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.semibold,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function ProjectRow({
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
      className="w-full text-left px-4 py-2.5 border-b transition-colors flex items-center gap-2 min-w-0"
      style={{
        background: selected ? selectedBg : 'transparent',
        borderColor: theme.colors.border,
        color: theme.colors.text,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
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
    </button>
  );
}

function TrailRow({ trail }: { trail: RecentTrailItem }) {
  const { theme } = useTheme();
  return (
    <Link
      href={`/trail/${trail.id}`}
      className="block px-4 py-2.5 border-b transition-colors"
      style={{ borderColor: theme.colors.border, color: theme.colors.text }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        className="truncate"
        style={{
          fontSize: theme.fontSizes[2],
          fontWeight: theme.fontWeights.medium,
        }}
      >
        {trail.title}
      </div>
      <div
        className="mt-0.5 flex items-center gap-2"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
      >
        <span className="truncate">
          {trail.owner}/{trail.repo}
        </span>
        <span aria-hidden>·</span>
        <span className="shrink-0">visited {relativeTime(trail.lastVisitedAt)}</span>
      </div>
    </Link>
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
