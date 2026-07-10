'use client';

import { useCallback, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Code2, Loader2, CheckCircle, AlertTriangle, AlertOctagon, Activity, Zap } from 'lucide-react';
import type { GitHubCodeSearchResponse } from '@/types/api';

type SeverityLevel = 'safe' | 'low' | 'moderate' | 'high' | 'critical';

interface SeverityConfig {
  level: SeverityLevel;
  label: string;
  color: string;
  icon: typeof CheckCircle;
}

const SEVERITY: Record<SeverityLevel, SeverityConfig> = {
  safe: { level: 'safe', label: 'Safe', color: '#22c55e', icon: CheckCircle },
  low: { level: 'low', label: 'Low', color: '#eab308', icon: AlertTriangle },
  moderate: { level: 'moderate', label: 'Moderate', color: '#f97316', icon: Activity },
  high: { level: 'high', label: 'High', color: '#ef4444', icon: Zap },
  critical: { level: 'critical', label: 'Critical', color: '#d946ef', icon: AlertOctagon },
};

function getSeverity(occurrences: number): SeverityConfig {
  if (occurrences < 5) return SEVERITY.safe;
  if (occurrences < 10) return SEVERITY.low;
  if (occurrences < 50) return SEVERITY.moderate;
  if (occurrences < 100) return SEVERITY.high;
  return SEVERITY.critical;
}

const SCAN_INTERVAL = 90;
const MAX_SCAN_DURATION_MS = 5000;

function computeScanStep(totalFiles: number): number {
  if (totalFiles === 0) return 1;
  // Ticks needed to cover all files at 90ms each within the budget
  const maxTicks = Math.ceil(MAX_SCAN_DURATION_MS / SCAN_INTERVAL);
  const step = Math.ceil(totalFiles / Math.min(maxTicks, totalFiles));
  return Math.max(step, 1);
}

export interface VibeCodingData {
  fileCount: number | null;
  occurrenceCount: number | null;
  files: { path: string; html_url: string }[];
  terms: string[];
  loading: boolean;
  error: string | null;
  scanActive: boolean;
  scanProgress: number;
  scanWindowPaths: string[];
  scanDirectory: string | null;
}

interface VibeCodingButtonProps {
  owner: string;
  repo: string;
  filePaths: string[];
  onHighlight?: (paths: string[] | null) => void;
  onDataChange?: (data: VibeCodingData) => void;
  onOpenView?: () => void;
}

export interface VibeCodingButtonHandle {
  search: () => void;
  clear: () => void;
}

