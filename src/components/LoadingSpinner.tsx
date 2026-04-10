'use client';

import { Logo } from '@principal-ai/logo-component';
import { useTheme } from '@principal-ade/industry-theme';

interface LoadingSpinnerProps {
  /** Size in pixels (default: 24) */
  size?: number;
  /** Custom color (defaults to theme.colors.primary) */
  color?: string;
  /** Custom particle color (defaults to theme.colors.accent) */
  particleColor?: string;
  /** Opacity (default: 1) */
  opacity?: number;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Loading spinner component using the Principal AI logo with animated particles.
 * This replaces the Loader2 icon throughout the application.
 */
export function LoadingSpinner({
  size = 24,
  color,
  particleColor,
  opacity = 1,
  className,
}: LoadingSpinnerProps) {
  const { theme } = useTheme();

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Logo
        width={size}
        height={size}
        color={color || theme.colors.primary}
        particleColor={particleColor || theme.colors.accent}
        letterColor={color || theme.colors.primary}
        opacity={opacity}
        showGlow={false}
      />
    </div>
  );
}
