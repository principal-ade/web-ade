'use client';

/**
 * TrailSequencePreview — experimental inline preview of a trail's
 * sequence diagram for the topic page.
 *
 * Given only a `trailId`, fetches the trail payload via /api/trails/by-id/{id},
 * picks the first sequence view, and renders the upstream
 * `SequenceDiagramRenderer` fed by `buildSequenceViewInputs` (re-exported
 * from `@industry-theme/file-city-panel`).
 *
 * Wrapped so the topic page is decoupled from the rendering choice: we
 * may later swap this for the full FileCityTrailExplorerPanel, an iframe,
 * or a more chromed variant without touching the topic page.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { buildSequenceViewInputs } from '@industry-theme/file-city-panel';
import type {
  TrailPayload,
  TrailSequenceView,
} from '@/lib/trails/types';

const SequenceDiagramRenderer = dynamic(
  () =>
    import('@principal-ai/principal-view-react').then(
      (m) => m.SequenceDiagramRenderer,
    ),
  { ssr: false },
);

export interface TrailSequencePreviewProps {
  trailId: string;
  /** Render height in px. Defaults to 320. */
  height?: number;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; payload: TrailPayload }
  | { kind: 'error'; message: string };

export function TrailSequencePreview({
  trailId,
  height = 320,
}: TrailSequencePreviewProps) {
  const { theme } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/trails/by-id/${encodeURIComponent(trailId)}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({
            kind: 'error',
            message: body?.error || `Failed to load trail (${res.status})`,
          });
          return;
        }
        setState({ kind: 'ok', payload: body.payload as TrailPayload });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to load trail',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trailId]);

  const sequenceView = useMemo<TrailSequenceView | null>(() => {
    if (state.kind !== 'ok') return null;
    const v = state.payload.views?.find((view) => view.kind === 'sequence');
    return (v as TrailSequenceView) ?? null;
  }, [state]);

  const inputs = useMemo(() => {
    if (state.kind !== 'ok' || !sequenceView) return null;
    return buildSequenceViewInputs(state.payload, sequenceView);
  }, [state, sequenceView]);

  const message = (text: string) => (
    <div
      className="flex items-center justify-center"
      style={{
        height,
        color: theme.colors.textMuted,
        fontSize: theme.fontSizes[1],
      }}
    >
      {text}
    </div>
  );

  if (state.kind === 'loading') return message('Loading sequence…');
  if (state.kind === 'error') return message(state.message);
  if (!inputs) return message('This trail has no sequence view.');

  return (
    <div style={{ height, width: '100%' }}>
      <SequenceDiagramRenderer
        events={inputs.events}
        edges={inputs.edges}
        layoutOptions={inputs.layoutOptions}
        width="100%"
        height="100%"
        showControls={false}
        showBackground={false}
        stickyHeaders
      />
    </div>
  );
}
