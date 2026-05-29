'use client';

import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { TrailBackdrop } from '@/components/home/TrailBackdrop';
import { TrailsExplorer } from '@/components/home/TrailsExplorer';

export default function ExplorePage() {
  const { theme } = useTheme();

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      <TrailBackdrop theme={theme} />

      <header
        className="border-b px-4 flex items-center gap-2 flex-shrink-0 backdrop-blur-xl"
        style={{
          background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          paddingBottom: '0.5rem',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className="text-xl font-bold transition-opacity hover:opacity-80"
            style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>{' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </Link>

          <span
            className="mx-2"
            style={{ color: theme.colors.textMuted }}
            aria-hidden="true"
          >
            /
          </span>

          <span
            className="text-base font-semibold truncate"
            style={{ fontFamily: theme.fonts.body, color: theme.colors.text }}
          >
            Explore
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <UserAvatarMenu />
        </div>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '32px 24px 80px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <TrailsExplorer />
      </main>
    </div>
  );
}
