'use client';

import React, { useState, useEffect } from 'react';
import { OpenTypeTextReveal } from '@principal-ai/logo-component';
import { useTheme } from '@principal-ade/industry-theme';
import { useSearchParams } from 'next/navigation';

// Font URL from CDN
const FONT_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf';

/**
 * Parse a GitHub URL or owner/repo string
 */
function parseRepoQuery(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const urlPatterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i,
    /^github\.com\/([^/]+)\/([^/]+)/i,
  ];
  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1] && match[2]) {
      const repo = match[2].replace(/\.git$/, '').split(/[?#]/)[0];
      return { owner: match[1], repo: repo || '' };
    }
  }
  const repoPathMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (repoPathMatch && repoPathMatch[1] && repoPathMatch[2]) {
    return { owner: repoPathMatch[1], repo: repoPathMatch[2] };
  }
  return null;
}

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
  minDisplayTime = 7000,
  onComplete
}: LoadingOverlayProps) {
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Parse repo from URL query param
  const queryParam = searchParams.get('q');
  const repoInfo = queryParam ? parseRepoQuery(queryParam) : null;

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
        {repoInfo ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <OpenTypeTextReveal
              text={`${repoInfo.repo} by ${repoInfo.owner}`}
              fontUrl={FONT_URL}
              fontSize={48}
              width={600}
              height={100}
              chaosMode="fragmented"
              showChartIntro={true}
              chartPattern="latency"
              chartDuration={2}
              chartTransitionDuration={1}
              chaosDuration={0.7}
              dotsDuration={1.3}
              flowDuration={2}
              color={theme.colors.text}
              particleColor={theme.colors.textMuted}
              strokeWidth={1.5}
              loop={false}
              showGlow={true}
            />
            <OpenTypeTextReveal
              text="on"
              fontUrl={FONT_URL}
              fontSize={32}
              width={100}
              height={60}
              chaosMode="fragmented"
              showChartIntro={true}
              chartPattern="latency"
              chartDuration={2}
              chartTransitionDuration={1}
              chaosDuration={0.4}
              dotsDuration={1}
              flowDuration={1.5}
              color={theme.colors.textMuted}
              particleColor={theme.colors.textMuted}
              strokeWidth={1}
              loop={false}
              showGlow={false}
            />
            <OpenTypeTextReveal
              text="Principal AI"
              fontUrl={FONT_URL}
              fontSize={64}
              width={550}
              height={140}
              chaosMode="fragmented"
              showChartIntro={true}
              chartPattern="latency"
              chartDuration={2}
              chartTransitionDuration={1}
              chaosDuration={0.7}
              dotsDuration={1.3}
              flowDuration={2}
              color={theme.colors.primary}
              particleColor={theme.colors.text}
              strokeWidth={1.5}
              loop={false}
              showGlow={true}
            />
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
