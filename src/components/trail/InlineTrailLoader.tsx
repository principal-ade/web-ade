'use client';

import { TrailLoadingAnimation } from './TrailLoadingAnimation';

/**
 * Compact inline variant of the File City trail loading animation, sized to
 * stand in for the small lucide `Loader2` spinners used inside buttons and
 * text rows. Renders a tiny 3×3 trail grid with no caption.
 */
export function InlineTrailLoader({ size = 16 }: { size?: number }) {
  return (
    <TrailLoadingAnimation
      width={size}
      height={size}
      cols={3}
      rows={3}
      message=""
      cycleDuration={2200}
      maxTrails={3}
    />
  );
}

export default InlineTrailLoader;
