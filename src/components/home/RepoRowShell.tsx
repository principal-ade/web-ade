'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

// ---------------------------------------------------------------------------
// RepoRowShell — the shared chrome for a repo row in the home rail's project
// lists (Your Projects, Starred, Recently Visited). Clicking the row selects the
// repo into the right-pane File City (`onSelect`); a hover-revealed "Open" link
// navigates to the repo's own `/owner/repo` page. The row body is `children`, so
// each list keeps its own layout.
//
// A <button> can't contain a <Link>, so the Open link is an absolutely-
// positioned sibling that paints over the button's top-right corner.
// ---------------------------------------------------------------------------

export interface RepoRowShellProps {
  /** `owner/repo`, used for the Open link target + labels. */
  fullName: string;
  selected: boolean;
  onSelect: () => void;
  /** Extra classes for the selecting button (e.g. to make it a flex row). */
  contentClassName?: string;
  children: React.ReactNode;
}

export function RepoRowShell({
  fullName,
  selected,
  onSelect,
  contentClassName,
  children,
}: RepoRowShellProps) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const selectedBg = `color-mix(in srgb, ${theme.colors.primary} 12%, ${theme.colors.background})`;
  const hoverBg = `color-mix(in srgb, ${theme.colors.primary} 6%, ${theme.colors.background})`;

  return (
    <div
      className="relative group border-b"
      style={{ borderColor: theme.colors.border }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full text-left px-4 py-2.5 pr-16 transition-colors ${
          contentClassName ?? ''
        }`}
        style={{
          background: selected ? selectedBg : hovered ? hoverBg : 'transparent',
          color: theme.colors.text,
          cursor: 'pointer',
        }}
      >
        {children}
      </button>

      {/* Open the repo's own page. Hover-revealed on desktop, always shown on
          touch/narrow screens (which can't hover). */}
      <Link
        href={`/${fullName}`}
        title={`Open ${fullName}`}
        aria-label={`Open ${fullName} page`}
        className="absolute top-2 right-3 flex items-center gap-1 px-2 py-1 rounded-md opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
        style={{
          background: `color-mix(in srgb, ${theme.colors.primary} 14%, ${theme.colors.background})`,
          color: theme.colors.primary,
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.semibold,
          border: `1px solid color-mix(in srgb, ${theme.colors.primary} 30%, transparent)`,
        }}
      >
        <ArrowUpRight size={12} />
        Open
      </Link>
    </div>
  );
}
