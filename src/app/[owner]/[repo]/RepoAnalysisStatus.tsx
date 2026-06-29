'use client';

/**
 * "Repo Data" (powered by Freestyle.sh) — left-panel status block for the File
 * City dataset (building heights + contributor ownership) produced by a
 * Freestyle VM. Sits under the nav cards in ToursPane and reports, from
 * `useRepoAnalysis().meta`:
 *   - whether a warm VM is held for this repo,
 *   - the commit the data was last built at (the cached `sha`),
 *   - whether HEAD has moved past it (a rebuild is due),
 * and offers a single action: Get Line Count Data (never built) or Rebuild.
 */
import { useTheme } from '@principal-ade/industry-theme';
import {
  Boxes,
  Check,
  ExternalLink,
  GitCommitHorizontal,
  Play,
  RefreshCw,
  Server,
  Users,
} from 'lucide-react';
import { useRepoAnalysis } from './RepoAnalysisContext';

const FRESH_GREEN = '#3fb950';

export function RepoAnalysisStatus() {
  const { meta, state, analysis, run } = useRepoAnalysis();
  const { theme } = useTheme();

  const running = state.kind === 'running';
  const analyzed = Boolean(meta?.sha) || Boolean(analysis);
  const hasVm = Boolean(meta?.hasWarmVm);
  const stale = Boolean(meta?.stale);
  const shortSha = meta?.sha ? meta.sha.slice(0, 7) : null;

  // Don't paint anything until the mount GET has resolved freshness.
  if (!meta && !analysis) return null;

  const rowLabel: React.CSSProperties = {
    fontSize: theme.fontSizes[1],
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
  };
  const rowValue: React.CSSProperties = {
    fontSize: theme.fontSizes[1],
    color: theme.colors.text,
    lineHeight: 1.4,
  };
  const actionLabel = running
    ? analyzed
      ? 'Rebuilding…'
      : 'Getting data…'
    : analyzed
      ? 'Rebuild'
      : 'Get Line Count Data';

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span
          style={{
            fontSize: theme.fontSizes[0],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Repo Data
        </span>
        <a
          href="https://www.freestyle.sh"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex shrink-0 items-center gap-1"
          style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
        >
          <span style={{ opacity: 0.8 }}>powered by</span>
          <span
            className="group-hover:underline"
            style={{ color: theme.colors.textSecondary, fontWeight: theme.fontWeights.semibold }}
          >
            Freestyle.sh
          </span>
          <ExternalLink size={11} />
        </a>
      </div>

      <div
        className="flex flex-col gap-3 rounded-lg border p-3"
        style={{
          borderColor: theme.colors.border,
          background: `color-mix(in srgb, ${theme.colors.text} 4%, transparent)`,
          color: theme.colors.text,
        }}
      >
        {analyzed && (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2" style={rowLabel}>
                  <Server size={14} style={{ color: theme.colors.textMuted }} />
                  Warm VM
                </span>
                <span className="inline-flex items-center gap-1.5" style={rowValue}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 9999,
                      background: hasVm ? FRESH_GREEN : theme.colors.textMuted,
                      boxShadow: hasVm
                        ? `0 0 0 3px color-mix(in srgb, ${FRESH_GREEN} 22%, transparent)`
                        : 'none',
                    }}
                  />
                  {hasVm ? 'Ready' : 'Cold start'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2" style={rowLabel}>
                  <GitCommitHorizontal size={14} style={{ color: theme.colors.textMuted }} />
                  Last built
                </span>
                <code
                  style={{
                    fontSize: theme.fontSizes[0],
                    color: theme.colors.text,
                    background: `color-mix(in srgb, ${theme.colors.text} 7%, transparent)`,
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  {shortSha ?? '—'}
                </code>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span style={rowLabel}>Status</span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontWeight: theme.fontWeights.semibold,
                    color: stale ? theme.colors.accent : FRESH_GREEN,
                    background: stale
                      ? `color-mix(in srgb, ${theme.colors.accent} 15%, transparent)`
                      : `color-mix(in srgb, ${FRESH_GREEN} 15%, transparent)`,
                  }}
                >
                  {stale ? <RefreshCw size={11} /> : <Check size={11} />}
                  {stale ? 'Update available' : 'Up to date'}
                </span>
              </div>
            </div>

            <div className="h-px w-full" style={{ background: theme.colors.border }} />
          </>
        )}

        {state.kind === 'error' && (
          <div style={{ fontSize: theme.fontSizes[0], color: '#f0a0a0', lineHeight: 1.4 }}>
            {state.message}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
              lineHeight: 1.4,
            }}
          >
            Line count data powers
          </span>
          <div className="flex gap-1.5">
            {[
              { icon: <Users size={13} />, label: 'Contributor coverage' },
              { icon: <Boxes size={13} />, label: '3D visualization' },
            ].map((f) => (
              <span
                key={f.label}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-center"
                style={{
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textSecondary,
                  background: `color-mix(in srgb, ${theme.colors.text} 5%, transparent)`,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <span style={{ color: theme.colors.primary, display: 'inline-flex' }}>
                  {f.icon}
                </span>
                {f.label}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className="flex items-center justify-center gap-2 rounded-md px-3 py-2.5 transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            background: theme.colors.primary,
            color: '#fff',
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.semibold,
            cursor: running ? 'wait' : 'pointer',
            boxShadow: `0 1px 2px color-mix(in srgb, ${theme.colors.primary} 40%, transparent)`,
          }}
        >
          {running ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : analyzed ? (
            <RefreshCw size={14} />
          ) : (
            <Play size={14} />
          )}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
