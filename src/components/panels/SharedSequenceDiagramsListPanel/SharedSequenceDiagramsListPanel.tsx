'use client';

/**
 * Web-ade port of the desktop's SequenceDiagramsPanel — shared-section only.
 * Lists payloads stored under sequence-diagrams/{owner}/{repo}/ and, when
 * the user activates a row, hands the hydrated payload back via
 * `onActivate` so the host can drop it into FileCitySequenceExplorerPanel's
 * `sequenceDiagram` slice.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { AlertCircle, RefreshCw, Workflow } from 'lucide-react';
import type { SequenceDiagramPayload } from '@/lib/sequence-diagrams/types';
import { useSharedSequenceDiagrams } from './useSharedSequenceDiagrams';
import { SharedSequenceDiagramRow } from './SharedSequenceDiagramRow';

export interface SharedSequenceDiagramsListPanelProps {
  owner: string | null;
  repo: string | null;
  /** Currently-active payload id (highlights the matching row). */
  activeId: string | null;
  /**
   * Walkthrough id to auto-activate once when the listing first resolves.
   * Used to honor `?walkthrough=<id>` deep links. Subsequent prop changes
   * are ignored — once activated, ownership of the selection moves to
   * the user.
   */
  initialActivateId?: string;
  onActivate: (payload: SequenceDiagramPayload) => void;
}

export const SharedSequenceDiagramsListPanel: React.FC<
  SharedSequenceDiagramsListPanelProps
> = ({ owner, repo, activeId, initialActivateId, onActivate }) => {
  const { theme } = useTheme();
  const { availability, entries, errorMessage, loading, refresh, hydrate } =
    useSharedSequenceDiagrams(owner, repo);

  const handleActivate = useCallback(
    async (id: string) => {
      const fetched = await hydrate(id);
      onActivate(fetched.payload);
    },
    [hydrate, onActivate],
  );

  // Auto-activate from `initialActivateId` once entries resolve. Guarded
  // by a ref so we never re-activate (e.g. on remount, or if the user
  // manually picked a different row before the listing finished
  // loading).
  const autoActivatedRef = useRef(false);
  useEffect(() => {
    if (autoActivatedRef.current) return;
    if (!initialActivateId) return;
    if (availability !== 'available') return;
    if (activeId === initialActivateId) {
      autoActivatedRef.current = true;
      return;
    }
    if (!entries.some((e) => e.id === initialActivateId)) return;
    autoActivatedRef.current = true;
    handleActivate(initialActivateId).catch(() => {
      // Hydration errors surface in the row's own error state when the
      // user clicks; for the auto-activate path we just silently leave
      // the row untouched.
    });
  }, [initialActivateId, availability, entries, activeId, handleActivate]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <Workflow size={18} strokeWidth={1.5} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              lineHeight: 1.2,
            }}
          >
            Trails
          </h2>
        </div>
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          aria-label="Refresh"
          disabled={loading || availability === 'unavailable'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            borderRadius: '6px',
            border: `1px solid ${theme.colors.border}`,
            background: 'transparent',
            color: theme.colors.textSecondary,
            cursor:
              loading || availability === 'unavailable'
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          <RefreshCw size={12} />
        </button>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {availability === 'pending' && <Loading theme={theme} />}

        {availability === 'unavailable' && (
          <UnavailableState theme={theme} hasRepo={!!(owner && repo)} />
        )}

        {availability === 'error' && (
          <ErrorRow
            theme={theme}
            message={errorMessage ?? 'Could not load shared diagrams.'}
            onRetry={refresh}
          />
        )}

        {availability === 'available' && entries.length === 0 && (
          <EmptyState theme={theme} />
        )}

        {availability === 'available' &&
          entries.map((entry) => (
            <SharedSequenceDiagramRow
              key={entry.id}
              entry={entry}
              isActive={entry.id === activeId}
              onActivate={handleActivate}
              sharePath={
                owner && repo
                  ? `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?walkthrough=${encodeURIComponent(entry.id)}`
                  : null
              }
            />
          ))}
      </div>
    </div>
  );
};

const Loading: React.FC<{ theme: ReturnType<typeof useTheme>['theme'] }> = ({
  theme,
}) => (
  <div
    style={{
      padding: '12px 0',
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes[1],
    }}
  >
    Loading…
  </div>
);

const ErrorRow: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
  message: string;
  onRetry: () => void;
}> = ({ theme, message, onRetry }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 12px',
      borderRadius: '8px',
      border: `1px solid ${theme.colors.border}`,
      background: theme.colors.background,
      color: theme.colors.error ?? theme.colors.textSecondary,
      fontSize: theme.fontSizes[0],
    }}
  >
    <AlertCircle size={14} />
    <span style={{ flex: 1, minWidth: 0 }} title={message}>
      {message}
    </span>
    <button
      type="button"
      onClick={onRetry}
      style={{
        padding: '4px 8px',
        borderRadius: '6px',
        border: `1px solid ${theme.colors.border}`,
        background: 'transparent',
        color: theme.colors.textSecondary,
        cursor: 'pointer',
        fontSize: theme.fontSizes[0],
      }}
    >
      Retry
    </button>
  </div>
);

const UnavailableState: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
  hasRepo: boolean;
}> = ({ theme, hasRepo }) => (
  <div
    style={{
      padding: '20px 4px',
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes[1],
    }}
  >
    {hasRepo
      ? 'This repository’s sequence diagrams aren’t accessible. Public repos are visible to everyone; private repos require signing in with an account that can read them.'
      : 'No repository selected.'}
  </div>
);

const EmptyState: React.FC<{ theme: ReturnType<typeof useTheme>['theme'] }> = ({
  theme,
}) => (
  <div
    style={{
      padding: '20px 4px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes[1],
    }}
  >
    <div>No shared diagrams for this repository yet.</div>
    <div style={{ fontSize: theme.fontSizes[0] }}>
      Use the desktop app&apos;s &ldquo;Share&rdquo; action on a saved
      sequence diagram to publish it here.
    </div>
  </div>
);
