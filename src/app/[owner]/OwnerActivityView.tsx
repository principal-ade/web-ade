'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';

// ---------------------------------------------------------------------------
// OwnerActivityView — the "Activity" destination of the owner rail: a compact
// contribution heatmap over the owner's recent commits and the repos they've
// contributed to. The rail-shaped sibling of the owner/repo explorer's activity
// pane. Presentational: it takes the already-derived groups as props (the page
// owns the fetching) and each row links to the repo's own page.
// ---------------------------------------------------------------------------

export interface CommitGroup {
  repository: string;
  commitCount: number;
  additions: number;
  deletions: number;
  timestamp: string;
}

export interface ContributedRepo {
  nameWithOwner: string;
  owner: string;
  name: string;
  commitCount: number;
  lastContributedAt: string;
  ownerType: 'User' | 'Organization';
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

export interface OwnerActivityViewProps {
  contributions: Map<string, number>;
  totalCommits: number;
  commitGroups: CommitGroup[];
  contributedRepos: ContributedRepo[];
  loading: boolean;
  onBack: () => void;
}

export function OwnerActivityView({
  contributions,
  totalCommits,
  commitGroups,
  contributedRepos,
  loading,
  onBack,
}: OwnerActivityViewProps) {
  const { theme } = useTheme();

  return (
    <>
      <style>{`.owner-heatmap::-webkit-scrollbar { display: none; }`}</style>
      <RailPaneHeader
        icon={<Activity size={14} />}
        label="Activity"
        onClose={onBack}
        closeAsBack
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
        {/* Contribution heatmap — horizontally scrollable inside the narrow rail. */}
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          <div
            className="owner-heatmap"
            style={{ overflowX: 'auto', scrollbarWidth: 'none' }}
          >
            <ActivityHeatmap activityData={contributions} bannerHeight={92} />
          </div>
          <div
            className="mt-2"
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[0],
            }}
          >
            {loading ? '…' : totalCommits.toLocaleString()} commits this year
          </div>
        </div>

        <SectionHeader label="Recent Commits" />
        {loading ? (
          <ListMessage>Loading…</ListMessage>
        ) : commitGroups.length === 0 ? (
          <ListMessage>No recent commits.</ListMessage>
        ) : (
          commitGroups.map((g) => <CommitRow key={g.repository} group={g} />)
        )}

        <SectionHeader label="Contributed Repositories" />
        {loading ? (
          <ListMessage>Loading…</ListMessage>
        ) : contributedRepos.length === 0 ? (
          <ListMessage>No contributed repositories.</ListMessage>
        ) : (
          contributedRepos.map((r) => (
            <ContributedRepoRow key={r.nameWithOwner} repo={r} />
          ))
        )}
      </div>
    </>
  );
}

function SectionHeader({ label }: { label: string }) {
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

function CommitRow({ group }: { group: CommitGroup }) {
  const { theme } = useTheme();
  const slash = group.repository.indexOf('/');
  const repoOwner = slash !== -1 ? group.repository.slice(0, slash) : '';
  const repoName =
    slash !== -1 ? group.repository.slice(slash + 1) : group.repository;
  const hoverBg = `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`;

  return (
    <Link
      href={`/${group.repository}`}
      className="block px-4 py-2.5 border-b transition-colors"
      style={{ borderColor: theme.colors.border, color: theme.colors.text }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        className="flex items-center justify-between gap-2 min-w-0"
      >
        <span
          className="truncate"
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {repoName}
        </span>
        <span
          className="shrink-0"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[0],
          }}
        >
          {relativeTime(group.timestamp)}
        </span>
      </div>
      <div
        className="mt-0.5 flex items-center gap-2"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
      >
        {repoOwner && <span className="truncate">{repoOwner}</span>}
        <span className="shrink-0">
          {group.commitCount} commit{group.commitCount !== 1 ? 's' : ''}
          {group.additions > 0 && (
            <span style={{ color: theme.colors.success }}> +{group.additions}</span>
          )}
          {group.deletions > 0 && (
            <span style={{ color: theme.colors.error }}> -{group.deletions}</span>
          )}
        </span>
      </div>
    </Link>
  );
}

function ContributedRepoRow({ repo }: { repo: ContributedRepo }) {
  const { theme } = useTheme();
  const hoverBg = `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`;

  return (
    <Link
      href={`/${repo.nameWithOwner}`}
      className="flex items-center gap-2.5 px-4 py-2.5 border-b transition-colors"
      style={{ borderColor: theme.colors.border, color: theme.colors.text }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://github.com/${repo.owner}.png?size=48`}
        alt=""
        width={24}
        height={24}
        className="shrink-0"
        style={{
          borderRadius: repo.ownerType === 'Organization' ? 5 : '50%',
          border: `1px solid ${theme.colors.border}`,
        }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {repo.name}
        </div>
        <div
          className="truncate"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
        >
          {repo.owner}
        </div>
      </div>
      <div
        className="shrink-0 text-right"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
      >
        <div>
          {repo.commitCount} commit{repo.commitCount !== 1 ? 's' : ''}
        </div>
        <div>{relativeTime(repo.lastContributedAt)}</div>
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
