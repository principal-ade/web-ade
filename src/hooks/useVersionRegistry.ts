import { useState, useEffect } from 'react';
import type { VersionRegistration } from '@/lib/version-registry/types';

interface UseVersionRegistryResult {
  registrations: VersionRegistration[];
  loading: boolean;
  error: string | null;
  count: number;
  refetch: () => Promise<void>;
}

interface UseVersionRegistryOptions {
  /**
   * If true, only return versions that are currently "live" (sending traces in last 5 minutes)
   * Requires serviceName to be set
   * @default true
   */
  liveOnly?: boolean;
  /**
   * Service name to check for live versions (required if liveOnly is true)
   */
  serviceName?: string;
}

/**
 * Hook to fetch version registry data for a repository
 *
 * @param customerId - Repository identifier in "owner/repo" format
 * @param options - Optional filtering options
 */
export function useVersionRegistry(
  customerId: string | null,
  options?: UseVersionRegistryOptions
): UseVersionRegistryResult {
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
      // Fetch all version registrations (with cache-busting timestamp)
      const response = await fetch(
        `/api/versions/list?customerId=${encodeURIComponent(customerId)}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch registry: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch registrations');
      }

      let allRegistrations: VersionRegistration[] = data.registrations || [];

      // Default liveOnly to true unless explicitly set to false
      const shouldFilterLive = options?.liveOnly !== false;

      // If liveOnly is requested (default), filter by live versions from OTEL server
      if (shouldFilterLive && options?.serviceName) {
        try {
          const liveResponse = await fetch(
            `/api/otel/services/${encodeURIComponent(options.serviceName)}/versions/live?_t=${Date.now()}`,
            { cache: 'no-store' }
          );

          if (liveResponse.ok) {
            const liveData = await liveResponse.json();
            const liveVersions = new Set(liveData.liveVersions || []);

            // Filter registrations to only include live versions
            allRegistrations = allRegistrations.filter((reg) =>
              liveVersions.has(reg.version)
            );

            console.log('[useVersionRegistry] Filtered to live versions:', {
              total: data.registrations?.length || 0,
              live: allRegistrations.length,
              liveVersions: Array.from(liveVersions),
            });
          } else {
            console.warn('[useVersionRegistry] Failed to fetch live versions, showing all');
          }
        } catch (liveErr) {
          console.warn('[useVersionRegistry] Error fetching live versions:', liveErr);
          // Continue with all registrations if live filtering fails
        }
      }

      setRegistrations(allRegistrations);
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
  }, [customerId, options?.liveOnly, options?.serviceName]);

  return {
    registrations,
    loading,
    error,
    count: registrations.length,
    refetch: fetchRegistrations,
  };
}
