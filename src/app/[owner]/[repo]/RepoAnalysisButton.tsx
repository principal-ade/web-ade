'use client';

/**
 * MVP test control for the Freestyle VM repo-analysis job.
 *
 * A floating button that POSTs to `/api/repo-analysis/{owner}/{repo}`, which
 * boots a VM, clones the repo, runs the in-VM git sweep, and returns per-file
 * line counts + a contributor ownership map. This is a retrieval test only — it
 * logs the full payload to the console and shows a one-line summary; nothing on
 * the map consumes it yet.
 */
import { useState } from 'react';

interface RepoAnalysisButtonProps {
  owner: string;
  repo: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; summary: string }
  | { kind: 'error'; message: string };

export function RepoAnalysisButton({ owner, repo }: RepoAnalysisButtonProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function run() {
    setState({ kind: 'running' });
    try {
      const res = await fetch(`/api/repo-analysis/${owner}/${repo}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      // The full payload is large — log it for inspection; show a summary.
      console.log('[repo-analysis]', data);
      const summary =
        `${data.fileCount} files, ${data.authorCount} authors, ` +
        `${data.totalLinesGlobal} blamed lines · ${Math.round(data.durationMs / 1000)}s`;
      setState({ kind: 'done', summary });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        fontSize: 12,
      }}
    >
      {state.kind === 'done' && (
        <div
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: '#9fe3a0',
            padding: '6px 10px',
            borderRadius: 6,
            maxWidth: 320,
          }}
        >
          {state.summary} — full map in console
        </div>
      )}
      {state.kind === 'error' && (
        <div
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: '#f0a0a0',
            padding: '6px 10px',
            borderRadius: 6,
            maxWidth: 320,
          }}
        >
          {state.message}
        </div>
      )}
      <button
        type="button"
        onClick={run}
        disabled={state.kind === 'running'}
        style={{
          background: state.kind === 'running' ? '#555' : '#2563eb',
          color: 'white',
          padding: '8px 14px',
          borderRadius: 8,
          border: 'none',
          cursor: state.kind === 'running' ? 'wait' : 'pointer',
          fontWeight: 600,
        }}
      >
        {state.kind === 'running' ? 'Analyzing repo…' : 'Analyze repo (VM)'}
      </button>
    </div>
  );
}
