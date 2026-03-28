'use client';

import { useState, useEffect } from 'react';
import { OpenTypeTextReveal, Logo } from '@principal-ai/logo-component';
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
// Stagger delay between each line's reveal (in seconds)
const STAGGER_DELAY = 0.5;

export function LoadingOverlay({
  minDisplayTime = 4000,
  onComplete
}: LoadingOverlayProps) {
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Parse repo from URL query param
  const queryParam = searchParams.get('q');
  const repoInfo = queryParam ? parseRepoQuery(queryParam) : null;

  useEffect(() => {
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
            chartDuration={1}
            chartTransitionDuration={0.5}
            chaosDuration={0.3}
            dotsDuration={0.6}
            flowDuration={1}
            color={theme.colors.text}
            particleColor={theme.colors.textMuted}
            strokeWidth={1.5}
            loop={false}
            showGlow={true}
            animationDelay={0}
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
            chartDuration={1}
            chartTransitionDuration={0.5}
            chaosDuration={0.2}
            dotsDuration={0.5}
            flowDuration={0.8}
            color={theme.colors.textMuted}
            particleColor={theme.colors.textMuted}
            strokeWidth={1}
            loop={false}
            showGlow={false}
            animationDelay={STAGGER_DELAY}
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
            chartDuration={1}
            chartTransitionDuration={0.5}
            chaosDuration={0.3}
            dotsDuration={0.6}
            flowDuration={1}
            color={theme.colors.primary}
            particleColor={theme.colors.text}
            strokeWidth={1.5}
            loop={false}
            showGlow={true}
            animationDelay={STAGGER_DELAY * 2}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Logo
            width={120}
            height={120}
            color={theme.colors.text}
            opacity={0.9}
          />
          <div style={{ height: 24 }} />
          <OpenTypeTextReveal
            text="Welcome"
            fontUrl={FONT_URL}
            fontSize={48}
            width={400}
            height={100}
            chaosMode="fragmented"
            showChartIntro={true}
            chartPattern="latency"
            chartDuration={1}
            chartTransitionDuration={0.5}
            chaosDuration={0.3}
            dotsDuration={0.6}
            flowDuration={1}
            color={theme.colors.text}
            particleColor={theme.colors.textMuted}
            strokeWidth={1.5}
            loop={false}
            showGlow={true}
            animationDelay={0}
          />
          <OpenTypeTextReveal
            text="To"
            fontUrl={FONT_URL}
            fontSize={32}
            width={100}
            height={60}
            chaosMode="fragmented"
            showChartIntro={true}
            chartPattern="latency"
            chartDuration={1}
            chartTransitionDuration={0.5}
            chaosDuration={0.2}
            dotsDuration={0.5}
            flowDuration={0.8}
            color={theme.colors.textMuted}
            particleColor={theme.colors.textMuted}
            strokeWidth={1}
            loop={false}
            showGlow={false}
            animationDelay={STAGGER_DELAY}
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
            chartDuration={1}
            chartTransitionDuration={0.5}
            chaosDuration={0.3}
            dotsDuration={0.6}
            flowDuration={1}
            color={theme.colors.primary}
            particleColor={theme.colors.text}
            strokeWidth={1.5}
            loop={false}
            showGlow={true}
            animationDelay={STAGGER_DELAY * 2}
          />
        </div>
      )}
    </div>
  );
}
