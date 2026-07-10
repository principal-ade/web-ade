'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Code2, Loader2, CheckCircle, AlertTriangle, AlertOctagon, Scan, Activity, Zap, AlertCircle } from 'lucide-react';
import type { GitHubCodeSearchResponse } from '@/types/api';

interface VibeCodingButtonProps {
  owner: string;
  repo: string;
  filePaths: string[];
  onHighlight?: (paths: string[] | null) => void;
  onScanChange?: (scanning: boolean) => void;
}

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

// Scan animation constants
const SCAN_WINDOW = 80;
const SCAN_STEP = 30;
const SCAN_INTERVAL = 90;

export default function VibeCodingButton({ owner, repo, filePaths, onHighlight, onScanChange }: VibeCodingButtonProps) {
  const { theme } = useTheme();
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [occurrenceCount, setOccurrenceCount] = useState<number | null>(null);
  const [files, setFiles] = useState<{ path: string; html_url: string }[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanOffsetRef = useRef(0);
  const [scanActive, setScanActive] = useState(false);

  // Deferred reveal: store API results until the scan sweep finishes.
  const pendingResultsRef = useRef<GitHubCodeSearchResponse | null>(null);

  const revealResults = useCallback((data: GitHubCodeSearchResponse) => {
    setFileCount(data.total_files);
    setOccurrenceCount(data.total_occurrences);
    setTerms(data.terms);
    setFiles(data.items);
    onHighlight?.(data.items.map((i) => i.path));
    pendingResultsRef.current = null;
  }, [onHighlight]);

  const severity = useMemo(
    () => (occurrenceCount !== null ? getSeverity(occurrenceCount) : null),
    [occurrenceCount]
  );

  const totalRepoFiles = filePaths.length;

  const search = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setFileCount(null);
    setOccurrenceCount(null);
    setTerms([]);
    setFiles([]);
    pendingResultsRef.current = null;

    // Start scan animation over the city — sweeps a sliding window through
    // all file paths. Each tick highlights a new batch, creating the illusion
    // of a search beam sweeping across File City.
    if (filePaths.length > 0) {
      setScanActive(true);
      onScanChange?.(true);
      scanOffsetRef.current = 0;
      const timer = setInterval(() => {
        const offset = scanOffsetRef.current;
        const newOffset = (offset + SCAN_STEP) % filePaths.length;

        // Detect sweep completion (offset wrapped around)
        if (newOffset < offset) {
          if (pendingResultsRef.current) {
            clearInterval(timer);
            scanTimerRef.current = null;
            setScanActive(false);
            onScanChange?.(false);
            revealResults(pendingResultsRef.current);
            return;
          }
        }

        const batch = filePaths.slice(newOffset, newOffset + SCAN_WINDOW);
        onHighlight?.(batch);
        scanOffsetRef.current = newOffset;
      }, SCAN_INTERVAL);
      scanTimerRef.current = timer;
    } else {
      // No files to animate — show the scanning state anyway
      setScanActive(true);
      onScanChange?.(true);
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
        // Scan is still running — queue results for when the sweep finishes
        pendingResultsRef.current = data;
      } else {
        // No scan animation (empty file list) or scan already completed
        setScanActive(false);
        onScanChange?.(false);
        revealResults(data);
      }
    } catch (e) {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      setScanActive(false);
      onScanChange?.(false);
      setError(e instanceof Error ? e.message : 'Unknown error');
      onHighlight?.(null);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, filePaths, loading, onHighlight, onScanChange, revealResults]);

  const clear = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    setScanActive(false);
    onScanChange?.(false);
    onHighlight?.(null);
    setFileCount(null);
    setOccurrenceCount(null);
    setTerms([]);
    setFiles([]);
    setShowDropdown(false);
    pendingResultsRef.current = null;
  }, [onHighlight, onScanChange]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const SeverityIcon = severity?.icon ?? Code2;
  const hasResults = fileCount !== null && occurrenceCount !== null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!hasResults && !loading && !error) {
            search();
          } else {
            setShowDropdown((prev) => !prev);
          }
        }}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
        style={{
          color: hasResults ? severity!.color : scanActive ? theme.colors.primary : theme.colors.text,
          background:
            hasResults
              ? `color-mix(in srgb, ${severity!.color} 15%, transparent)`
              : scanActive
                ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
                : 'transparent',
          ...(scanActive ? { animation: 'pulse 1s ease-in-out infinite' } : {}),
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

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 z-50 min-w-[300px] max-w-[420px] rounded-xl border shadow-xl p-0 overflow-hidden"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        >
          {/* HEADER */}
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{
              borderColor: theme.colors.border,
              ...(severity ? { background: `color-mix(in srgb, ${severity.color} 8%, transparent)` } : {}),
            }}
          >
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.textMuted }} />
              ) : severity ? (
                <SeverityIcon className="w-4 h-4" style={{ color: severity.color }} />
              ) : (
                <Code2 className="w-4 h-4" style={{ color: theme.colors.textMuted }} />
              )}
              <span className="text-sm font-semibold">Vibe Coding Detector</span>
            </div>
            <div className="flex items-center gap-1">
              {!loading && hasResults && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clear();
                    }}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.textMuted} 15%, transparent)`,
                      color: theme.colors.textMuted,
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      search();
                    }}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`,
                      color: theme.colors.primary,
                    }}
                  >
                    Refresh
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* LOADING STATE */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="relative">
                  <Scan className="w-8 h-8 animate-pulse" style={{ color: theme.colors.primary }} />
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-20"
                    style={{ background: theme.colors.primary }}
                  />
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium" style={{ color: theme.colors.text }}>
                    Scanning codebase...
                  </div>
                  <div className="text-xs mt-1" style={{ color: theme.colors.textMuted }}>
                    Searching for isRecord, is_record patterns
                  </div>
                </div>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: `color-mix(in srgb, ${theme.colors.textMuted} 15%, transparent)` }}
                >
                  <div
                    className="h-full rounded-full animate-scan"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${theme.colors.primary}, transparent)`,
                      width: '40%',
                    }}
                  />
                </div>
              </div>
            )}

            {/* ERROR STATE */}
            {error && (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: theme.colors.error ?? '#ef4444' }}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* RESULTS */}
            {hasResults && !loading && (
              <>
                {/* Severity Badge */}
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{
                    background: `color-mix(in srgb, ${severity!.color} 10%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${severity!.color} 25%, transparent)`,
                  }}
                >
                  <SeverityIcon
                    className="w-8 h-8 shrink-0"
                    style={{ color: severity!.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-bold tracking-tight" style={{ color: severity!.color }}>
                      {severity!.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: theme.colors.textMuted }}>
                      {occurrenceCount! > 0
                        ? `${occurrenceCount} pattern${occurrenceCount !== 1 ? 's' : ''} found across ${fileCount} file${fileCount !== 1 ? 's' : ''}`
                        : 'No vibe coding patterns detected'}
                    </div>
                  </div>
                </div>

                {/* Severity Scale */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                    <span>0</span>
                    <span>Severity Index</span>
                    <span>100+</span>
                  </div>
                  <div
                    className="w-full h-2 rounded-full overflow-hidden flex"
                    style={{ background: `color-mix(in srgb, ${theme.colors.textMuted} 12%, transparent)` }}
                  >
                    {(['safe', 'low', 'moderate', 'high', 'critical'] as SeverityLevel[]).map((lvl) => {
                      const cfg = SEVERITY[lvl];
                      const isActive = occurrenceCount !== null && getSeverity(occurrenceCount).level === cfg.level;
                      return (
                        <div
                          key={lvl}
                          className="flex-1 h-full transition-all duration-500"
                          style={{
                            background: isActive ? cfg.color : `color-mix(in srgb, ${cfg.color} 20%, transparent)`,
                            opacity: isActive ? 1 : 0.5,
                          }}
                        />
                      );
                    })}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-wider font-semibold transition-all duration-500"
                    style={{ color: severity!.color }}
                  >
                    {occurrenceCount! > 0 ? (
                      <span>
                        {occurrenceCount} occurrence{occurrenceCount !== 1 ? 's' : ''} —{' '}
                        {Math.round((occurrenceCount! / Math.max(totalRepoFiles, 1)) * 100)}% of repo
                      </span>
                    ) : (
                      <span>Clean — no patterns found</span>
                    )}
                  </div>
                </div>

                {/* Terms */}
                {terms.length > 0 && (
                  <div
                    className="px-3 py-2 rounded-lg text-xs flex items-center gap-2 flex-wrap"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.textMuted} 8%, transparent)`,
                      color: theme.colors.textSecondary,
                    }}
                  >
                    <span style={{ color: theme.colors.textMuted }}>Terms:</span>
                    {terms.map((t) => (
                      <code
                        key={t}
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{
                          background: `color-mix(in srgb, ${theme.colors.textMuted} 12%, transparent)`,
                          fontFamily: theme.fonts.monospace,
                          color: theme.colors.text,
                        }}
                      >
                        {t}
                      </code>
                    ))}
                  </div>
                )}

                {/* File List */}
                {files.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-1.5" style={{ color: theme.colors.textMuted }}>
                      Matching files ({fileCount} total)
                    </div>
                    <div
                      className="max-h-[200px] overflow-y-auto space-y-0.5 rounded-lg border"
                      style={{
                        borderColor: `color-mix(in srgb, ${theme.colors.textMuted} 12%, transparent)`,
                        scrollbarWidth: 'thin',
                      }}
                    >
                      {files.slice(0, 30).map((f) => (
                        <a
                          key={f.path}
                          href={f.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:opacity-80 rounded"
                          style={{
                            color: theme.colors.textSecondary,
                            fontFamily: theme.fonts.monospace,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              background: severity!.color,
                              opacity: 0.6,
                            }}
                          />
                          {f.path}
                        </a>
                      ))}
                      {files.length > 30 && (
                        <div className="px-2.5 py-1.5 text-xs" style={{ color: theme.colors.textMuted }}>
                          +{files.length - 30} more files
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* IDLE STATE */}
            {!hasResults && !loading && !error && (
              <div className="flex flex-col items-center gap-2 py-3">
                <Code2 className="w-6 h-6" style={{ color: theme.colors.textMuted }} />
                <div className="text-sm text-center" style={{ color: theme.colors.textMuted }}>
                  Scan this repo for{' '}
                  <code style={{ fontFamily: theme.fonts.monospace }}>isRecord</code> /{' '}
                  <code style={{ fontFamily: theme.fonts.monospace }}>is_record</code>
                  <br />
                  patterns to measure LLM-generated code.
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    search();
                  }}
                  className="text-xs px-4 py-1.5 rounded-lg font-medium transition-all hover:opacity-80 mt-1"
                  style={{
                    background: `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`,
                    color: theme.colors.primary,
                  }}
                >
                  Run Scan
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
