'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { Code2, Loader2, CheckCircle, AlertTriangle, AlertOctagon, Scan, Activity, Zap, AlertCircle, X } from 'lucide-react';

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

interface VibeCodingPaneProps {
  fileCount: number | null;
  occurrenceCount: number | null;
  files: { path: string; html_url: string }[];
  terms: string[];
  loading: boolean;
  error: string | null;
  scanActive: boolean;
  scanProgress: number;
  scanDirectory: string | null;
  totalRepoFiles: number;
  onClear: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

export default function VibeCodingPane({
  fileCount,
  occurrenceCount,
  files,
  terms,
  loading,
  error,
  scanActive,
  scanProgress,
  scanDirectory,
  totalRepoFiles,
  onClear,
  onRefresh,
  onClose,
}: VibeCodingPaneProps) {
  const { theme } = useTheme();

  const severity = occurrenceCount !== null ? getSeverity(occurrenceCount) : null;
  const SeverityIcon = severity?.icon ?? Code2;
  const hasResults = fileCount !== null && occurrenceCount !== null;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      {/* Pane header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
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
          ) : scanActive ? (
            <Scan className="w-4 h-4 animate-pulse" style={{ color: theme.colors.primary }} />
          ) : (
            <Code2 className="w-4 h-4" style={{ color: theme.colors.textMuted }} />
          )}
          <span className="text-sm font-semibold">Vibe Coding Detector</span>
        </div>
        <div className="flex items-center gap-1">
          {hasResults && !loading && (
            <>
              <button
                type="button"
                onClick={onRefresh}
                className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                style={{
                  background: `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`,
                  color: theme.colors.primary,
                }}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={onClear}
                className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                style={{
                  background: `color-mix(in srgb, ${theme.colors.textMuted} 15%, transparent)`,
                  color: theme.colors.textMuted,
                }}
              >
                Clear
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80"
            style={{ color: theme.colors.textMuted }}
            aria-label="Close vibe coding view"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>
        {/* LOADING STATE */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <Scan className="w-10 h-10 animate-pulse" style={{ color: theme.colors.primary }} />
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
              {scanDirectory && (
                <div className="text-xs mt-2 px-2 py-1 rounded inline-block" style={{
                  background: `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`,
                  color: theme.colors.primary,
                  fontFamily: theme.fonts.monospace,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                }}>
                  {scanDirectory}
                </div>
              )}
            </div>
            {/* Progress bar — driven by the scan sweep position */}
            <div className="w-full space-y-1.5">
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: `color-mix(in srgb, ${theme.colors.textMuted} 15%, transparent)` }}
              >
                <div
                  className="h-full rounded-full transition-all duration-100 ease-linear"
                  style={{
                    background: theme.colors.primary,
                    width: `${Math.max(2, scanProgress * 100)}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                <span>
                  {Math.round(scanProgress * totalRepoFiles).toLocaleString()} / {totalRepoFiles.toLocaleString()} files
                </span>
                <span>{Math.round(scanProgress * 100)}%</span>
              </div>
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
              className="flex items-center gap-3 px-4 py-4 rounded-lg"
              style={{
                background: `color-mix(in srgb, ${severity!.color} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${severity!.color} 25%, transparent)`,
              }}
            >
              <SeverityIcon
                className="w-10 h-10 shrink-0"
                style={{ color: severity!.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold tracking-tight" style={{ color: severity!.color }}>
                  {severity!.label}
                </div>
                <div className="text-sm mt-0.5" style={{ color: theme.colors.textMuted }}>
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
                  className="max-h-[300px] overflow-y-auto space-y-0.5 rounded-lg border"
                  style={{
                    borderColor: `color-mix(in srgb, ${theme.colors.textMuted} 12%, transparent)`,
                    scrollbarWidth: 'thin',
                  }}
                >
                  {files.slice(0, 50).map((f) => (
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
                  {files.length > 50 && (
                    <div className="px-2.5 py-1.5 text-xs" style={{ color: theme.colors.textMuted }}>
                      +{files.length - 50} more files
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* IDLE STATE (no results, not loading, not error — should only show briefly) */}
        {!hasResults && !loading && !error && !scanActive && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Code2 className="w-8 h-8" style={{ color: theme.colors.textMuted }} />
            <div className="text-sm text-center" style={{ color: theme.colors.textMuted }}>
              Click the vibe coding button in the header to scan this repo.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
