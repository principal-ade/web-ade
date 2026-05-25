'use client';

import type { Theme } from '@principal-ade/industry-theme';

/**
 * Mirror of the FileCityTrailExplorerPanel's sign-off stamp visual.
 * Kept local because the panel package does not export this component.
 * Uses `theme.colors.success` so the stamp reads as approval ink.
 */
export function LgtmStamp({
  theme,
  size,
  rotated = true,
  text = 'LGTM',
  subtitle,
  ink,
}: {
  theme: Theme;
  size: number;
  rotated?: boolean;
  text?: string;
  /** Optional secondary line. When provided, replaces the date. */
  subtitle?: string;
  /** Override the success-green ink — e.g. grey for ACK stamps. */
  ink?: string;
}) {
  const inkColor = ink ?? theme.colors.success;
  const borderWidth = Math.max(2, Math.round(size / 30));
  // Shrink the main text proportionally once it grows past the 4-char
  // baseline ("LGTM") so longer words like "Reviewed" stay inside the
  // stamp border instead of bleeding past it.
  const baseChars = 4;
  const textScale = Math.min(1, baseChars / Math.max(baseChars, text.length));
  const titleFontSize = size * 0.26 * textScale;
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        transform: rotated ? 'rotate(-8deg)' : 'none',
        border: `${borderWidth}px double ${inkColor}`,
        borderRadius: theme.radii[1],
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.fonts.monospace,
        color: inkColor,
        letterSpacing: '0.1em',
        opacity: 0.9,
        userSelect: 'none',
        padding: size * 0.05,
        boxSizing: 'border-box',
        background: `color-mix(in srgb, ${theme.colors.background} 65%, transparent)`,
      }}
    >
      <div
        style={{
          fontSize: titleFontSize,
          fontWeight: theme.fontWeights.bold,
          lineHeight: 1,
        }}
      >
        {text}
      </div>
      <div
        style={{
          fontSize: size * 0.13,
          marginTop: size * 0.05,
          letterSpacing: '0.1em',
          fontWeight: theme.fontWeights.bold,
        }}
      >
        {subtitle ?? new Date().toISOString().slice(0, 10)}
      </div>
    </div>
  );
}

/**
 * "Stamp lands on the trail" beat. Absolutely positioned to fill its
 * parent — render it inside a `position: relative` container above the
 * diagram. The 1100ms keyframe matches the panel's overlay so the
 * landing weight is consistent across surfaces.
 */
export function SignOffStampAnimation({
  theme,
  text,
  subtitle,
  ink,
  size = 80,
  left = '50%',
  top = '50%',
}: {
  theme: Theme;
  text: string;
  subtitle?: string;
  ink?: string;
  size?: number;
  /** CSS left/top of the landing point on the parent (`position: relative`). */
  left?: string;
  top?: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left,
        top,
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes lgtm-stamp-land {
          0%   { transform: scale(2.6) rotate(-2deg); opacity: 0; }
          45%  { transform: scale(1.05) rotate(-9deg); opacity: 1; }
          60%  { transform: scale(1.18) rotate(-8deg); }
          75%  { transform: scale(1) rotate(-8deg); }
          100% { transform: scale(1) rotate(-8deg); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          transformOrigin: 'center',
          animation: 'lgtm-stamp-land 1100ms cubic-bezier(.18,.89,.32,1.28) both',
          filter: `drop-shadow(0 8px 12px ${theme.colors.background})`,
        }}
      >
        <LgtmStamp
          theme={theme}
          size={size}
          rotated={false}
          text={text}
          subtitle={subtitle}
          ink={ink}
        />
      </div>
    </div>
  );
}
