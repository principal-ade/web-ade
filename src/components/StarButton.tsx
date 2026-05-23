'use client';

/**
 * Header star toggle for `/trail/[id]` and `/topic/[id]`.
 *
 * Visual-only — the parent owns starred state, the optimistic update, and
 * the API call (or, for signed-out callers, the sign-in redirect). The
 * button just renders the current state and forwards clicks.
 */

import { Star } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

interface StarButtonProps {
  starred: boolean;
  onClick: () => void;
  /** Disables the button while a previous toggle is in flight. */
  disabled?: boolean;
  /**
   * "Star" / "Unstar" reads correctly when the user is signed in. For
   * signed-out callers the button still works (click → sign-in redirect),
   * so leave the label generic — "Star" tells the user what they're about
   * to do without leaking that it's gated.
   */
  label?: string;
}

export function StarButton({
  starred,
  onClick,
  disabled,
  label,
}: StarButtonProps) {
  const { theme } = useTheme();
  const text = label ?? (starred ? 'Starred' : 'Star');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
      style={{
        background: starred ? theme.colors.primary : 'transparent',
        color: starred ? theme.colors.background : theme.colors.text,
        border: `1px solid ${starred ? theme.colors.primary : theme.colors.border}`,
        fontFamily: theme.fonts.body,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
      aria-label={starred ? 'Unstar' : 'Star'}
      aria-pressed={starred}
    >
      <Star
        className="w-4 h-4"
        fill={starred ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
      <span>{text}</span>
    </button>
  );
}
