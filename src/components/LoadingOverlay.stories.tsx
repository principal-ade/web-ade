import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { LoadingOverlay } from './LoadingOverlay';

/**
 * A mock version of LoadingOverlay that accepts repoQuery as a prop
 * instead of reading from URL search params (which requires Next.js context)
 */
function LoadingOverlayStory({
  repoQuery,
  minDisplayTime = 60000, // Long duration so animation doesn't fade in storybook
  staggerDelay = 0.5, // Delay between each text reveal (in seconds)
  onComplete,
}: {
  repoQuery?: string;
  minDisplayTime?: number;
  staggerDelay?: number;
  onComplete?: () => void;
}) {
  return (
    <LoadingOverlayInner
      repoQuery={repoQuery}
      minDisplayTime={minDisplayTime}
      staggerDelay={staggerDelay}
      onComplete={onComplete}
    />
  );
}

/**
 * Internal component that duplicates LoadingOverlay logic but accepts repoQuery as prop
 * This avoids the useSearchParams hook which requires Next.js routing context
 */
import { useState, useEffect } from 'react';
import { OpenTypeTextReveal } from '@principal-ai/logo-component';
import { useTheme } from '@principal-ade/industry-theme';

const FONT_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf';

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

function LoadingOverlayInner({
  repoQuery,
  minDisplayTime = 60000,
  onComplete,
  staggerDelay = 0.5, // Delay between each text reveal (in seconds)
}: {
  repoQuery?: string;
  minDisplayTime?: number;
  onComplete?: () => void;
  staggerDelay?: number;
}) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const repoInfo = repoQuery ? parseRepoQuery(repoQuery) : null;

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, minDisplayTime);

    const removeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, minDisplayTime + 500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [minDisplayTime, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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
            animationDelay={staggerDelay}
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
            animationDelay={staggerDelay * 2}
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
            animationDelay={staggerDelay}
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
            animationDelay={staggerDelay * 2}
          />
        </div>
      )}
    </div>
  );
}

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof LoadingOverlayStory> = {
  title: 'Home/LoadingOverlay',
  component: LoadingOverlayStory,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    repoQuery: {
      control: 'text',
      description: 'Repository query string (e.g., "owner/repo" or GitHub URL)',
    },
    minDisplayTime: {
      control: { type: 'number', min: 1000, max: 120000, step: 1000 },
      description: 'Minimum time to display overlay in milliseconds',
    },
    staggerDelay: {
      control: { type: 'number', min: 0, max: 5, step: 0.1 },
      description: 'Delay between each text reveal in seconds',
    },
  },
};

export default meta;
type Story = StoryObj<typeof LoadingOverlayStory>;

/**
 * Default welcome animation shown when no repository is specified
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory />
    </StoryWrapper>
  ),
};

/**
 * Animation when navigating to a specific repository
 */
export const WithRepository: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory repoQuery="anthropics/claude-code" />
    </StoryWrapper>
  ),
};

/**
 * Animation with a GitHub URL as the query
 */
export const WithGitHubUrl: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory repoQuery="https://github.com/facebook/react" />
    </StoryWrapper>
  ),
};

/**
 * Animation with a longer repository name
 */
export const LongRepoName: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory repoQuery="vercel/next.js" />
    </StoryWrapper>
  ),
};

/**
 * Fast stagger (0.5s between reveals)
 */
export const FastStagger: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory staggerDelay={0.5} />
    </StoryWrapper>
  ),
};

/**
 * Slow stagger (3s between reveals) for dramatic effect
 */
export const SlowStagger: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory staggerDelay={3} />
    </StoryWrapper>
  ),
};

/**
 * No stagger - all text reveals simultaneously
 */
export const NoStagger: Story = {
  render: () => (
    <StoryWrapper>
      <LoadingOverlayStory staggerDelay={0} />
    </StoryWrapper>
  ),
};

/**
 * Interactive playground with controls
 */
export const Playground: Story = {
  args: {
    repoQuery: '',
    minDisplayTime: 60000,
    staggerDelay: 0.5,
  },
  render: (args) => (
    <StoryWrapper>
      <LoadingOverlayStory {...args} />
    </StoryWrapper>
  ),
};
