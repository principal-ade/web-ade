'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import type { CarouselCache } from '@/components/community/CommunityCarousel';
import { CommunityReposView } from '@/components/community/CommunityReposView';
import { TrailBackdrop } from '@/components/home/TrailBackdrop';

function Header({ repoCount }: { repoCount: number }) {
  const { theme } = useTheme();

  return (
    <header
      className="border-b px-4 flex-shrink-0 backdrop-blur-xl"
      style={{
        background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
        borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
        paddingTop: 'calc(var(--safe-top) + 0.5rem)',
        paddingBottom: '0.5rem',
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div
        className="flex items-center justify-between gap-2 min-w-0"
        style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}
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
            Community
          </span>

          {repoCount > 0 && (
            <span
              className="community-repos-count"
              style={{
                fontSize: 13,
                color: theme.colors.textMuted,
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 8,
                padding: '2px 10px',
                marginLeft: 12,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <UserAvatarMenu />
        </div>
      </div>
    </header>
  );
}

export default function CommunityReposPage() {
  const { theme } = useTheme();
  const [carousel, setCarousel] = useState<CarouselCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCarousel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/carousel');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCarousel(await res.json() as CarouselCache);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCarousel(); }, [fetchCarousel]);

  const repoCount = carousel?.repos.length ?? 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      {/* Ambient backdrop — out-of-focus city + trail fragments. */}
      <TrailBackdrop theme={theme} />

      <Header repoCount={repoCount} />

      <main
        className="community-repos-main"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '32px 32px 80px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <style>{`
          @media (max-width: 767px) {
            .community-repos-main {
              padding: 12px 12px 48px !important;
            }
            .community-repos-count {
              display: none;
            }
          }
        `}</style>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <CommunityReposView
            data={carousel}
            loading={loading}
            error={error}
            onRetry={fetchCarousel}
          />
        </div>
      </main>
    </div>
  );
}