import { useState, useEffect } from 'react';

interface UseLiveVersionsResult {
  liveVersions: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch live versions for a service from OTEL collector
 *
 * Returns versions that have sent traces within the last 5 minutes.
 */
export function useLiveVersions(serviceName: string | null): UseLiveVersionsResult {
  const [liveVersions, setLiveVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveVersions = async () => {
    if (!serviceName) {
      setLiveVersions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/otel/services/${encodeURIComponent(serviceName)}/versions/live`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch live versions: ${response.statusText}`);
      }

      const data = await response.json();
      setLiveVersions(data.liveVersions || []);
    } catch (err) {
      console.error('Failed to fetch live versions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLiveVersions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveVersions();

    // Poll every 60 seconds to keep live status up-to-date
    const interval = setInterval(fetchLiveVersions, 60000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceName]);

  return {
    liveVersions,
    loading,
    error,
    refetch: fetchLiveVersions,
  };
}
