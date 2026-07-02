'use client';

import Link from 'next/link';
import { FolderGit2, Footprints, History, Users } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import { RepoRowShell } from './RepoRowShell';
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

/** A repo from the global "visited by others" feed. */
export interface CommunityRepoItem {
  /** Lowercased "owner/repo". */
  fullName: string;
  owner: string;
  repo: string;
  description?: string | null;
  language?: string | null;
  stargazersCount?: number;
  /** Rough count of distinct visitors community-wide. */
  visitorCount: number;
  /** ISO 8601 — when anyone last opened the repo. */
  lastVisitedAt: string;
}

export interface HomeRecentlyVisitedViewProps {
  /** Recently-opened repos, as ProjectRepos. `null` = loading. */
  projects: ProjectRepo[] | null;
  /** Recently-opened trails. `null` = loading. */
  trails: RecentTrailItem[] | null;
  /** Repos the wider community opened recently. `null` = loading. */
  community?: CommunityRepoItem[] | null;
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
  community = null,
  selectedFullName = null,
  onSelectRepo,
  onBack,
}: HomeRecentlyVisitedViewProps) {
  const loading = projects === null && trails === null && community === null;
  const empty =
    !loading &&
    (projects?.length ?? 0) === 0 &&
    (trails?.length ?? 0) === 0 &&
    (community?.length ?? 0) === 0;

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
            {community && community.length > 0 && (
              <div>
                <SectionHeader
                  icon={<Users size={12} />}
                  label="Visited by others"
                />
                {community.map((item) => (
                  <CommunityRow
                    key={item.fullName}
                    item={item}
                    selected={item.fullName === selectedFullName}
                    onSelect={() => onSelectRepo(communityToProjectRepo(item))}
                  />
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
  return (
    <RepoRowShell
      fullName={repo.full_name}
      selected={selected}
      onSelect={onSelect}
      contentClassName="flex items-center gap-3 min-w-0"
    >
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
        <span
          className="truncate"
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {repo.name}
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
    </RepoRowShell>
  );
}

// A community-feed repo, adapted to the ProjectRepo the row shell + right-pane
// city consume. full_name stays lowercased (the feed's dedup key) so it matches
// `selectedFullName` and the "Open" link — GitHub treats owner/repo as
// case-insensitive, so the city still resolves it.
function communityToProjectRepo(item: CommunityRepoItem): ProjectRepo {
  return {
    id: -1,
    full_name: item.fullName,
    name: item.repo,
    owner: { login: item.owner },
    description: item.description ?? null,
    language: item.language ?? null,
    stargazers_count: item.stargazersCount,
  };
}

function CommunityRow({
  item,
  selected,
  onSelect,
}: {
  item: CommunityRepoItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const visitors = Math.max(item.visitorCount, 1);
  return (
    <RepoRowShell
      fullName={item.fullName}
      selected={selected}
      onSelect={onSelect}
      contentClassName="flex items-center gap-3 min-w-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://github.com/${item.owner}.png?size=72`}
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
          {item.repo}
        </span>
        <span
          className="truncate flex items-center gap-1.5"
          style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
        >
          <span className="truncate">{item.owner}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-1">
            <Users size={11} />
            {visitors} {visitors === 1 ? 'visitor' : 'visitors'}
          </span>
        </span>
      </div>
    </RepoRowShell>
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
