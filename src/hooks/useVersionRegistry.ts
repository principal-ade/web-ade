import { useState, useEffect } from 'react';
import type { VersionRegistration } from '@/lib/version-registry/types';

interface UseVersionRegistryResult {
  registrations: VersionRegistration[];
  loading: boolean;
  error: string | null;
  count: number;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch version registry data for a repository
 */
export function useVersionRegistry(customerId: string | null): UseVersionRegistryResult {
  const [registrations, setRegistrations] = useState<VersionRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegistrations = async () => {
    if (!customerId) {
      setRegistrations([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/versions/list?customerId=${encodeURIComponent(customerId)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch registry: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setRegistrations(data.registrations || []);
      } else {
        throw new Error(data.error || 'Failed to fetch registrations');
      }
    } catch (err) {
      console.error('Failed to fetch version registry:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return {
    registrations,
    loading,
    error,
    count: registrations.length,
    refetch: fetchRegistrations,
  };
}
