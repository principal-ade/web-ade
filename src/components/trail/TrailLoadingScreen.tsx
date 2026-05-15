'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { TrailLoadingAnimation } from './TrailLoadingAnimation';

export function TrailLoadingScreen() {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex items-center justify-center overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailLoadingAnimation />
    </div>
  );
}
