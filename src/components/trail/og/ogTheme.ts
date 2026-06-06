/**
 * Satori-safe theme constants + helpers for the trail OG cards.
 *
 * `next/og` renders via Satori, which supports only a flexbox CSS subset:
 * no `color-mix()`, no theme hooks, no `em` units for letter-spacing, and
 * fonts must be loaded explicitly (we lean on the bundled default font).
 *
 * So the OG cards can't import the live `TrailBriefCard` or call
 * `useTheme()`. Instead we hand-port the bits we need: the resolved
 * `iceTangerineDarkTheme` color tokens (the app's default theme — see
 * `src/contexts/ThemeContext.tsx`) frozen as plain hex, plus the handful of
 * `color-mix(...)` results the real card computes at runtime, precomputed
 * here as static hex. Keep these in sync if the default theme changes.
 */

/** Resolved `iceTangerineDarkTheme.colors` tokens used by the OG cards. */
export const OG_COLORS = {
  text: '#d0e5ea',
  textSecondary: '#9fc4d4',
  textTertiary: '#7ba8bc',
  textMuted: '#5a8a9e',
  background: '#0d274d',
  backgroundSecondary: '#0f2e58',
  surface: '#0f2e58',
  primary: '#ff6b35',
  secondary: '#ff8257',
  accent: '#0893d2',
  border: '#1e3a5f',
  success: '#10b981',
} as const;

/**
 * Precomputed `color-mix()` results the live card derives at runtime. Satori
 * can't evaluate `color-mix()`, so we bake the values:
 *  - `accentBorder`: `color-mix(in srgb, accent 55%, border)` — the card's
 *    eyebrow-tinted "published" border.
 *  - `avatarBg`: `color-mix(in srgb, accent 30%, background)` — the initials
 *    avatar fill (see `Avatar` in TrailBriefCard).
 */
export const OG_MIX = {
  /** color-mix(in srgb, #0893d2 55%, #1e3a5f) */
  accentBorder: '#126b9e',
  /** color-mix(in srgb, #0893d2 30%, #0d274d) */
  avatarBg: '#0c4775',
} as const;

/** System sans stack. Satori falls back to its bundled font regardless; this
 * keeps the same component looking right when rendered in Storybook's DOM. */
export const OG_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/** Two-letter uppercase initials, matching the live `Avatar` derivation. */
export function ogInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  return initials || '?';
}

/**
 * Relative "Nd ago" stamp, ported from the card's `dateStamp` memo. Takes an
 * explicit `now` (ms) so the route stays the single source of "now" — Satori
 * scripts and OG routes shouldn't scatter `Date.now()` calls.
 */
export function ogDateStamp(createdAt: string | undefined, now: number): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const sec = Math.round((now - d.getTime()) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

/**
 * The eyebrow label the card *would* show per `purpose` (the live card
 * currently hides the pill but keeps the prop plumbed). Informative trails
 * read as verified/unverified based on whether anyone has signed off.
 */
export function ogEyebrow(
  purpose: 'investigation' | 'changelog' | 'informative' | undefined,
  hasSignOffs: boolean,
): string {
  switch (purpose) {
    case 'changelog':
      return 'CHANGELOG TRAIL';
    case 'informative':
      return hasSignOffs ? 'VERIFIED TRAIL' : 'UNVERIFIED TRAIL';
    case 'investigation':
    default:
      return 'INVESTIGATION TRAIL';
  }
}

/** Light markdown → plain text (Satori/meta descriptions have no markdown). */
export function ogStripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/[*_~>#]/g, '') // emphasis / blockquote / stray marks
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/** Hard-truncate to `max` chars on a word boundary, appending an ellipsis. */
export function ogTruncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}
