import { useState, useEffect } from 'react';

export interface ServiceStatus {
  serviceName: string;
  firstSeen: string;
  lastSeen: string;
  totalTraces: number;
  isAlive: boolean;
}

interface UseServiceStatusResult {
  status: ServiceStatus | null;
  loading: boolean;
  error: string | null;
  isAlive: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch OTEL service status for a service
 *
 * Checks if a service is actively sending traces to the OTEL collector.
 * A service is considered "alive" if it sent a trace within the last 5 minutes.
 */
export function useServiceStatus(serviceName: string | null): UseServiceStatusResult {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!serviceName) {
      setStatus(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/otel/services/${encodeURIComponent(serviceName)}/status`
      );

      if (response.status === 404) {
        // Service has never sent traces
        setStatus(null);
        setError(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch service status: ${response.statusText}`);
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch service status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll every 60 seconds to keep status up-to-date
    const interval = setInterval(fetchStatus, 60000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceName]);

  return {
    status,
    loading,
    error,
    isAlive: status?.isAlive ?? false,
    refetch: fetchStatus,
  };
}
