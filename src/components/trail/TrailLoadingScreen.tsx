'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { TrailLoadingAnimation } from './TrailLoadingAnimation';

export function TrailLoadingScreen({ message }: { message?: string }) {
  const { theme } = useTheme();
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <div style={{ width: 'min(80vmin, 600px)', height: 'min(80vmin, 600px)' }}>
        <TrailLoadingAnimation message={message} />
      </div>
    </div>
  );
}
