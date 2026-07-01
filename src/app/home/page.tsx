'use client';

import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { AgentViewButton } from '@/components/AgentViewButton';
import { HomeThemeToggle } from '@/components/HomeThemeToggle';
import { SignedInHome } from '@/components/home/SignedInHome';

/**
 * `/home` — the signed-in app surface (the user-based two-pane rail + File City).
 * Decoupled from the marketing landing at `/`: signed-in document navigations to
 * `/` are redirected here by middleware.
 *
 * This page deliberately does NOT redirect signed-out users back to `/`: a stale
 * `github_token` cookie (present but invalid) would otherwise ping-pong with the
 * middleware redirect. Instead it shows a sign-in prompt, so the loop can't form.
 */
export default function HomeDashboardPage() {
  const { theme } = useTheme();
  const { user, isLoading } = useAuth();

  return (
    <div
      className="h-viewport-fixed flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl shrink-0"
        style={{
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          background: `color-mix(in srgb, ${theme.colors.backgroundSecondary ?? theme.colors.background} 55%, transparent)`,
        }}
      >
        <div className="w-full flex items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <h1
              className="text-2xl font-bold m-0"
              style={{ fontFamily: theme.fonts.body }}
            >
              <span style={{ color: theme.colors.text }}>Principal</span>{' '}
              <span style={{ color: theme.colors.primary }}>AI</span>
            </h1>
          </Link>
          <div className="flex items-center gap-3">
            <HomeThemeToggle />
            <div className="hidden sm:flex">
              <AgentViewButton path="/home" />
            </div>
            <UserAvatarMenu />
          </div>
        </div>
      </header>

      {isLoading ? (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: theme.colors.textMuted }}
        >
          <span style={{ fontSize: theme.fontSizes[1] }}>Loading…</span>
        </div>
      ) : user ? (
        <SignedInHome user={user} />
      ) : (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center"
          style={{ color: theme.colors.textMuted }}
        >
          <p style={{ fontSize: theme.fontSizes[3], color: theme.colors.text }}>
            Sign in to view your home
          </p>
          <p style={{ fontSize: theme.fontSizes[2] }}>
            Use the account menu above, or head back to the{' '}
            <Link href="/" style={{ color: theme.colors.primary }}>
              landing page
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
