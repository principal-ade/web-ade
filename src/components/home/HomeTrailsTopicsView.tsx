'use client';

import Link from 'next/link';
import { Folder, Footprints } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';

// ---------------------------------------------------------------------------
// HomeTrailsTopicsView — a reusable rail view that lists trails + topics in two
// sections, each row navigating to its page. Used for both "Your Trails &
// Topics" (the user's published ones) and "Bookmarks" (bookmarked trails +
// topics): same shape, different data + header. Presentational.
// ---------------------------------------------------------------------------

export interface TrailListItem {
  id: string;
  title: string;
  owner: string;
  repo: string;
  markerCount: number;
  updatedAt: string;
  /** The underlying trail was deleted — render inert. */
  gone?: boolean;
}

export interface TopicListItem {
  id: string;
  title: string;
  trailCount: number;
  updatedAt: string;
  descriptionPreview?: string;
  gone?: boolean;
}

export interface HomeTrailsTopicsViewProps {
  icon: React.ReactNode;
  label: string;
  /** `null` = loading. */
  trails: TrailListItem[] | null;
  /** `null` = loading. */
  topics: TopicListItem[] | null;
  emptyMessage: string;
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

export function HomeTrailsTopicsView({
  icon,
  label,
  trails,
  topics,
  emptyMessage,
  onBack,
}: HomeTrailsTopicsViewProps) {
  const loading = trails === null && topics === null;
  const total = (trails?.length ?? 0) + (topics?.length ?? 0);
  const empty = !loading && total === 0;

  return (
    <>
      <RailPaneHeader
        icon={icon}
        label={label}
        count={total || undefined}
        onClose={onBack}
        closeAsBack
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
        {loading ? (
          <ListMessage>Loading…</ListMessage>
        ) : empty ? (
          <ListMessage>{emptyMessage}</ListMessage>
        ) : (
          <>
            {trails && trails.length > 0 && (
              <div>
                <SectionHeader icon={<Footprints size={12} />} label="Trails" />
                {trails.map((t) => (
                  <TrailRow key={t.id} trail={t} />
                ))}
              </div>
            )}
            {topics && topics.length > 0 && (
              <div>
                <SectionHeader icon={<Folder size={12} />} label="Topics" />
                {topics.map((t) => (
                  <TopicRow key={t.id} topic={t} />
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

// A row that links to its page, unless the item is `gone` (then it's inert).
function RowShell({
  href,
  gone,
  children,
}: {
  href: string;
  gone?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const hoverBg = `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`;
  const common = 'block px-4 py-2.5 border-b transition-colors';
  const style: React.CSSProperties = {
    borderColor: theme.colors.border,
    color: theme.colors.text,
    opacity: gone ? 0.5 : 1,
  };
  if (gone) {
    return (
      <div className={common} style={style} title="No longer available">
        {children}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={common}
      style={style}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </Link>
  );
}

function TrailRow({ trail }: { trail: TrailListItem }) {
  const { theme } = useTheme();
  return (
    <RowShell href={`/trail/${trail.id}`} gone={trail.gone}>
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
        <span className="shrink-0">{trail.markerCount} markers</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{relativeTime(trail.updatedAt)}</span>
      </div>
    </RowShell>
  );
}

function TopicRow({ topic }: { topic: TopicListItem }) {
  const { theme } = useTheme();
  return (
    <RowShell href={`/topic/${topic.id}`} gone={topic.gone}>
      <div
        className="truncate"
        style={{
          fontSize: theme.fontSizes[2],
          fontWeight: theme.fontWeights.medium,
        }}
      >
        {topic.title}
      </div>
      <div
        className="mt-0.5 flex items-center gap-2"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
      >
        <span className="shrink-0">{topic.trailCount} trails</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{relativeTime(topic.updatedAt)}</span>
      </div>
      {topic.descriptionPreview && (
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
          {topic.descriptionPreview}
        </div>
      )}
    </RowShell>
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
