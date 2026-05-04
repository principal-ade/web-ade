'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SequenceDiagramPayload,
  SharedSequenceDiagramIndexEntry,
} from '@/lib/sequence-diagrams/types';

export type SharedAvailability = 'pending' | 'available' | 'unavailable' | 'error';

interface ListResponse {
  entries: SharedSequenceDiagramIndexEntry[];
}

interface FetchResponse {
  entry: SharedSequenceDiagramIndexEntry;
  payload: SequenceDiagramPayload;
}

export interface UseSharedSequenceDiagramsResult {
  availability: SharedAvailability;
  entries: SharedSequenceDiagramIndexEntry[];
  errorMessage: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  hydrate: (id: string) => Promise<FetchResponse>;
}

export function useSharedSequenceDiagrams(
  owner: string | null,
  repo: string | null,
): UseSharedSequenceDiagramsResult {
  const [availability, setAvailability] = useState<SharedAvailability>('pending');
  const [entries, setEntries] = useState<SharedSequenceDiagramIndexEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!owner || !repo) {
      setAvailability('unavailable');
      setEntries([]);
      setErrorMessage(null);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sequence-diagrams/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      );
      if (seq !== seqRef.current) return;

      // 401 is defensive — the read endpoints don't currently require
      // auth, but a future re-lock would surface here. 403 means the
      // requester can't see this repo on GitHub (private + no access).
      if (res.status === 401 || res.status === 403) {
        setAvailability('unavailable');
        setEntries([]);
        setErrorMessage(null);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAvailability('error');
        setEntries([]);
        setErrorMessage(body.error ?? `Listing failed (${res.status})`);
        return;
      }

      const data: ListResponse = await res.json();
      setEntries(data.entries);
      setAvailability('available');
      setErrorMessage(null);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setAvailability('error');
      setEntries([]);
      setErrorMessage(
        err instanceof Error ? err.message : 'Listing shared diagrams failed.',
      );
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hydrate = useCallback(
    async (id: string): Promise<FetchResponse> => {
      if (!owner || !repo) {
        throw new Error('No repository context for hydration.');
      }
      const res = await fetch(
        `/api/sequence-diagrams/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(id)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Fetch failed (${res.status})`);
      }
      return (await res.json()) as FetchResponse;
    },
    [owner, repo],
  );

  return {
    availability,
    entries,
    errorMessage,
    loading,
    refresh,
    hydrate,
  };
}
