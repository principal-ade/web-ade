'use client';

import React, { useState, useEffect } from 'react';
import { OpenTypeTextReveal } from '@principal-ai/logo-component';
import { useTheme } from '@principal-ade/industry-theme';

// Font URL from CDN
const FONT_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf';

interface LoadingOverlayProps {
  /** Minimum time to show the overlay in ms (default: 5000) */
  minDisplayTime?: number;
  /** Callback when overlay finishes and fades out */
  onComplete?: () => void;
}

/**
 * Full-screen loading overlay with animated "Principal AI" text reveal.
 * Shows a time-series chart that transforms into the text.
 */
export function LoadingOverlay({
  minDisplayTime = 5000,
  onComplete
}: LoadingOverlayProps) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Brief delay to let font load before showing (hides "Loading font..." text)
    const readyTimer = setTimeout(() => {
      setIsReady(true);
    }, 150);

    // Start fade out after minimum display time
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, minDisplayTime);

    // Remove from DOM after fade completes
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, minDisplayTime + 500); // 500ms fade duration

    return () => {
      clearTimeout(readyTimer);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [minDisplayTime, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.colors.background,
        opacity: isFadingOut ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
        pointerEvents: isFadingOut ? 'none' : 'auto',
      }}
    >
      <div style={{ opacity: isReady ? 1 : 0, transition: 'opacity 0.2s ease-in' }}>
        <OpenTypeTextReveal
        text="Principal AI"
        fontUrl={FONT_URL}
        fontSize={64}
        width={550}
        height={140}
        chaosMode="fragmented"
        showChartIntro={true}
        chartPattern="latency"
        chartDuration={1.5}
        chartTransitionDuration={0.8}
        chaosDuration={0.5}
        dotsDuration={1}
        flowDuration={1.5}
        color={theme.colors.primary}
        particleColor={theme.colors.text}
        strokeWidth={1.5}
        loop={false}
        showGlow={true}
      />
      </div>
    </div>
  );
}
