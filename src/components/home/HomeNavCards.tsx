'use client';

import {
  Bookmark,
  ChevronRight,
  FolderGit2,
  Footprints,
  History,
  Star,
  Layers,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

// ---------------------------------------------------------------------------
// Home nav cards — the user-based sibling of the owner/repo page's RepoNavCards.
// A stacked list of rows that swap the home left panel (and the right pane) into
// one of the signed-in user's views: their projects, starred repos, bookmarks,
// and their own published trails & topics. Presentational: it takes counts + an
// active key and reports clicks via `onOpenView`.
// ---------------------------------------------------------------------------

export type HomeNavKey =
  | 'projects'
  | 'starred'
  | 'collections'
  | 'bookmarks'
  | 'library'
  | 'recent';

/** Optional counts per card. `null`/`undefined` = not loaded → the count is hidden. */
export interface HomeNavCardCounts {
  projects?: number | null;
  starred?: number | null;
  collections?: number | null;
  bookmarks?: number | null;
  library?: number | null;
  recent?: number | null;
}

export interface HomeNavCardsProps {
  counts?: HomeNavCardCounts;
  /** The currently-open view, highlighted in the list. */
  activeView?: HomeNavKey | null;
  onOpenView: (key: HomeNavKey) => void;
}

export interface HomeNavCardMeta {
  key: HomeNavKey;
  icon: React.ReactNode;
  label: string;
  description: string;
}

/** Ordered card metadata — shared so the left panel's destination headers reuse
 *  the same label + icon per view. The array order is the render order. */
export const HOME_NAV_CARDS: HomeNavCardMeta[] = [
  {
    key: 'projects',
    icon: <FolderGit2 size={18} />,
    label: 'Your Projects',
    description: "Your repos and your orgs' repos",
  },
  {
    key: 'starred',
    icon: <Star size={18} />,
    label: 'Starred Projects',
    description: "Repositories you've starred",
  },
  {
    key: 'collections',
    icon: <Layers size={18} />,
    label: 'Collections',
    description: 'Your curated collections of repos',
  },
  {
    key: 'bookmarks',
    icon: <Bookmark size={18} />,
    label: 'Bookmarks',
    description: 'Saved topics and trails',
  },
  {
    key: 'library',
    icon: <Footprints size={18} />,
    label: 'Your Trails & Topics',
    description: "Trails and topics you've published",
  },
  {
    key: 'recent',
    icon: <History size={18} />,
    label: 'Recently Visited',
    description: "Trails, topics, and projects you've opened",
  },
];

export function HomeNavCards({
  counts,
  activeView = null,
  onOpenView,
}: HomeNavCardsProps) {
  const { theme } = useTheme();

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {HOME_NAV_CARDS.map((card) => {
        const count = counts?.[card.key];
        const active = activeView === card.key;
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={active}
            onClick={() => onOpenView(card.key)}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 border text-left transition-colors border-[var(--card-border)] hover:border-[var(--card-border-hover)]"
            style={
              {
                background: active
                  ? `color-mix(in srgb, ${theme.colors.primary} 12%, ${theme.colors.backgroundSecondary})`
                  : theme.colors.backgroundSecondary,
                color: theme.colors.text,
                '--card-border': active
                  ? theme.colors.primary
                  : theme.colors.border,
                '--card-border-hover': theme.colors.primary,
              } as React.CSSProperties
            }
            title={`Open ${card.label.toLowerCase()}`}
          >
            <span
              className="shrink-0"
              style={{
                color: active ? theme.colors.primary : theme.colors.textSecondary,
              }}
            >
              {card.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  style={{
                    fontSize: theme.fontSizes[2],
                    fontWeight: theme.fontWeights.semibold,
                  }}
                >
                  {card.label}
                </span>
                {count != null && (
                  <span
                    style={{
                      fontSize: theme.fontSizes[1],
                      color: theme.colors.textMuted,
                    }}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </div>
              <div
                className="truncate"
                style={{
                  fontSize: theme.fontSizes[1],
                  color: theme.colors.textMuted,
                  lineHeight: 1.3,
                }}
              >
                {card.description}
              </div>
            </div>
            <ChevronRight
              size={16}
              className="shrink-0"
              style={{ color: theme.colors.textMuted }}
            />
          </button>
        );
      })}
    </div>
  );
}
