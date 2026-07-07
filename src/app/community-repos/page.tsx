'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import type { CarouselCache } from '@/components/community/CommunityCarousel';
import { CommunityReposView } from '@/components/community/CommunityReposView';

export default function CommunityReposPage() {
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

  return (
    <ThemeProvider>
      <div style={{ maxWidth: 1200, margin: '40px auto', padding: '0 32px' }}>
        <CommunityReposView
          data={carousel}
          loading={loading}
          error={error}
          onRetry={fetchCarousel}
        />
      </div>
    </ThemeProvider>
  );
}
