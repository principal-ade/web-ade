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
}: {
  theme: Theme;
  size: number;
  rotated?: boolean;
  text?: string;
}) {
  const inkColor = theme.colors.success;
  const borderWidth = Math.max(2, Math.round(size / 30));
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
          fontSize: size * 0.26,
          fontWeight: theme.fontWeights.bold,
          lineHeight: 1,
        }}
      >
        {text}
      </div>
      <div
        style={{
          fontSize: size * 0.1,
          marginTop: size * 0.05,
          letterSpacing: '0.08em',
        }}
      >
        {new Date().toISOString().slice(0, 10)}
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
  size = 220,
}: {
  theme: Theme;
  text: 'LGTM' | 'ACK';
  size?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
        <LgtmStamp theme={theme} size={size} rotated={false} text={text} />
      </div>
    </div>
  );
}
