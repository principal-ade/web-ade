'use client';

/**
 * Header bookmark toggle for `/trail/[id]` and `/topic/[id]`.
 *
 * Visual-only — the parent owns bookmarked state, the optimistic update, and
 * the API call (or, for signed-out callers, the sign-in redirect). The
 * button just renders the current state and forwards clicks.
 */

import { Bookmark } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

interface BookmarkButtonProps {
  bookmarked: boolean;
  onClick: () => void;
  /** Disables the button while a previous toggle is in flight. */
  disabled?: boolean;
  /**
   * "Bookmark" / "Remove bookmark" reads correctly when the user is signed in. For
   * signed-out callers the button still works (click → sign-in redirect),
   * so leave the label generic — "Bookmark" tells the user what they're about
   * to do without leaking that it's gated.
   */
  label?: string;
}

export function BookmarkButton({
  bookmarked,
  onClick,
  disabled,
  label,
}: BookmarkButtonProps) {
  const { theme } = useTheme();
  const text = label ?? (bookmarked ? 'Bookmarked' : 'Bookmark');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
      style={{
        background: bookmarked ? theme.colors.primary : 'transparent',
        color: bookmarked ? theme.colors.background : theme.colors.text,
        border: `1px solid ${bookmarked ? theme.colors.primary : theme.colors.border}`,
        fontFamily: theme.fonts.body,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
      aria-pressed={bookmarked}
    >
      <Bookmark
        className="w-4 h-4"
        fill={bookmarked ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
      <span>{text}</span>
    </button>
  );
}