export default forwardRef<VibeCodingButtonHandle, VibeCodingButtonProps>(function VibeCodingButton(
  { owner, repo, filePaths, onHighlight, onDataChange, onOpenView },
  ref,
) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [occurrenceCount, setOccurrenceCount] = useState<number | null>(null);

  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanOffsetRef = useRef(0);
  const pendingResultsRef = useRef<GitHubCodeSearchResponse | null>(null);

  const emitData = useCallback((data: Partial<VibeCodingData>) => {
    onDataChange?.({
      fileCount: data.fileCount ?? null,
      occurrenceCount: data.occurrenceCount ?? null,
      files: data.files ?? [],
      terms: data.terms ?? [],
      loading: data.loading ?? false,
      error: data.error ?? null,
      scanActive: data.scanActive ?? false,
      scanProgress: data.scanProgress ?? 0,
      scanWindowPaths: data.scanWindowPaths ?? [],
      scanDirectory: data.scanDirectory ?? null,
    });
  }, [onDataChange]);

  const revealResults = useCallback((data: GitHubCodeSearchResponse) => {
    setHasResults(true);
    setOccurrenceCount(data.total_occurrences);
    emitData({
      fileCount: data.total_files,
      occurrenceCount: data.total_occurrences,
      files: data.items,
      terms: data.terms,
      loading: false,
      error: null,
      scanActive: false,
      scanProgress: 1,
    });
    onHighlight?.(data.items.map((i) => i.path));
    pendingResultsRef.current = null;
  }, [emitData, onHighlight]);

  const clear = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    pendingResultsRef.current = null;
    setLoading(false);
    setHasResults(false);
    setOccurrenceCount(null);
    emitData({
      fileCount: null,
      occurrenceCount: null,
      files: [],
      terms: [],
      loading: false,
      error: null,
      scanActive: false,
      scanProgress: 0,
    });
    onHighlight?.(null);
  }, [emitData, onHighlight]);

  const search = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setHasResults(false);
    setOccurrenceCount(null);
    pendingResultsRef.current = null;

    emitData({ loading: true, scanActive: true, error: null });

    // Start scan animation over the city — cumulatively highlights files
    // so the city fills up progressively as the scan sweeps through.
    if (filePaths.length > 0) {
      const scanStep = computeScanStep(filePaths.length);
      scanOffsetRef.current = 0;
      const accumulated = new Set<string>();
      const timer = setInterval(() => {
        const offset = scanOffsetRef.current;
        const newOffset = (offset + scanStep) % filePaths.length;

        if (newOffset < offset) {
          if (pendingResultsRef.current) {
            clearInterval(timer);
            scanTimerRef.current = null;
            revealResults(pendingResultsRef.current);
            return;
          }
        }

        // Add the new batch to the accumulated set
        const windowPaths: string[] = [];
        for (let i = offset; i < newOffset; i++) {
          accumulated.add(filePaths[i]!);
          windowPaths.push(filePaths[i]!);
        }
        // Also cover the wrap-around edge case
        if (newOffset < offset) {
          for (let i = offset; i < filePaths.length; i++) {
            accumulated.add(filePaths[i]!);
            windowPaths.push(filePaths[i]!);
          }
        }
        onHighlight?.(Array.from(accumulated));
        scanOffsetRef.current = newOffset;
        // Derive the directory being scanned from the first file in the window
        const firstFile = windowPaths[0];
        const lastSlash = firstFile ? firstFile.lastIndexOf('/') : -1;
        const dir = lastSlash >= 0 ? firstFile!.slice(0, lastSlash) : firstFile;
        emitData({ loading: true, scanActive: true, scanProgress: newOffset / filePaths.length, scanWindowPaths: windowPaths, scanDirectory: dir ?? null });
      }, SCAN_INTERVAL);
      scanTimerRef.current = timer;
    }

    try {
      const res = await fetch(
        `/api/github/code-search?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&q=${encodeURIComponent('isRecord,is_record')}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `GitHub API error (${res.status})`);
      }
      const data: GitHubCodeSearchResponse = await res.json();

      if (scanTimerRef.current) {
        pendingResultsRef.current = data;
      } else {
        setHasResults(true);
        setOccurrenceCount(data.total_occurrences);
        emitData({
          fileCount: data.total_files,
          occurrenceCount: data.total_occurrences,
          files: data.items,
          terms: data.terms,
          loading: false,
          error: null,
          scanActive: false,
        });
        onHighlight?.(data.items.map((i) => i.path));
      }
    } catch (e) {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      const msg = e instanceof Error ? e.message : 'Unknown error';
      emitData({ loading: false, error: msg, scanActive: false });
      onHighlight?.(null);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, filePaths, loading, emitData, onHighlight, revealResults]);

  const severity = occurrenceCount !== null ? getSeverity(occurrenceCount) : null;
  useImperativeHandle(ref, () => ({ search, clear }), [search, clear]);

  const SeverityIcon = severity?.icon ?? Code2;

  return (
    <button
      type="button"
      onClick={() => {
        search();
        onOpenView?.();
      }}
      className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
      style={{
        color: hasResults ? severity!.color : loading ? theme.colors.primary : theme.colors.text,
        background:
          hasResults
            ? `color-mix(in srgb, ${severity!.color} 15%, transparent)`
            : loading
              ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
              : 'transparent',
        ...(loading ? { animation: 'pulse 1s ease-in-out infinite' } : {}),
      }}
      title={`Search ${owner}/${repo} for vibe coding patterns`}
      aria-label="Vibe coding detector"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : hasResults ? (
        <SeverityIcon className="w-4 h-4" />
      ) : (
        <Code2 className="w-4 h-4" />
      )}
    </button>
  );
});

export { getSeverity, SEVERITY };
export type { SeverityLevel };
